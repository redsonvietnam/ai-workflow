#!/usr/bin/env node
// T142 accounting fixtures — hermetic via WF_ROOT.
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
  const root = mkdtempSync(join(tmpdir(), 'wf-t142-'));
  mkdirSync(join(root, 'wf'), { recursive: true });
  writeFileSync(join(root, 'wf', 'state.json'), JSON.stringify({ seq: {}, claudeCalls: { byDate: {}, byTask: {} } }, null, 2));
  return root;
}
function run(root, ...args) {
  return spawnSync(process.execPath, [PIPE, ...args], {
    encoding: 'utf8',
    env: { ...process.env, WF_ROOT: root },
  });
}
function log(root, payload) {
  return run(root, 'log', JSON.stringify(payload));
}

let root;
try {
  root = fixture();
  let r = log(root, { task: 'T142-A', seq: 1, relay: 'chatgpt->claude->chatgpt', claude_calls: 0 });
  const logText = readFileSync(join(root, 'LOG.md'), 'utf8');
  const ev = JSON.parse(logText.trim().split(/\r?\n/).at(-1).split('|').slice(1).join('|').trim());
  check('1-infer-claude', r.status === 0 && ev.claude_calls === 1, `status=${r.status} claude_calls=${ev.claude_calls}`);
  rmSync(root, { recursive: true, force: true });

  root = fixture();
  r = log(root, { task: 'T142-B', seq: 1, relay: 'chatgpt->gemini->chatgpt', claude_calls: 0 });
  const logText2 = readFileSync(join(root, 'LOG.md'), 'utf8');
  const ev2 = JSON.parse(logText2.trim().split(/\r?\n/).at(-1).split('|').slice(1).join('|').trim());
  check('2-no-claude', r.status === 0 && ev2.claude_calls === 0, `status=${r.status} claude_calls=${ev2.claude_calls}`);
  rmSync(root, { recursive: true, force: true });

  root = fixture();
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(join(root, 'wf', 'state.json'), JSON.stringify({
    seq: {},
    claudeCalls: { byDate: { [today]: 1 }, byTask: { 'T142-C': 1 } }
  }, null, 2));
  r = log(root, { task: 'T142-C', seq: 1, relay: 'chatgpt->claude', claude_calls: 0 });
  check('3-budget-human-required', r.status === 3 && /HUMAN_REQUIRED/.test(r.stdout), `status=${r.status} stdout=${(r.stdout || '').trim()}`);
  rmSync(root, { recursive: true, force: true });

  r = spawnSync(process.execPath, [PIPE], { encoding: 'utf8', env: { ...process.env, WF_ROOT: mkdtempSync(join(tmpdir(), 'wf-t142-dry-')) } });
  const parsed = JSON.parse(r.stdout);
  const actual = parsed.fixtures.filter(x => x.ok).length + '/' + parsed.fixtures.length;
  check('4-dryrun-ratio', r.status === 0 && parsed.dryrun === 'PASS' && parsed.passed === actual, `status=${r.status} passed=${parsed.passed} actual=${actual}`);
} finally {
  if (root) rmSync(root, { recursive: true, force: true });
}

const failed = results.filter(x => !x.pass);
for (const x of results) console.log(`${x.pass ? 'PASS' : 'FAIL'} ${x.name} ${x.detail}`);
console.log(JSON.stringify({ total: results.length, failed: failed.length }));
process.exit(failed.length ? 1 : 0);
