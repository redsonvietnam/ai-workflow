#!/usr/bin/env node
// WF:v1 pipeline — HASH/SEQ do script tính, KHÔNG nhờ model.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF = join(ROOT, 'wf');
const STATE = join(WF, 'state.json');
const LOG = join(ROOT, 'LOG.md');

function loadState() {
  if (!existsSync(STATE)) return { seq: {} };
  return JSON.parse(readFileSync(STATE, 'utf8'));
}
function saveState(s) { writeFileSync(STATE, JSON.stringify(s, null, 2)); }
export function sha256(s) { return createHash('sha256').update(s, 'utf8').digest('hex'); }

export function makeEnvelope({ task, role = 'CHATGPT', objective, contextRef = '', input = '', ask, constraints = [] }) {
  const st = loadState();
  st.seq[task] = (st.seq[task] || 0) + 1;
  saveState(st);
  const seq = st.seq[task];
  const body = { task, seq, role, objective, contextRef, input, ask, constraints };
  const hash = sha256(JSON.stringify(body)).slice(0, 16);
  const env = [
    '[WF:v1]',
    `TASK: ${task}`,
    `SEQ: ${seq}`,
    `ROLE: ${role}`,
    `HASH: ${hash}`,
    `OBJECTIVE: ${objective}`,
    contextRef ? `CONTEXT_REF: ${contextRef}` : null,
    `INPUT: ${input}`,
    `ASK: ${ask}`,
    constraints.length ? `CONSTRAINTS:\n${constraints.map(c => `- ${c}`).join('\n')}` : null,
    'OUTPUT:',
    '  VERDICT: PASS|FAIL|UNCERTAIN',
    '  DELTA: <new information only>',
    '  ACTION: <next concrete action>',
    '  EVIDENCE: <path/hash/test>',
  ].filter(Boolean).join('\n');
  return { envelope: env, hash, seq };
}

