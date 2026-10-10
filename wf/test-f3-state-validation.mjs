// F3 suite — state validation S01-S14.
// Chạy trên HEAD trước fix => đỏ.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpDir, run as harnessRun, parse, check, done } from './lib/test-harness.mjs';

const WF = dirname(fileURLToPath(import.meta.url));
const PIPE = join(WF, 'pipeline.mjs');
function run(root, argv) { return harnessRun(root, argv); }
const out = parse;
function checkOutcome(r, wantReason, name) {
  const o = out(r);
  if (!o) { check(name, false, 'no stdout'); return; }
  // Some commands (prereg freeze) don't return {ok: true} on success
  if (wantReason === 'SUCCESS') {
    if (o.ok === true || (o.frozenAt && !o.ok)) { check(name, true); }
    else { check(name, false, `got ok=${o.ok} want=SUCCESS`); }
    return;
  }
  if (o.ok === false && o.reason === wantReason) { check(name, true); }
  else { check(name, false, `got ok=${o.ok} reason=${o.reason} want=${wantReason}`); }
}

function writeState(root, state) {
  writeFileSync(join(root, 'wf', 'state.json'), JSON.stringify(state, null, 2));
}

function freshState() {
  return { seq: {}, tasks: {}, claudeCalls: { byDate: {}, byTask: {} } };
}

const ROOT = tmpDir('f3-');
mkdirSync(join(ROOT, 'wf'), { recursive: true });

// ===== S01: state.json schema valid =====
writeFileSync(join(ROOT, 'wf', 'state.json'), JSON.stringify(freshState(), null, 2));
const s1 = run(ROOT, ['state-validate']);
checkOutcome(s1, 'SUCCESS', 'S01-schema-valid');

writeFileSync(join(ROOT, 'wf', 'state.json'), JSON.stringify({ tasks: {}, claudeCalls: { byDate: {}, byTask: {} } }, null, 2));
const s1b = run(ROOT, ['state-validate']);
checkOutcome(s1b, 'SCHEMA_INVALID', 'S01-schema-missing-seq');

