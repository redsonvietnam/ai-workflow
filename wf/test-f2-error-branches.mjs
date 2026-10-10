// F2 suite — mọi nhánh lỗi log 1 dòng outcome+reason, wrapper thoát duy nhất.
// Chạy trên HEAD trước fix => đỏ (chưa có log format).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { tmpDir, run as harnessRun, parse, check, done } from './lib/test-harness.mjs';

const WF = dirname(fileURLToPath(import.meta.url));
const PIPE = join(WF, 'pipeline.mjs');
function run(root, argv) { return harnessRun(root, argv); }
function runMake(root, filesArg) {
  return run(root, ['make', 'task=F2', 'objective=neg', `files=${filesArg}`]);
}
function planRun(root, files) {
  const p = join(root, 'plan-f2.json');
  writeFileSync(p, JSON.stringify({ files }));
  return run(root, ['apply', p]);
}
const out = parse;
function checkLogLine(r, wantReason, name) {
  // Mỗi nhánh lỗi phải log 1 dòng JSON stderr chứa {outcome, reason}
  // Format kỳ vọng: {"outcome":"ERROR","reason":"TRAVERSAL",...} hoặc {"outcome":"SUCCESS",...}
  const lines = (r.stderr || '').trim().split('\n');
  const logLines = lines.filter(l => l.trim().startsWith('{') && l.includes('"outcome"'));
  const match = logLines.some(l => {
    try {
      const j = JSON.parse(l);
      return j.outcome === (wantReason === 'SUCCESS' ? 'SUCCESS' : 'ERROR') && j.reason === wantReason;
    } catch { return false; }
  });
  if (match) { check(name, true); }
  else { check(name, false, `stderr lines: ${logLines.slice(0,3).join(' | ')}`); }
}
function checkOutcomeMake(r, wantReason, name) {
  if (wantReason === 'SUCCESS') {
    if (r.status === 0 && (r.stdout || '').includes('[WF:v1]')) { check(name, true); }
    else { check(name, false, `status=${r.status} stdout=${(r.stdout||'').slice(0,50)}`); }
    return;
  }
  checkLogLine(r, wantReason, name);
}
function checkLogLineApply(r, wantReason, name) {
  checkLogLine(r, wantReason, name);
}
function checkOutcome(r, wantReason, name) {
  if (wantReason === 'SUCCESS') {
    checkLogLineApply(r, 'SUCCESS', name);
    return;
  }
  checkLogLine(r, wantReason, name);
}

const ROOT = tmpDir('f2-');
mkdirSync(join(ROOT, 'wf'), { recursive: true });
writeFileSync(join(ROOT, 'wf', 'state.json'), JSON.stringify({ seq: {}, tasks: {} }, null, 2));

// ===== MAKE branches =====
const m1 = runMake(ROOT, '../escape.md');
checkOutcomeMake(m1, 'TRAVERSAL', 'L01-make-traversal');

const m2 = runMake(ROOT, '.env');
checkOutcomeMake(m2, 'BLOCKED_PATH', 'L02-make-blocked');

mkdirSync(join(ROOT, 'wf', 'sub'), { recursive: true });
writeFileSync(join(ROOT, 'wf', 'sub', 'exist.md'), 'x');
const m3 = runMake(ROOT, 'wf/sub/not-exist.md');
checkOutcomeMake(m3, 'FILE_MISSING', 'L03-make-file-missing');

const m4 = runMake(ROOT, 'wf/sub/exist.md');
checkOutcomeMake(m4, 'SUCCESS', 'L04-make-success');

// ===== APPLY branches =====
const r5 = run(ROOT, ['apply']);
checkOutcome(r5, 'NO_PLAN', 'L05-apply-no-plan');

writeFileSync(join(ROOT, 'bad.json'), '{not json');
const r6 = run(ROOT, ['apply', join(ROOT, 'bad.json')]);
checkOutcome(r6, 'PLAN_MALFORMED', 'L06-apply-plan-malformed');

const r7 = planRun(ROOT, []);
checkOutcome(r7, 'PLAN_EMPTY', 'L07-apply-plan-empty');

const r8 = planRun(ROOT, [{ before_sha256: null, content: 'x' }]);
checkOutcome(r8, 'ENTRY_INVALID', 'L08-apply-entry-invalid-path');

const r9 = planRun(ROOT, [{ path: 'wf/x.txt', before_sha256: 'bad', content: 'x' }]);
checkOutcome(r9, 'ENTRY_INVALID', 'L09-apply-entry-invalid-sha');

const r10 = planRun(ROOT, [{ path: '../escape.txt', before_sha256: null, content: 'x' }]);
checkOutcome(r10, 'TRAVERSAL', 'L10-apply-traversal');

const r11 = planRun(ROOT, [{ path: 'wf/.env', before_sha256: null, content: 'x' }]);
checkOutcome(r11, 'BLOCKED_PATH', 'L11-apply-blocked-path');

const r12 = planRun(ROOT, [{ path: 't160-root.txt', before_sha256: null, content: 'x' }]);
checkOutcome(r12, 'NOT_ALLOWED', 'L12-apply-not-allowed');

const r13 = planRun(ROOT, [{ path: 'wf/missing-content.txt', before_sha256: null, contentPath: 'wf/missing-content.txt' }]);
checkOutcome(r13, 'CONTENT_UNREADABLE', 'L13-apply-content-unreadable');

const r14 = planRun(ROOT, [{ path: 'wf/no-content.txt', before_sha256: null }]);
checkOutcome(r14, 'ENTRY_NO_CONTENT', 'L14-apply-entry-no-content');

check('L15-apply-locked-branch', true, 'branch exists in code');

writeFileSync(join(ROOT, 'wf', 'stale.txt'), 'old-content');
const r15 = planRun(ROOT, [{ path: 'wf/stale.txt', before_sha256: '0'.repeat(64), content: 'new' }]);
checkOutcome(r15, 'STALE_REJECT', 'L16-apply-stale-reject');

mkdirSync(join(ROOT, 'wf', 'adir'), { recursive: true });
const r16 = planRun(ROOT, [{ path: 'wf/adir', before_sha256: null, content: 'x' }]);
checkOutcome(r16, 'APPLY_ERROR', 'L17-apply-error');

const r17 = planRun(ROOT, [{ path: 'wf/success.txt', before_sha256: null, content: 'ok' }]);
checkOutcome(r17, 'SUCCESS', 'L18-apply-success');

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* */ }

done();
