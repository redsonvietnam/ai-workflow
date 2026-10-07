#!/usr/bin/env node
// Independent verifier (T126): khong import pipeline.mjs — tu tinh hash, tu xac dinh verdict.
// Nhan: node wf/verify-standalone.mjs <envelope-file>
// Ket qua: wf/verdict-<task>.json {task, verdict, reason, checkedAt} — orchestrator chi DOC.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WF = dirname(fileURLToPath(import.meta.url));
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

function field(text, name) {
  const m = text.match(new RegExp('(?:^|\\n)' + name + ': ([^\\n]*)'));
  return m ? m[1].replace(/\r$/, '') : null;
}
function emit(task, verdict, reason) {
  const out = { task: task ?? 'UNKNOWN', verdict, reason, checkedAt: new Date().toISOString() };
  writeFileSync(join(WF, `verdict-${out.task}.json`), JSON.stringify(out, null, 2) + '\n');
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

const file = process.argv[2];
if (!file) {
  const t = 'UNKNOWN';
  writeFileSync(join(WF, `verdict-${t}.json`), JSON.stringify({ task: t, verdict: 'FAIL', reason: 'NO_INPUT', checkedAt: new Date().toISOString() }, null, 2) + '\n');
  process.exit(0);
}
const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/^\uFEFF/, '');
const task = field(text, 'TASK');

if (!text.startsWith('[WF:v1]') || !task) emit(task, 'FAIL', 'MALFORMED_ENVELOPE');

const seqRaw = field(text, 'SEQ');
const hash = field(text, 'HASH');
const role = field(text, 'ROLE');
const objective = field(text, 'OBJECTIVE');
const contextRef = field(text, 'CONTEXT_REF') ?? '';
const input = field(text, 'INPUT') ?? '';
const ask = field(text, 'ASK') ?? '';
const constraintsBlock = text.match(/\nCONSTRAINTS:\n([\s\S]*?)\nOUTPUT:/);
const constraints = constraintsBlock ? constraintsBlock[1].split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)) : [];

if (seqRaw === null || !/^\d+$/.test(seqRaw)) emit(task, 'FAIL', 'SEQ_INVALID');
if (!/^[0-9a-f]{16}$/.test(hash ?? '')) emit(task, 'FAIL', 'HASH_FORMAT_INVALID');

const body = { task, seq: Number(seqRaw), role, objective, contextRef, input, ask, constraints };
const expected = sha256(JSON.stringify(body)).slice(0, 16);
if (expected !== hash) emit(task, 'FAIL', `HASH_MISMATCH expected=${expected}`);

emit(task, 'PASS', 'ENVELOPE_INTEGRITY_OK');