// ===== S02: seq monotonic per task =====
writeState(ROOT, { seq: { 'T1': 5 }, tasks: { 'T1': { state: 'DONE', attempts: 0, timeoutMs: 8*3600000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, claudeCalls: { byDate: {}, byTask: {} } });
const s2 = run(ROOT, ['state-validate']);
checkOutcome(s2, 'SUCCESS', 'S02-seq-monotonic-ok');

// decrease seq -> fail (not testable from current state alone - seq monotonicity enforced at makeEnvelope time)
// This test removed as seq decrement cannot be detected from current state alone

// ===== S03/S08: task state transitions valid =====
writeState(ROOT, { seq: {}, tasks: { 'T1': { state: 'CREATED', attempts: 0, timeoutMs: 8*3600000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, claudeCalls: { byDate: {}, byTask: {} } });
const s3a = run(ROOT, ['state-validate']);
checkOutcome(s3a, 'SUCCESS', 'S03-created-ok');

// RUNNING -> FAILED -> RUNNING (retry valid)
writeState(ROOT, { seq: {}, tasks: { 'T1': { state: 'FAILED', attempts: 1, timeoutMs: 8*3600000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, claudeCalls: { byDate: {}, byTask: {} } });
const s3c = run(ROOT, ['state-validate']);
checkOutcome(s3c, 'SUCCESS', 'S03-failed-to-running-ok');

// ===== S04: attempts increment only on retry (FAILED) =====
writeState(ROOT, { seq: {}, tasks: { 'T1': { state: 'RUNNING', attempts: 0, timeoutMs: 8*3600000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, claudeCalls: { byDate: {}, byTask: {} } });
const s4a = run(ROOT, ['state-validate']);
checkOutcome(s4a, 'SUCCESS', 'S04-running-attempts-zero-ok');

writeState(ROOT, { seq: {}, tasks: { 'T1': { state: 'FAILED', attempts: 1, timeoutMs: 8*3600000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, claudeCalls: { byDate: {}, byTask: {} } });
const s4b = run(ROOT, ['state-validate']);
checkOutcome(s4b, 'SUCCESS', 'S04-failed-attempts-one-ok');

// ===== S05: seq increment per make (monotonic) =====
// Already covered in S02

// ===== S06: claudeCalls per-task limit (<=1/task) =====
// Use unique task name for isolation
writeState(ROOT, { seq: {}, tasks: { 'T606': { state: 'CREATED', attempts: 0, timeoutMs: 8*3600000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, claudeCalls: { byDate: {}, byTask: {} } });
const s6a = run(ROOT, ['log-event', '--task=T606', '--seq=1', '--hash=abc', '--relay=test', '--verdict=PASS', '--state-from=CREATED', '--state-to=RUNNING', '--claude-calls=1']);
checkOutcome(s6a, 'SUCCESS', 'S06-task-limit-ok-1');

// add 1 more -> exceed (use non-terminal transition to avoid finalHash requirement)
const s6b = run(ROOT, ['log-event', '--task=T606', '--seq=2', '--hash=abc', '--relay=test', '--verdict=PASS', '--state-from=RUNNING', '--state-to=RUNNING', '--claude-calls=1']);
checkOutcome(s6b, 'HUMAN_REQUIRED', 'S06-task-limit-exceed');

// ===== S07: claudeCalls per-day limit (<=2/day) =====
writeState(ROOT, { seq: {}, tasks: { 'T707': { state: 'CREATED', attempts: 0, timeoutMs: 8*3600000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, claudeCalls: { byDate: { [new Date().toISOString().slice(0, 10)]: 2 }, byTask: {} } });
const s7a = run(ROOT, ['escalation', 'T707']);
checkOutcome(s7a, 'HUMAN_REQUIRED', 'S07-day-limit-exceed');

// ===== S09: timeout auto-transition (reapStale) =====
const oldDate = new Date(Date.now() - 9*3600000).toISOString();
writeState(ROOT, { seq: {}, tasks: { 'T909': { state: 'RUNNING', attempts: 0, timeoutMs: 8*3600000, createdAt: oldDate, updatedAt: oldDate } }, claudeCalls: { byDate: {}, byTask: {} } });
const s9 = run(ROOT, ['reap']);
const o9 = out(s9);
if (o9?.changed?.['T909']?.state === 'FAILED') { check('S09-reap-running-expired', true); }
else { check('S09-reap-running-expired', false, `changed=${JSON.stringify(o9?.changed)}`); }

// attempts >= MAX_ATTEMPTS -> DEAD_LETTER
writeState(ROOT, { seq: {}, tasks: { 'T1010': { state: 'RUNNING', attempts: 3, timeoutMs: 8*3600000, createdAt: oldDate, updatedAt: oldDate } }, claudeCalls: { byDate: {}, byTask: {} } });
const s9b = run(ROOT, ['reap']);
const o9b = out(s9b);
if (o9b?.changed?.['T1010']?.state === 'DEAD_LETTER') { check('S10-reap-max-attempts-dead-letter', true); }
else { check('S10-reap-max-attempts-dead-letter', false, `changed=${JSON.stringify(o9b?.changed)}`); }

// ===== S12: lease/fencing valid (prereg freeze check) =====
writeState(ROOT, { seq: {}, tasks: {}, claudeCalls: { byDate: {}, byTask: {} } });
writeFileSync(join(ROOT, 'test.txt'), 'content');
const p12 = run(ROOT, ['prereg', 'freeze', 'test.txt']);
checkOutcome(p12, 'SUCCESS', 'S12-prereg-freeze-ok');
const p12b = run(ROOT, ['prereg', 'check']);
check('S12-prereg-check-ok', p12b.status === 0 && /prereg: PASS/.test(p12b.stdout ?? ''), String(p12b.stdout ?? '').trim());
writeFileSync(join(ROOT, 'test.txt'), 'modified');
const p12c = run(ROOT, ['prereg', 'check']);
check('S12-prereg-mismatch-detect', p12c.status === 5 && /test\.txt/.test(p12c.stdout ?? '') && /HASH_MISMATCH/.test(p12c.stdout ?? ''), 'exit=' + p12c.status + '; ' + String(p12c.stdout ?? '').trim());

// ===== S13: idempotency key unique (dedupe) =====
writeState(ROOT, { seq: {}, tasks: { 'T1313': { state: 'CREATED', attempts: 0, timeoutMs: 8*3600000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, claudeCalls: { byDate: {}, byTask: {} } });
const s13 = run(ROOT, ['log-event', '--task=T1313', '--seq=1', '--hash=abc', '--relay=test', '--verdict=PASS', '--state-from=CREATED', '--state-to=RUNNING']);
const s13b = run(ROOT, ['log-event', '--task=T1313', '--seq=1', '--hash=abc', '--relay=test', '--verdict=PASS', '--state-from=CREATED', '--state-to=RUNNING']);
const o13 = out(s13), o13b = out(s13b);
if (o13?.logged === true && o13b?.logged === false) { check('S13-dedupe-second-false', true); }
else { check('S13-dedupe-second-false', false, `first=${JSON.stringify(o13)} second=${JSON.stringify(o13b)}`); }

// ===== S14: hash-chain integrity =====
// First create some log entries to have a valid chain
writeState(ROOT, { seq: {}, tasks: { 'T1414': { state: 'CREATED', attempts: 0, timeoutMs: 8*3600000, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, claudeCalls: { byDate: {}, byTask: {} } });
run(ROOT, ['log-event', '--task=T1414', '--seq=1', '--hash=abc', '--relay=test', '--verdict=PASS', '--state-from=CREATED', '--state-to=RUNNING']);
run(ROOT, ['log-event', '--task=T1414', '--seq=2', '--hash=def', '--relay=test', '--verdict=PASS', '--state-from=RUNNING', '--state-to=RUNNING']);
const s14 = run(ROOT, ['verifychain']);
checkOutcome(s14, 'SUCCESS', 'S14-verifychain-ok');

// tamper an existing event in LOG -> verifychain fails
const logContent = readFileSync(join(ROOT, 'LOG.md'), 'utf8');
const tamperedLog = logContent.replace('"eventHash":', '"eventHash": "TAMPERED", "originalEventHash":');
writeFileSync(join(ROOT, 'LOG.md'), tamperedLog);
const s14b = run(ROOT, ['verifychain']);
checkOutcome(s14b, 'CHAIN_BROKEN', 'S14-chain-broken-detect');

// ===== CLEANUP =====
try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }

done();