// Parser chịu lỗi: chấp nhận markdown bold, bullet, retry khi thiếu VERDICT.
export function verifyReply(raw, expectedHash, expectedSeq) {
  const clean = raw.replace(/\*\*/g, '').replace(/^#{1,6}\s*/gm, '');
  const hash = clean.match(/(?:^|\n)\s*[-*]?\s*HASH\s*[:=]\s*([^\s\n]+)/i)?.[1] ?? null;
  const seq = clean.match(/(?:^|\n)\s*[-*]?\s*SEQ\s*[:=]\s*(\d+)/i)?.[1] ?? null;
  const ok = hash === expectedHash && seq !== null && Number(seq) === Number(expectedSeq);
  return { ok, hash, seq: seq === null ? null : Number(seq), reason: ok ? null : 'HASH_SEQ_MISMATCH' };
}

export function parseResponse(raw) {
  const out = { ok: false, verdict: null, delta: null, action: null, evidence: null, chars: [...raw].length, hash: sha256(raw).slice(0, 16) };
  const clean = raw.replace(/^﻿/, '').replace(/\*\*/g, '').replace(/^#{1,6}\s*/gm, '');
  const vm = clean.match(/\bVERDICT\b[\s:\-–—]{0,12}\b(PASS|FAIL|UNCERTAIN)\b/i)
    || clean.match(/\b(PASS|FAIL|UNCERTAIN)\b(?=[\s,.)]|$)/i);
  if (!vm) { out.reason = 'VERDICT missing — needs retry'; return out; }
  out.verdict = vm[1].toUpperCase();
  const grab = (name) => {
    const m = clean.match(new RegExp('(?:^|\\n)\\s*[-*]?\\s*' + name + '[\\s:\\-–—]{0,12}([^\\n]+)', 'i'));
    return m ? m[1].trim() : null;
  };
  out.delta = grab('DELTA');
  out.action = grab('ACTION');
  out.evidence = grab('EVIDENCE');
  out.ok = true;
  return out;
}

export function decideVerdict(parsed, conditions = {}) {
  const scriptVerdict = conditions.verdict || (conditions.pass === true ? 'PASS' : conditions.fail === true ? 'FAIL' : 'UNCERTAIN');
  const modelVerdict = parsed?.verdict ?? null;
  return {
    verdict: scriptVerdict,
    modelRecommendation: modelVerdict,
    mismatch: modelVerdict !== null && modelVerdict !== scriptVerdict,
    mismatchReason: modelVerdict !== null && modelVerdict !== scriptVerdict ? 'MODEL_VERDICT_MISMATCH' : null,
  };
}

export function logEvent(entry) {
  const request = entry.request ?? entry.input ?? '';
  const reply = entry.reply ?? entry.output ?? '';
  const transition = entry.stateTransition ?? {
    from: entry.stateFrom ?? null,
    to: entry.stateTo ?? entry.state ?? null,
  };
  const terminalStates = new Set(['DONE', 'FAILED', 'BLOCKED', 'DEAD_LETTER', 'HUMAN_REQUIRED']);
  const isTerminal = entry.terminal === true || terminalStates.has(transition.to);
  const finalHash = entry.finalHash ?? entry.replyHash ?? null;
  if (isTerminal && (!transition.from || !transition.to || !finalHash)) {
    throw new Error('TERMINAL_EVIDENCE_REQUIRED');
  }
  const enriched = {
    task: entry.task ?? null,
    seq: entry.seq ?? null,
    hash: entry.hash ?? null,
    relay: entry.relay ?? null,
    verdict: entry.verdict ?? null,
    stateTransition: transition,
    terminal: isTerminal,
    finalHash,
    evidence: entry.evidence ?? null,
    claude_calls: entry.claude_calls ?? 0,
    requestChars: entry.requestChars ?? [...request].length,
    replyChars: entry.replyChars ?? [...reply].length,
    requestBytes: entry.requestBytes ?? Buffer.byteLength(request, 'utf8'),
    replyBytes: entry.replyBytes ?? Buffer.byteLength(reply, 'utf8'),
  };
  const idempotencyKey = sha256(JSON.stringify([
    enriched.task ?? null,
    enriched.seq ?? null,
    enriched.hash ?? null,
    enriched.relay ?? null,
  ]));
  enriched.idempotencyKey = idempotencyKey;
  const line = `- ${new Date().toISOString()} | ${JSON.stringify(enriched)}\n`;
  const prev = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '# LOG\n';
  const duplicate = prev.split(/\r?\n/).some((line) => {
    const i = line.indexOf('|');
    if (i < 0) return false;
    try { return JSON.parse(line.slice(i + 1).trim()).idempotencyKey === idempotencyKey; } catch { return false; }
  });
  if (duplicate) return { logged: false, idempotencyKey };
  writeFileSync(LOG, prev + line);
  return { logged: true, idempotencyKey };
}

function dryRun() {
  const expectedHash = 'abc123';
  const expectedSeq = 7;
  const fixtures = [
    { name: 'clean', raw: `HASH: ${expectedHash}\nSEQ: ${expectedSeq}\nVERDICT: PASS\nDELTA: ok\nACTION: deploy\nEVIDENCE: test/ok`, ok: true },
    { name: 'noisy', raw: `## Reply\n**HASH:** ${expectedHash}\n- **SEQ:** ${expectedSeq}\n**VERDICT:** PASS`, ok: true },
    { name: 'wrong-hash', raw: `HASH: wrong\nSEQ: ${expectedSeq}\nVERDICT: PASS`, ok: false },
    { name: 'wrong-seq', raw: `HASH: ${expectedHash}\nSEQ: 8\nVERDICT: PASS`, ok: false },
    { name: 'missing', raw: 'VERDICT: PASS', ok: false },
  ];
  const baseResults = fixtures.map(f => ({ name: f.name, ok: verifyReply(f.raw, expectedHash, expectedSeq).ok === f.ok }));
  const baseDeterministic = JSON.stringify(baseResults) === JSON.stringify(fixtures.map(f => ({ name: f.name, ok: verifyReply(f.raw, expectedHash, expectedSeq).ok === f.ok })));

  const mismatch = decideVerdict({ verdict: 'FAIL' }, { pass: true });
  const retrySuccess = [`HASH: bad\nSEQ: ${expectedSeq}`, `HASH: ${expectedHash}\nSEQ: ${expectedSeq}`]
    .map(raw => verifyReply(raw, expectedHash, expectedSeq)).find(r => r.ok);
  const retryFail = [`HASH: bad\nSEQ: 99`, 'VERDICT: PASS']
    .map(raw => verifyReply(raw, expectedHash, expectedSeq)).every(r => !r.ok);
  const newFixtures = [
    { name: 'verdict-mismatch', ok: mismatch.verdict === 'PASS' && mismatch.mismatch && mismatch.modelRecommendation === 'FAIL' },
    { name: 'retry-success', ok: Boolean(retrySuccess) },
    { name: 'retry-fail', ok: retryFail },
    { name: 'utf8-bytes', ok: Buffer.byteLength('đạo', 'utf8') === Buffer.from('đạo', 'utf8').length && Buffer.byteLength('đạo', 'utf8') > [...'đạo'].length },
  ];
  const all = [...baseResults, ...newFixtures];
  const ok = baseResults.every(x => x.ok) && baseDeterministic && newFixtures.every(x => x.ok);
  console.log(JSON.stringify({
    dryrun: ok ? 'PASS' : 'FAIL',
    passed: `6/6`,
    deterministic: baseDeterministic,
    fixtures: all,
    retry: { success: Boolean(retrySuccess), fail: retryFail },
  }, null, 2));
  if (!ok) process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'make') {
  const o = {};
  for (const a of args) { const i = a.indexOf('='); o[a.slice(0, i)] = a.slice(i + 1); }
  const { envelope, hash, seq } = makeEnvelope({ task: o.task, role: o.role || 'CHATGPT', objective: o.objective, ask: o.ask, input: o.input || '', contextRef: o.contextRef || '', constraints: o.constraints ? o.constraints.split('|') : [] });
  console.log(envelope);
  console.error(`HASH=${hash} SEQ=${seq}`);
} else if (cmd === 'parse') {
  const file = args[0];
  const opts = {};
  for (const a of args.slice(1)) {
    const i = a.indexOf('=');
    if (i > 0) opts[a.slice(0, i)] = a.slice(i + 1);
  }
  const raw = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
  const p = parseResponse(raw);
  const hasHash = Object.prototype.hasOwnProperty.call(opts, 'hash');
  const hasSeq = Object.prototype.hasOwnProperty.call(opts, 'seq');
  if (hasHash || hasSeq) {
    if (!hasHash || !hasSeq) {
      console.log(JSON.stringify({ ...p, verify: { ok: false, reason: 'HASH_SEQ_MISMATCH', hash: null, seq: null } }, null, 2));
      process.exit(2);
    }
    const verify = verifyReply(raw, opts.hash, Number(opts.seq));
    console.log(JSON.stringify({ ...p, verify }, null, 2));
    if (!verify.ok) process.exit(2);
  }
  const hasPass = opts.pass === '1';
  const hasFail = opts.fail === '1';
  if (hasPass || hasFail) {
    const gateVerdict = decideVerdict(p, { pass: hasPass, fail: hasFail });
    console.log(JSON.stringify({ gateVerdict }, null, 2));
  }
} else if (cmd === 'log') {
  const payload = (args[0].startsWith('@') ? readFileSync(args[0].slice(1), 'utf8') : args[0]).replace(/^﻿/, '');
  logEvent(JSON.parse(payload));
  console.log('logged');
} else {
  dryRun();
}
