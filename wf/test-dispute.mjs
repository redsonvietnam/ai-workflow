import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WF = dirname(fileURLToPath(import.meta.url));
const STATE = join(WF, 'state.json');
const BACKUP = join(WF, 'state.backup-t133.json');
const FIX = 'T133-FIX';
const PIPE = join(WF, 'pipeline.mjs');

const run = (...a) => spawnSync(process.execPath, [PIPE, ...a], { encoding: 'utf8' });
const results = [];
const t = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`);
};

copyFileSync(STATE, BACKUP);
try {
  const st0 = JSON.parse(readFileSync(STATE, 'utf8'));
  st0.tasks = st0.tasks ?? {};
  st0.tasks[FIX] = { state: 'RUNNING', attempts: 0, updatedAt: Date.now() };
  st0.tasks[FIX + '2'] = { state: 'CREATED', attempts: 0, updatedAt: Date.now() };
  st0.tasks[FIX + '3'] = { state: 'RUNNING', attempts: 0, updatedAt: Date.now() };
  if (st0.disputes) { delete st0.disputes[FIX]; delete st0.disputes[FIX + '2']; delete st0.disputes[FIX + '3']; }
  writeFileSync(STATE, JSON.stringify(st0, null, 2));

  let r = run('dispute', FIX, 'create');
  let out = JSON.parse(r.stdout);
  t('1-create', r.status === 0 && out.dispute.status === 'OPEN' && out.dispute.round === 0, `status=${r.status}`);

  r = run('dispute', FIX, 'round', '--class', 'factual');
  out = JSON.parse(r.stdout);
  t('2-round1-factual-open', r.status === 0 && out.dispute.round === 1 && out.dispute.status === 'OPEN', `status=${r.status}`);

  r = run('dispute', FIX, 'round', '--class', 'interpretation');
  out = JSON.parse(r.stdout);
  t('3-round2-interp-open', r.status === 0 && out.dispute.round === 2 && out.dispute.status === 'OPEN', `status=${r.status}`);

  r = run('dispute', FIX, 'round', '--class', 'spec');
  out = JSON.parse(r.stdout);
  t('4-round3-blocked-deadletter', r.status === 0 && out.dispute.round === 3 && out.dispute.status === 'BLOCKED' && out.taskState === 'DEAD_LETTER', `status=${r.status} got=${out.dispute && out.dispute.status}/${out.taskState}`);

  const st2 = JSON.parse(readFileSync(STATE, 'utf8'));
  t('5-persisted-blocked-deadletter', st2.disputes[FIX].status === 'BLOCKED' && st2.tasks[FIX].state === 'DEAD_LETTER');

  run('dispute', FIX + '2', 'create');
  r = run('dispute', FIX + '2', 'round', '--class', 'wrong');
  t('6-bad-class-exit2', r.status === 2, `status=${r.status}`);

  r = run('dispute', FIX, 'round', '--class', 'factual');
  t('7-blocked-rejects-round-exit2', r.status === 2, `status=${r.status}`);

  r = run('dispute', FIX + '3', 'create');
  r = run('dispute', FIX + '3', 'round', '--class', 'factual');
  out = JSON.parse(r.stdout);
  t('8-rerun-idempotent', r.status === 0 && out.dispute.round === 1, `status=${r.status}`);

  r = run('dispute', FIX + '3', 'status');
  out = JSON.parse(r.stdout);
  t('9-status-readonly', r.status === 0 && out.dispute.status === 'OPEN', `status=${r.status}`);
} finally {
  copyFileSync(BACKUP, STATE);
  unlinkSync(BACKUP);
}

const failed = results.filter(x => !x.ok).length;
console.log(JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
