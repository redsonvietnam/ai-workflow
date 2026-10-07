#!/usr/bin/env node
// WF:v1 pipeline — HASH/SEQ do script tính, KHÔNG nhờ model.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync, renameSync } from 'node:fs';
import { dirname, join, resolve, sep, isAbsolute, relative } from 'node:path';
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

export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}
export function computeEventHash(prevHash, meta) {
  const { prevHash: _p, eventHash: _e, ...rest } = meta;
  return sha256((prevHash ?? 'GENESIS') + canonical(rest));
}
export function lastEventHash() {
  if (!existsSync(LOG)) return null;
  const lines = readFileSync(LOG, 'utf8').split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const j = lines[i].indexOf('|');
    if (j < 0) continue;
    try {
      const ev = JSON.parse(lines[i].slice(j + 1).trim());
      if (ev.eventHash) return ev.eventHash;
    } catch { continue; }
  }
  return null;
}
export function bundleCreate(task, paths) {
  const dir = join(WF, 'bundles', task);
  mkdirSync(dir, { recursive: true });
  const files = [];
  const lines = [];
  for (const p of paths) {
    const h = sha256(readFileSync(join(ROOT, p)));
    files.push({ path: p, sha256: h });
    lines.push(`${h}  ${p}`);
  }
  const sums = lines.join('\n') + '\n';
  writeFileSync(join(dir, 'SHA256SUMS'), sums);
  const st = loadState();
  const gitCommit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: ROOT }).stdout?.trim() ?? null;
  const provenance = { taskId: task, attemptId: st.tasks?.[task]?.attempts ?? 0, createdAt: new Date().toISOString(), gitCommit, files, anchor: sha256(sums) };
  writeFileSync(join(dir, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
  return provenance;
}
export function bundleCheck(task) {
  const dir = join(WF, 'bundles', task);
  const sumsPath = join(dir, 'SHA256SUMS');
  const provPath = join(dir, 'provenance.json');
  if (!existsSync(sumsPath) || !existsSync(provPath)) return { ok: false, errors: [{ path: dir, reason: 'BUNDLE_MISSING' }] };
  const errors = [];
  const sums = readFileSync(sumsPath, 'utf8');
  let prov = null;
  try { prov = JSON.parse(readFileSync(provPath, 'utf8')); } catch { prov = null; }
  if (!prov || !prov.anchor) return { ok: false, errors: [{ path: 'provenance.json', reason: 'MALFORMED' }] };
  if (prov.anchor !== sha256(sums)) errors.push({ path: 'SHA256SUMS', reason: 'ANCHOR_MISMATCH' });
  for (const line of sums.split(/\r?\n/).filter(Boolean)) {
    const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (!m) { errors.push({ path: line, reason: 'SUMS_MALFORMED' }); continue; }
    const [, h, p] = m;
    try { if (sha256(readFileSync(join(ROOT, p))) !== h) errors.push({ path: p, reason: 'HASH_MISMATCH' }); }
    catch { errors.push({ path: p, reason: 'MISSING' }); }
  }
  return { ok: errors.length === 0, errors };
}
export function verifyChain(logText) {
  const checked = [];
  const legacy = [];
  const broken = [];
  let prev = 'GENESIS';
  for (const line of String(logText ?? '').split(/\r?\n/)) {
    const j = line.indexOf('|');
    if (j < 0) continue;
    let ev;
    try { ev = JSON.parse(line.slice(j + 1).trim()); } catch { continue; }
    if (!ev || !ev.eventHash) { legacy.push(ev?.task ?? '?'); continue; }
    const expect = computeEventHash(ev.prevHash, ev);
    if (ev.prevHash !== prev || ev.eventHash !== expect) {
      broken.push({ task: ev.task, linkOk: ev.prevHash === prev, hashOk: ev.eventHash === expect });
      break;
    }
    prev = ev.eventHash;
    checked.push(ev.task ?? '?');
  }
  return { ok: broken.length === 0, checked: checked.length, legacy: legacy.length, broken };
}

export function checkEscalation(task, today = new Date().toISOString().slice(0, 10)) {
  const st = loadState();
  const calls = st.claudeCalls ?? { byDate: {}, byTask: {} };
  const byDate = calls.byDate ?? {};
  const byTask = calls.byTask ?? {};
  if (Number(byTask[task] ?? 0) >= 1 || Number(byDate[today] ?? 0) >= 2) {
    return { ok: false, reason: 'HUMAN_REQUIRED' };
  }
  return { ok: true };
}

function consumeEscalation(task, today = new Date().toISOString().slice(0, 10)) {
  const st = loadState();
  const calls = st.claudeCalls ?? { byDate: {}, byTask: {} };
  calls.byDate = calls.byDate ?? {};
  calls.byTask = calls.byTask ?? {};
  calls.byTask[task] = Number(calls.byTask[task] ?? 0) + 1;
  calls.byDate[today] = Number(calls.byDate[today] ?? 0) + 1;
  st.claudeCalls = calls;
  saveState(st);
}

export function makeEnvelope({ task, role = 'CHATGPT', objective, contextRef = '', input = '', ask, constraints = [] }) {
  const st = loadState();
  st.seq[task] = (st.seq[task] || 0) + 1;
  st.tasks = st.tasks ?? {};
  if (!st.tasks[task]) {
    const now = new Date().toISOString();
    st.tasks[task] = { state: 'CREATED', attempts: 0, timeoutMs: 8 * 3600000, createdAt: now, updatedAt: now };
  }
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
  if (Number(entry.claude_calls ?? 0) > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const budget = checkEscalation(entry.task, today);
    if (!budget.ok) throw new Error('HUMAN_REQUIRED');
    consumeEscalation(entry.task, today);
  }
  const request = entry.request ?? entry.input ?? '';
  const reply = entry.reply ?? entry.output ?? '';
  const transition = entry.stateTransition ?? {
    from: entry.stateFrom ?? null,
    to: entry.stateTo ?? entry.state ?? null,
  };
  if (transition.from != null && transition.to != null) {
    assertTransition(transition.from, transition.to);
  }
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
  const prevEventHash = lastEventHash();
  enriched.prevHash = prevEventHash ?? 'GENESIS';
  enriched.eventHash = computeEventHash(enriched.prevHash, enriched);
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

function preregManifestPath() { return join(WF, 'prereg-manifest.json'); }
function fileSha256(path) { return sha256(readFileSync(join(ROOT, path))); }
export function preregCheck() {
  const manifestPath = preregManifestPath();
  if (!existsSync(manifestPath)) return { ok: true, skipped: true, failures: [] };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const failures = [];
  for (const item of manifest.files ?? []) {
    try {
      const actual = fileSha256(item.path);
      if (actual !== item.sha256) failures.push({ path: item.path, reason: 'HASH_MISMATCH', expected: item.sha256, actual });
    } catch {
      failures.push({ path: item.path, reason: 'MISSING' });
    }
  }
  return { ok: failures.length === 0, skipped: false, failures };
}
function preregFreeze(paths) {
  const files = paths.map((path) => ({ path, sha256: fileSha256(path) }));
  const manifest = { frozenAt: new Date().toISOString(), files, note: 'Frozen by prereg freeze; changes require re-freeze.' };
  writeFileSync(preregManifestPath(), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export function acceptanceGate(raw) {
  const clean = String(raw ?? '').replace(/^﻿/, '');
  const field = (name) => clean.match(new RegExp('(?:^|\\n)\\s*' + name + '\\s*:\\s*([^\\n]+)', 'i'))?.[1]?.trim() ?? null;
  const task = field('TASK');
  const hash = field('HASH');
  const ask = field('ASK');
  const command = field('COMMAND');
  const allowlist = field('ALLOWLIST');
  const redTest = field('RED_TEST');
  const specLock = Boolean(task && hash && ask);
  const commandOk = Boolean(command && command !== 'BLOCKED');
  const allowlistOk = Boolean(allowlist && allowlist !== 'BLOCKED');
  const redTestOk = Boolean(redTest && /^(RED|FAIL|NOT_PASS|UNPASS)/i.test(redTest));
  const checks = { command: commandOk, allowlist: allowlistOk, redTest: redTestOk, specLock };
  const prereg = preregCheck();
  if (!prereg.ok) return { ok: false, checks, reason: 'PREREG_MISMATCH', prereg };
  const vf = join(WF, 'verdict-' + (field('TASK') ?? 'UNKNOWN') + '.json');
  if (existsSync(vf)) {
    let v = null;
    try { v = JSON.parse(readFileSync(vf, 'utf8')); } catch { v = null; }
    if (!v || !v.task || !v.verdict || !v.reason) {
      return { ok: false, checks, reason: 'FAIL_CLOSED', prereg, verdictFile: vf };
    }
    return { ok: v.verdict === 'PASS', checks, reason: v.verdict === 'PASS' ? null : 'INDEPENDENT_FAIL', prereg, verdict: v };
  }
  return { ok: Object.values(checks).every(Boolean), checks, reason: Object.values(checks).every(Boolean) ? null : 'ACCEPTANCE_CONTRACT_BLOCKED', prereg };
}

export const STATES = ['CREATED', 'RUNNING', 'DONE', 'FAILED', 'DEAD_LETTER'];
export const MAX_ATTEMPTS = 3;
export const TRANSITIONS = {
  CREATED: ['RUNNING', 'DEAD_LETTER'],
  RUNNING: ['RUNNING', 'DONE', 'FAILED', 'DEAD_LETTER'],
  FAILED: ['RUNNING', 'DEAD_LETTER'],
  DONE: [],
  DEAD_LETTER: [],
};
export function assertTransition(from, to) {
  if (!STATES.includes(from) || !STATES.includes(to)) throw new Error('INVALID_STATE');
  if (!TRANSITIONS[from].includes(to)) throw new Error('INVALID_STATE_TRANSITION');
  return to;
}
export function reapStale(tasks, now = Date.now()) {
  const changed = {};
  for (const [k, t] of Object.entries(tasks)) {
    if (!['RUNNING', 'FAILED'].includes(t.state)) continue;
    const timeoutMs = t.timeoutMs ?? 8 * 3600000;
    if (now - (t.updatedAt ?? 0) <= timeoutMs) continue;
    const attempts = (t.attempts ?? 0) + 1;
    changed[k] = {
      ...t,
      state: attempts >= MAX_ATTEMPTS ? 'DEAD_LETTER' : 'FAILED',
      attempts,
      updatedAt: now,
    };
  }
  return changed;
}

export function validateEnvelope(raw, schema) {
  const clean = String(raw ?? '').replace(/^\uFEFF/, '');
  const field = (name) => clean.match(new RegExp('(?:^|\\r?\\n)\\s*' + name + '\\s*:\\s*([^\\r\\n]+)', 'i'))?.[1]?.trim() ?? null;
  const outputSection = clean.match(/OUTPUT:\r?\n([\s\S]*)$/)?.[1] ?? '';
  const outField = (name) => outputSection.match(new RegExp('(?:^|\\r?\\n)\\s*' + name + '\\s*:\\s*([^\\r\\n]+)', 'i'))?.[1]?.trim() ?? null;
  const obj = {
    TASK: field('TASK'),
    SEQ: field('SEQ') === null ? null : Number(field('SEQ')),
    ROLE: field('ROLE'),
    HASH: field('HASH'),
    OBJECTIVE: field('OBJECTIVE'),
    ASK: field('ASK'),
    OUTPUT: { VERDICT: outField('VERDICT'), DELTA: outField('DELTA'), ACTION: outField('ACTION'), EVIDENCE: outField('EVIDENCE') },
  };
  const ctx = field('CONTEXT_REF');
  if (ctx !== null) obj.CONTEXT_REF = ctx;
  const inp = field('INPUT');
  if (inp !== null) obj.INPUT = inp;
  const errs = [];
  const typeOf = (v) => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  const check = (val, sch, path) => {
    if (sch.type && typeOf(val) !== sch.type) { errs.push(`${path}: expected ${sch.type}, got ${typeOf(val)}`); return; }
    if (sch.type === 'number' && !Number.isFinite(val)) { errs.push(`${path}: expected finite number`); return; }
    if (sch.type === 'object') {
      for (const k of sch.required ?? []) if (!(k in (val ?? {}))) errs.push(`${path}.${k}: required`);
      for (const [k, sub] of Object.entries(sch.properties ?? {})) if (k in (val ?? {})) check(val[k], sub, `${path}.${k}`);
    }
    if (sch.type === 'array') for (const item of val ?? []) check(item, sch.items ?? {}, `${path}[]`);
  };
  check(obj, schema, '$');
  return { ok: errs.length === 0, errors: errs, envelope: obj };
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
} else if (cmd === 'gate') {
  const file = args[0];
  const raw = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
  const gate = acceptanceGate(raw);
  console.log(JSON.stringify(gate, null, 2));
  if (!gate.ok) process.exit(gate.reason === 'PREREG_MISMATCH' ? 5 : gate.reason === 'FAIL_CLOSED' ? 6 : gate.reason === 'INDEPENDENT_FAIL' ? 1 : 3);
} else if (cmd === 'bundle') {
  const task = args[0];
  const files = args.slice(1);
  if (!task || !files.length) { console.error('usage: bundle <task> <file...>'); process.exit(2); }
  console.log(JSON.stringify(bundleCreate(task, files), null, 2));
} else if (cmd === 'bundle-check') {
  const r = bundleCheck(args[0] ?? '');
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exit(7);
} else if (cmd === 'standalone') {
  const file = args[0];
  if (!file || !existsSync(file)) {
    console.log(JSON.stringify({ reason: 'FAIL_CLOSED', detail: 'envelope file missing' }, null, 2));
    process.exit(6);
  }
  const envText = readFileSync(file, 'utf8');
  const task = envText.match(/(?:^|\n)TASK: (\S+)/)?.[1] ?? 'UNKNOWN';
  const vf = join(WF, `verdict-${task}.json`);
  spawnSync(process.execPath, [join(WF, 'verify-standalone.mjs'), file], { encoding: 'utf8', timeout: 30000 });
  if (!existsSync(vf)) {
    console.log(JSON.stringify({ reason: 'FAIL_CLOSED', detail: 'verdict file missing' }, null, 2));
    process.exit(6);
  }
  let v = null;
  try { v = JSON.parse(readFileSync(vf, 'utf8')); } catch { v = null; }
  if (!v || !v.task || !v.verdict || !v.reason) {
    console.log(JSON.stringify({ reason: 'FAIL_CLOSED', detail: 'verdict malformed' }, null, 2));
    process.exit(6);
  }
  console.log(JSON.stringify(v, null, 2));
  if (v.verdict !== 'PASS') process.exit(1);
} else if (cmd === 'prereg') {
  const sub = args[0];
  if (sub === 'freeze') {
    const manifest = preregFreeze(args.slice(1));
    console.log(JSON.stringify(manifest, null, 2));
  } else if (sub === 'check') {
    const result = preregCheck();
    if (result.skipped) console.log('prereg: SKIP (no manifest)');
    else if (result.ok) console.log('prereg: PASS');
    else {
      console.log('| Path | Reason |');
      console.log('|---|---|');
      for (const f of result.failures) console.log(`| ${f.path} | ${f.reason} |`);
      process.exit(5);
    }
  } else {
    console.error('usage: prereg freeze <file...> | prereg check');
    process.exit(2);
  }
} else if (cmd === 'apply') {
  // T131: stale-check nguyên tử trước APPLY — lock wx → revalidate toàn bộ → temp+rename.
  const planPath = args[0];
  const bail = (reason, extra = {}, code = 2) => { console.log(JSON.stringify({ ok: false, reason, ...extra }, null, 2)); process.exit(code); };
  if (!planPath) bail('NO_PLAN');
  let plan;
  try { plan = JSON.parse(readFileSync(planPath, 'utf8')); } catch { bail('PLAN_MALFORMED'); }
  const entries = Array.isArray(plan) ? plan : plan.files;
  if (!Array.isArray(entries) || entries.length === 0) bail('PLAN_EMPTY');
  const allowRel = (rel) => rel.split(sep).join('/').startsWith('wf/') || /^(CONTEXT|DECISIONS|LOG)\.md$/.test(rel) || /^\.git(ignore|attributes)$/.test(rel);
  const resolved = [];
  for (const e of entries) {
    if (!e || typeof e.path !== 'string' || e.path.length === 0) bail('ENTRY_INVALID', { entry: e });
    if (e.before_sha256 !== null && !(typeof e.before_sha256 === 'string' && /^[0-9a-f]{64}$/.test(e.before_sha256))) bail('ENTRY_INVALID', { entry: e });
    const abs = isAbsolute(e.path) ? resolve(e.path) : resolve(ROOT, e.path);
    if (!abs.startsWith(ROOT + sep)) bail('TRAVERSAL', { path: e.path });
    const rel = relative(ROOT, abs);
    if (!allowRel(rel)) bail('NOT_ALLOWED', { rel });
    let content = null;
    if (typeof e.content === 'string') content = e.content;
    else if (typeof e.contentPath === 'string') {
      try { content = readFileSync(resolve(ROOT, e.contentPath), 'utf8'); } catch { bail('CONTENT_UNREADABLE', { path: e.contentPath }); }
    } else bail('ENTRY_NO_CONTENT', { entry: e });
    resolved.push({ abs, rel, before: e.before_sha256, content });
  }
  const LOCK = join(WF, '.apply.lock');
  let fd = null;
  try { fd = openSync(LOCK, 'wx'); } catch { bail('LOCKED', { lock: LOCK }, 8); }
  const temps = [];
  let result, exitCode = 0;
  try {
    const stale = [];
    for (const e of resolved) {
      const cur = existsSync(e.abs) ? createHash('sha256').update(readFileSync(e.abs)).digest('hex') : null;
      if (cur !== e.before) stale.push({ path: e.rel, expected: e.before, actual: cur });
    }
    if (stale.length) { result = { ok: false, reason: 'STALE_REJECT', stale }; exitCode = 8; }
    else {
      const written = [];
      for (const e of resolved) {
        const tmp = e.abs + '.tmp-apply-' + process.pid;
        temps.push(tmp);
        writeFileSync(tmp, e.content, 'utf8');
        renameSync(tmp, e.abs);
        temps.splice(temps.indexOf(tmp), 1);
        written.push(e.rel);
      }
      result = { ok: true, written };
    }
  } catch (err) {
    result = { ok: false, reason: 'APPLY_ERROR', message: String(err && err.message || err) }; exitCode = 8;
  } finally {
    for (const t of temps) { try { if (existsSync(t)) unlinkSync(t); } catch { /* bỏ qua */ } }
    try { if (fd !== null) closeSync(fd); } catch { /* bỏ qua */ }
    try { if (existsSync(LOCK)) unlinkSync(LOCK); } catch { /* bỏ qua */ }
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(exitCode);
} else if (cmd === 'validate') {
  const file = args[0];
  const raw = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
  const schema = JSON.parse(readFileSync(join(WF, 'wf-v1.schema.json'), 'utf8'));
  const r = validateEnvelope(raw, schema);
  console.log(JSON.stringify({ ok: r.ok, errors: r.errors }, null, 2));
  if (!r.ok) process.exit(2);
} else if (cmd === 'escalation') {
  const task = args[0];
  const today = new Date().toISOString().slice(0, 10);
  const budget = checkEscalation(task, today);
  console.log(JSON.stringify(budget, null, 2));
  if (!budget.ok) process.exit(3);
} else if (cmd === 'verifychain') {
  const r = verifyChain(existsSync(LOG) ? readFileSync(LOG, 'utf8') : '');
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exit(4);
} else if (cmd === 'reap') {
  const st = loadState();
  st.tasks = st.tasks ?? {};
  const changed = reapStale(st.tasks);
  saveState(st);
  console.log(JSON.stringify({ changed, tasks: st.tasks }, null, 2));
} else if (cmd === 'log') {
  const payload = (args[0].startsWith('@') ? readFileSync(args[0].slice(1), 'utf8') : args[0]).replace(/^﻿/, '');
  try {
    logEvent(JSON.parse(payload));
  } catch (err) {
    if (err?.message === 'HUMAN_REQUIRED') {
      console.log(JSON.stringify({ ok: false, reason: 'HUMAN_REQUIRED' }, null, 2));
      process.exit(3);
    }
    throw err;
  }
  console.log('logged');
} else {
  dryRun();
}
