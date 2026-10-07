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
export function parseResponse(raw) {
  const out = { ok: false, verdict: null, delta: null, action: null, evidence: null, chars: raw.length, hash: sha256(raw).slice(0, 16) };
  const clean = raw.replace(/\*\*/g, '').replace(/^#{1,6}\s*/gm, '');
  const vm = clean.match(/\bVERDICT\b[\s:\-–—]{0,12}\b(PASS|FAIL|UNCERTAIN)\b/i)
    || clean.match(/\b(PASS|FAIL|UNCERTAIN)\b(?=[\s,.)]|$)/i);
  if (!vm) { out.reason = 'VERDICT missing — needs retry'; return out; }
  out.verdict = vm[1].toUpperCase();
  const grab = (name) => {
    const m = clean.match(new RegExp(name + '[\\s:\\-–—]{0,12}([^\\n]+)', 'i'));
    return m ? m[1].trim() : null;
  };
  out.delta = grab('DELTA');
  out.action = grab('ACTION');
  out.evidence = grab('EVIDENCE');
  out.ok = true;
  return out;
}

export function logEvent(entry) {
  const line = `- ${new Date().toISOString()} | ${JSON.stringify(entry)}\n`;
  const prev = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '# LOG\n';
  writeFileSync(LOG, prev + line);
}

function dryRun() {
  const fixtures = [
    { name: 'clean', expect: 'PASS', raw: 'VERDICT: PASS\nDELTA: model đồng ý\nACTION: deploy\nEVIDENCE: test/ok' },
    { name: 'noisy-md', expect: 'PASS', raw: '## Đánh giá\n**Verdict:** PASS\n- **DELTA:** thêm 2 ghi chú\n- **ACTION:** merge\n- **EVIDENCE:** commit abc123' },
    { name: 'incomplete', expect: 'RETRY', raw: 'Phân tích xong nhưng output bị cắt giữa chừng...' },
  ];
  let pass = 0;
  const results = [];
  for (const round of [1, 2]) {
    const r = fixtures.map(f => {
      const p = parseResponse(f.raw);
      const got = f.expect === 'RETRY' ? (p.ok ? 'WRONG' : 'RETRY') : p.verdict;
      return { name: f.name, got, ok: got === f.expect };
    });
    results.push(r);
    pass += r.filter(x => x.ok).length;
  }
  const deterministic = JSON.stringify(results[0]) === JSON.stringify(results[1]);
  const total = fixtures.length * 2;
  const ok = pass === total && deterministic;
  console.log(JSON.stringify({ dryrun: ok ? 'PASS' : 'FAIL', passed: `${pass}/${total}`, deterministic, results: results[0] }, null, 2));
  if (!ok) process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'make') {
  const o = Object.fromEntries(args.map(a => a.split('=')));
  const { envelope, hash, seq } = makeEnvelope({ task: o.task, objective: o.objective, ask: o.ask, input: o.input || '', contextRef: o.contextRef || '' });
  console.log(envelope);
  console.error(`HASH=${hash} SEQ=${seq}`);
} else if (cmd === 'parse') {
  const raw = args[0] === '-' ? readFileSync(0, 'utf8') : readFileSync(args[0], 'utf8');
  const p = parseResponse(raw);
  console.log(JSON.stringify(p, null, 2));
  if (!p.ok) process.exit(2);
} else if (cmd === 'log') {
  logEvent(JSON.parse(args[0]));
  console.log('logged');
} else {
  dryRun();
}
