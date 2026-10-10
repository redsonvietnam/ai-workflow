#!/usr/bin/env node
// T144 state machine — hermetic via WF_ROOT.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WF = dirname(fileURLToPath(import.meta.url));
const PIPE = join(WF, 'pipeline.mjs');
const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wf-t144-'));
  mkdirSync(join(root, 'wf'), { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(join(root, 'wf', 'state.json'), JSON.stringify({
    seq: { 'T144-A': 7 },
    tasks: {
      'T144-A': { state: 'CREATED', attempts: 0, timeoutMs: 28800000, createdAt: now, updatedAt: now },
      'T144-B': { state: 'CREATED', attempts: 0, timeoutMs: 28800000, createdAt: now, updatedAt: now },
      'T144-C': { state: 'CREATED', attempts: 0, timeoutMs: 28800000, createdAt: now, updatedAt: now }
    },
    claudeCalls: { byDate: {}, byTask: {} }
  }, null, 2));
  return root;
}
function run(root, ...args) {
  return spawnSync(process.execPath, [PIPE, ...args], {
    encoding: 'utf8',
    env: { ...process.env, WF_ROOT: root }
  });
}
function jsonOut(r) {
  try { return JSON.parse(r.stdout); } catch { return null; }
}

let root;
try {
  root = fixture();

  let r = run(root, 'task', 'T144-A', 'start');
  check('1-created-running', r.status === 0 && jsonOut(r)?.to === 'RUNNING', 'status=' + r.status);
  r = run(root, 'task', 'T144-A', 'done');
  check('2-running-done', r.status === 0 && jsonOut(r)?.to === 'DONE', 'status=' + r.status);

  r = run(root, 'task', 'T144-B', 'done');
  check('3-invalid-transition-exit2-json', r.status === 2 && jsonOut(r)?.reason === 'INVALID_STATE_TRANSITION', 'status=' + r.status);
  r = run(root, 'task', 'NO_SUCH_TASK', 'start');
  check('4-unknown-task-exit2', r.status === 2 && jsonOut(r)?.reason === 'TASK_NOT_FOUND', 'status=' + r.status);

  r = run(root, 'task', 'T144-C', 'start');
  run(root, 'task', 'T144-C', 'fail');
  run(root, 'task', 'T144-C', 'start');
  run(root, 'task', 'T144-C', 'fail');
  r = run(root, 'task', 'T144-C', 'start');
  check('5-fail-twice-can-retry', r.status === 0 && jsonOut(r)?.to === 'RUNNING', 'status=' + r.status);
  r = run(root, 'task', 'T144-C', 'fail');
  const c = jsonOut(r);
  const st = JSON.parse(readFileSync(join(root, 'wf', 'state.json'), 'utf8'));
  check('6-fail-third-dead-letter', r.status === 0 && c?.to === 'DEAD_LETTER' && c?.attempts === 3 && st.tasks['T144-C'].state === 'DEAD_LETTER', 'status=' + r.status);

  const before = readFileSync(join(root, 'wf', 'state.json'), 'utf8');
  r = run(root, 'status');
  const after = readFileSync(join(root, 'wf', 'state.json'), 'utf8');
  const lines = r.stdout.trim().split(/\r?\n/);
  check('7-status-readonly-and-table', r.status === 0 && before === after && lines[0] === '| id | state | attempts | tuổi | seq | claudeCalls |' && lines.length === 5, 'status=' + r.status + ' lines=' + lines.length);

  r = run(root, 'log', JSON.stringify({ task: 'T144-B', seq: 1, stateTo: 'RUNNING' }));
  check('8-log-statefrom-inferred', r.status === 0 && JSON.parse(readFileSync(join(root, 'wf', 'state.json'), 'utf8')).tasks['T144-B'].state === 'RUNNING', 'status=' + r.status);
} finally {
  if (root) rmSync(root, { recursive: true, force: true });
}

const failed = results.filter(x => !x.pass);
for (const x of results) console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + ' ' + x.detail);
console.log(JSON.stringify({ total: results.length, failed: failed.length }));
process.exit(failed.length ? 1 : 0);
