#!/usr/bin/env node
// Test fixtures T131 — node wf/test-apply.mjs (tự tạo/dọn fixture, chạy lặp được).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WF = dirname(fileURLToPath(import.meta.url));
const PIPE = join(WF, 'pipeline.mjs');
const FIX = join(WF, '_applytest');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

function runApply(planPath) {
  return spawnSync(process.execPath, [PIPE, 'apply', planPath], { encoding: 'utf8', timeout: 15000 });
}
function reset() { rmSync(FIX, { recursive: true, force: true }); mkdirSync(FIX, { recursive: true }); }

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

reset();
try {
  // (1) apply hợp lệ → exit 0, file đúng nội dung mới
  const f1 = join(FIX, 'ok.txt');
  writeFileSync(f1, 'old');
  const plan1 = join(FIX, 'plan1.json');
  writeFileSync(plan1, JSON.stringify({ files: [{ path: f1, before_sha256: sha('old'), content: 'new-content' }] }));
  let r = runApply(plan1);
  check('1-valid', r.status === 0 && readFileSync(f1, 'utf8') === 'new-content', `status=${r.status} ${r.stdout || r.stderr}`.slice(0, 200));

  // (2) TÁI HIỆN stale: hash tính lúc 'original', file bị sửa giữa check và apply → reject, không ghi đè
  const f2 = join(FIX, 'stale.txt');
  writeFileSync(f2, 'original');
  const h2 = sha('original');
  writeFileSync(f2, 'raced-mid-way'); // mô phỏng CodeLocal race sau khi tính hash
  const plan2 = join(FIX, 'plan2.json');
  writeFileSync(plan2, JSON.stringify({ files: [{ path: f2, before_sha256: h2, content: 'should-not-write' }] }));
  r = runApply(plan2);
  check('2-stale-reject', r.status === 8 && readFileSync(f2, 'utf8') === 'raced-mid-way' && /STALE_REJECT/.test(r.stdout), `status=${r.status}`);

  // (3) lock đang giữ → apply thứ 2 exit 8, không ghi
  const f3 = join(FIX, 'lock.txt');
  writeFileSync(f3, 'keep');
  const lockPath = join(WF, '.apply.lock');
  writeFileSync(lockPath, 'held');
  const plan3 = join(FIX, 'plan3.json');
  writeFileSync(plan3, JSON.stringify({ files: [{ path: f3, before_sha256: sha('keep'), content: 'x' }] }));
  r = runApply(plan3);
  const unchanged3 = readFileSync(f3, 'utf8') === 'keep';
  rmSync(lockPath, { force: true });
  check('3-lock-reject', r.status === 8 && unchanged3 && /LOCKED/.test(r.stdout), `status=${r.status}`);

  // (4) atomic: không còn temp/lock sót, nội dung cuối đầy đủ (không nửa vời)
  const leftFix = readdirSync(FIX).filter((n) => n.includes('.tmp-apply'));
  const leftWf = readdirSync(WF).filter((n) => n.includes('.tmp-apply') || n === '.apply.lock');
  check('4-atomic-clean', leftFix.length === 0 && leftWf.length === 0 && readFileSync(f1, 'utf8') === 'new-content', `leftovers=${[...leftFix, ...leftWf].join(',') || 'none'}`);
} finally {
  rmSync(FIX, { recursive: true, force: true });
}

const failed = results.filter((x) => !x.pass);
for (const x of results) console.log(`${x.pass ? 'PASS' : 'FAIL'} ${x.name} ${x.detail ?? ''}`);
console.log(JSON.stringify({ total: results.length, failed: failed.length }));
process.exit(failed.length ? 1 : 0);
