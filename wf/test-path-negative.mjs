// F1 suite — path validation âm tính (P01-P20) + parser differential.
// Chạy trên HEAD trước fix => thu thập danh sách ca ĐỎ, rồi mới sửa code.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WF = dirname(fileURLToPath(import.meta.url));
const PIPE = join(WF, 'pipeline.mjs');
let failed = 0, skipped = 0;
function check(name, ok, detail = '') {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + detail : ''));
  if (!ok) failed++;
}
function skip(name, why) { console.log('SKIP ' + name + ' ' + why); skipped++; }
function run(root, argv) {
  return spawnSync(process.execPath, [PIPE, ...argv], { encoding: 'utf8', env: { ...process.env, WF_ROOT: root }, timeout: 15000 });
}
function runMake(root, filesArg) {
  return run(root, ['make', 'task=T160', 'objective=neg', `files=${filesArg}`]);
}
function planRun(root, files) {
  const p = join(root, 'plan-t160.json');
  // with before=null: dọn target trước (khử STALE từ lần chạy trước, giữ test lặp lại được)
  for (const f of files) {
    if (f && f.before_sha256 === null && typeof f.path === 'string') {
      try { unlinkSync(resolve(root, f.path)); } catch { /* chưa tồn tại */ }
    }
  }
  writeFileSync(p, JSON.stringify({ files }));
  return run(root, ['apply', p]);
}
function out(r) { try { return JSON.parse(r.stdout); } catch { return null; } }

const ROOT = mkdtempSync(join(process.env.TEMP || process.env.TMP, 't160-'));
mkdirSync(join(ROOT, 'wf'), { recursive: true });
writeFileSync(join(ROOT, 'wf', 'state.json'), JSON.stringify({ seq: {}, tasks: {} }, null, 2));
const junctions = [];

// ===== GROUP 1: make (files=) =====
const m1 = runMake(ROOT, '../escape-t160.md');
check('P01-parent-posix', m1.status === 2 && /TRAVERSAL/.test(m1.stderr), `status=${m1.status} err=${m1.stderr.trim()}`);

const m2 = runMake(ROOT, '..\\escape-t160.md');
check('P02-parent-win', m2.status === 2 && /TRAVERSAL/.test(m2.stderr), `status=${m2.status} err=${m2.stderr.trim()}`);

const m3 = runMake(ROOT, 'C:\\escape-t160-abs.md');
check('P03-abs-outside', m3.status === 2 && /TRAVERSAL/.test(m3.stderr), `status=${m3.status} err=${m3.stderr.trim()}`);

mkdirSync(join(ROOT, '.GIT'), { recursive: true });
writeFileSync(join(ROOT, '.GIT', 'config'), 'x');
const m5 = runMake(ROOT, '.GIT/config');
check('P05-git-upper', m5.status === 2 && /BLOCKED_PATH/.test(m5.stderr), `status=${m5.status} err=${m5.stderr.trim()}`);

const m6 = runMake(ROOT, '.git\\config');
check('P06-git-backslash', m6.status === 2 && /BLOCKED_PATH/.test(m6.stderr), `status=${m6.status} err=${m6.stderr.trim()}`);

writeFileSync(join(ROOT, '.env.local'), 'SECRET=1');
const m7 = runMake(ROOT, '.env.local');
check('P07-env-local', m7.status === 2 && /BLOCKED_PATH/.test(m7.stderr), `status=${m7.status} err=${m7.stderr.trim()}`);

writeFileSync(join(ROOT, '.ENV.LOCAL'), 'SECRET=1');
const m7b = runMake(ROOT, '.ENV.LOCAL');
check('P07b-env-local-upper', m7b.status === 2 && /BLOCKED_PATH/.test(m7b.stderr), `status=${m7b.status} err=${m7b.stderr.trim()}`);

writeFileSync(join(ROOT, '.env.production'), 'SECRET=1');
const m8 = runMake(ROOT, '.env.production');
check('P08-env-production', m8.status === 2 && /BLOCKED_PATH/.test(m8.stderr), `status=${m8.status} err=${m8.stderr.trim()}`);

mkdirSync(join(ROOT, 'config'), { recursive: true });
writeFileSync(join(ROOT, 'config', '.env'), 'SECRET=1');
const m9 = runMake(ROOT, 'config/.env');
check('P09-env-nested', m9.status === 2 && /BLOCKED_PATH/.test(m9.stderr), `status=${m9.status} err=${m9.stderr.trim()}`);

writeFileSync(join(ROOT, 'config', '.env.local'), 'SECRET=1');
const m10 = runMake(ROOT, 'config/.env.local');
check('P10-env-nested-variant', m10.status === 2 && /BLOCKED_PATH/.test(m10.stderr), `status=${m10.status} err=${m10.stderr.trim()}`);

writeFileSync(join(ROOT, '.envrc'), 'export SECRET=1');
const m21 = runMake(ROOT, '.envrc');
check('P21-envrc', m21.status === 2 && /BLOCKED_PATH/.test(m21.stderr), `status=${m21.status} err=${m21.stderr.trim()}`);

writeFileSync(join(ROOT, 'wf', 'safe.md'), 'S');
const m22 = runMake(ROOT, 'wf/./safe.md');
check('P22-dot-segment-ok', m22.status === 0, `status=${m22.status} err=${m22.stderr.trim()}`);

const m11 = runMake(ROOT, 'x/../.git/config');
check('P11-traversal-combined', m11.status === 2 && /BLOCKED_PATH/.test(m11.stderr), `status=${m11.status} err=${m11.stderr.trim()}`);

const m12 = runMake(ROOT, 'x\\..\\.git\\config');
check('P12-traversal-mixed-sep', m12.status === 2 && /BLOCKED_PATH/.test(m12.stderr), `status=${m12.status} err=${m12.stderr.trim()}`);

const m13 = runMake(ROOT, `${ROOT}-evil\\file.md`);
check('P13-prefix-sibling', m13.status === 2 && /TRAVERSAL/.test(m13.stderr), `status=${m13.status} err=${m13.stderr.trim()}`);

let m16 = null;
try { m16 = runMake(ROOT, 'wf/safe\u0000../x.md'); } catch { /* spawn rejected NUL */ }
if (!m16) check('P16-nul-byte', true, 'spawn отклонил NUL arg (safe, no process)');
else check('P16-nul-byte', m16.status !== 0 && !existsSync(join(ROOT, 'wf', 'safe\u0000../x.md')), `status=${m16.status} err=${(m16.stderr || '').trim().slice(0, 120)}`);

skip('P17-case-drive', 'known risk per Claude: casing normalization ổ đĩa hoãn lại');

writeFileSync(join(ROOT, 'wf', 'abs-in.txt'), 'A');
const m18 = runMake(ROOT, join(ROOT, 'wf', 'abs-in.txt'));
check('P18-abs-inside-make', m18.status === 0, `status=${m18.status} err=${(m18.stderr || '').trim()}`);

mkdirSync(join(ROOT, 'docs'), { recursive: true });
writeFileSync(join(ROOT, 'docs', 'my-env-notes.md'), 'N');
const m19 = runMake(ROOT, 'docs/my-env-notes.md');
check('P19-no-false-block', m19.status === 0 && !/BLOCKED_PATH/.test(m19.stderr), `status=${m19.status} err=${m19.stderr.trim()}`);

writeFileSync(join(ROOT, 'docs', 'environment.md'), 'N');
const m19b = runMake(ROOT, 'docs/environment.md');
check('P19b-environment-md', m19b.status === 0 && !/BLOCKED_PATH/.test(m19b.stderr), `status=${m19b.status} err=${m19b.stderr.trim()}`);

writeFileSync(join(ROOT, 'docs', '.environment'), 'N');
const m19c = runMake(ROOT, 'docs/.environment');
check('P19c-dot-environment', m19c.status === 0 && !/BLOCKED_PATH/.test(m19c.stderr), `status=${m19c.status} err=${m19c.stderr.trim()}`);

skip('P20-toctou', 'known risk per Claude: ghi nhận giới hạn thiết kế, không chống race');

// ===== GROUP 2: apply (plan) =====
const a1 = planRun(ROOT, [{ path: '../escape-plan.txt', before_sha256: null, content: 'E' }]);
check('A-P01-apply-parent', a1.status === 2 && out(a1)?.reason === 'TRAVERSAL', `status=${a1.status} out=${JSON.stringify(out(a1))}`);

const a2 = planRun(ROOT, [{ path: 'wf/../../escape-plan2.txt', before_sha256: null, content: 'E' }]);
check('A-P02-apply-nested-escape', a2.status === 2 && out(a2)?.reason === 'TRAVERSAL', `status=${a2.status} out=${JSON.stringify(out(a2))}`);

const a3 = planRun(ROOT, [{ path: 'wf/.env.local', before_sha256: null, content: 'SECRET=1' }]);
check('A-P07-apply-env-local', a3.status !== 0, `status=${a3.status} out=${JSON.stringify(out(a3))} (mong đợi bị chặn)`);

const a4 = planRun(ROOT, [{ path: 'wf/.env', before_sha256: null, content: 'SECRET=1' }]);
check('A-P09-apply-env', a4.status === 2 && out(a4)?.reason === 'BLOCKED_PATH', `status=${a4.status} out=${JSON.stringify(out(a4))}`);

const a4b = planRun(ROOT, [{ path: 'wf\\.env', before_sha256: null, content: 'SECRET=1' }]);
check('A-P09b-apply-env-backslash', a4b.status === 2 && out(a4b)?.reason === 'BLOCKED_PATH', `status=${a4b.status} out=${JSON.stringify(out(a4b))}`);

const a4c = planRun(ROOT, [{ path: 'wf/./.env', before_sha256: null, content: 'SECRET=1' }]);
check('A-P09c-apply-env-dot', a4c.status === 2 && out(a4c)?.reason === 'BLOCKED_PATH', `status=${a4c.status} out=${JSON.stringify(out(a4c))}`);

const a4d = planRun(ROOT, [{ path: 'wf/.envrc', before_sha256: null, content: 'export SECRET=1' }]);
check('A-P09d-apply-envrc', a4d.status === 2 && out(a4d)?.reason === 'BLOCKED_PATH', `status=${a4d.status} out=${JSON.stringify(out(a4d))}`);

const a5 = planRun(ROOT, [{ path: 't160-root.txt', before_sha256: null, content: 'R' }]);
check('A-P19-root-not-allowed', a5.status === 2 && out(a5)?.reason === 'NOT_ALLOWED', `status=${a5.status} out=${JSON.stringify(out(a5))}`);

const a6 = planRun(ROOT, [{ path: join(ROOT, 'wf', 'abs-target.txt'), before_sha256: null, content: 'ABS' }]);
check('A-P18-abs-inside-apply', a6.status === 0 && out(a6)?.ok === true, `status=${a6.status} out=${JSON.stringify(out(a6))}`);

// P14: junction trong ws trỏ ra ngoài
const outDir = mkdtempSync(join(process.env.TEMP || process.env.TMP, 't160out-'));
try {
  const jlink = join(ROOT, 'wf', 'jlink');
  symlinkSync(outDir, jlink, 'junction');
  junctions.push(jlink);
  const a7 = planRun(ROOT, [{ path: 'wf/jlink/evil.txt', before_sha256: null, content: 'X' }]);
  const landed = existsSync(join(outDir, 'evil.txt'));
  check('P14-symlink-out', a7.status !== 0 && !landed, `status=${a7.status} landed=${landed} out=${JSON.stringify(out(a7))}`);
} catch (e) {
  skip('P14-symlink-out', 'junction create failed: ' + e.message);
}

// P15: junction trỏ vào .git giả
try {
  mkdirSync(join(ROOT, '.git'), { recursive: true });
  const jgit = join(ROOT, 'wf', 'jgit');
  symlinkSync(join(ROOT, '.git'), jgit, 'junction');
  junctions.push(jgit);
  const a8 = planRun(ROOT, [{ path: 'wf/jgit/hook-evil.txt', before_sha256: null, content: 'X' }]);
  const landed = existsSync(join(ROOT, '.git', 'hook-evil.txt'));
  check('P15-symlink-to-git', a8.status !== 0 && !landed, `status=${a8.status} landed=${landed} out=${JSON.stringify(out(a8))}`);
} catch (e) {
  skip('P15-symlink-to-git', 'junction create failed: ' + e.message);
}

// P14b: file symlink (không phải dir) trỏ ra ngoài — ghi qua symlink làm thay đổi đích thật
try {
  const targetReal = join(outDir, 'target.txt');
  writeFileSync(targetReal, 'BEFORE');
  const flink = join(ROOT, 'wf', 'filelink.txt');
  symlinkSync(targetReal, flink, 'file');
  const a12 = planRun(ROOT, [{ path: 'wf/filelink.txt', before_sha256: null, content: 'HIJACK' }]);
  let after = null;
  try { after = readFileSync(targetReal, 'utf8'); } catch { after = null; }
  const hijacked = after === 'HIJACK';
  check('P14b-file-symlink', a12.status !== 0 && !hijacked, `status=${a12.status} hijacked=${hijacked} out=${JSON.stringify(out(a12))}`);
  try { unlinkSync(flink); } catch { /* bỏ qua */ }
} catch (e) {
  skip('P14b-file-symlink', 'file symlink create failed (EPERM?): ' + e.message);
}

// P15b: junction lồng hai tầng (j2 -> j1 -> ngoài ws)
try {
  const j2 = join(ROOT, 'wf', 'j2');
  symlinkSync(join(ROOT, 'wf', 'jlink'), j2, 'junction');
  junctions.push(j2);
  const a13 = planRun(ROOT, [{ path: 'wf/j2/deep.txt', before_sha256: null, content: 'X' }]);
  const landed = existsSync(join(outDir, 'deep.txt'));
  check('P15b-double-junction', a13.status !== 0 && !landed, `status=${a13.status} landed=${landed} out=${JSON.stringify(out(a13))}`);
} catch (e) {
  skip('P15b-double-junction', 'junction create failed: ' + e.message);
}

// A-P16: NUL trong path plan
const a9 = planRun(ROOT, [{ path: 'wf/safe\u0000x.txt', before_sha256: null, content: 'N' }]);
check('A-P16-nul-plan', a9.status !== 0 && !existsSync(join(ROOT, 'wf', 'safe\u0000x.txt')), `status=${a9.status} out=${JSON.stringify(out(a9))}`);

// Parser differential: path được ghi phải là path đã chuẩn hóa
const a10 = planRun(ROOT, [{ path: 'wf/sub/../pd-target.txt', before_sha256: null, content: 'PD' }]);
check('PD-canonical-landing', a10.status === 0 && existsSync(join(ROOT, 'wf', 'pd-target.txt')), `status=${a10.status} landed=${existsSync(join(ROOT, 'wf', 'pd-target.txt'))}`);

const a11 = planRun(ROOT, [{ path: 'wf/sub/../../pd-escape.txt', before_sha256: null, content: 'E' }]);
check('PD-escape-rejected', a11.status === 2 && out(a11)?.reason === 'NOT_ALLOWED', `status=${a11.status} out=${JSON.stringify(out(a11))}`);

// PD-stub: ghi lại đối số write/rename qua --import, đối chiếu với path đã validate
const nodeMajor = Number(process.versions.node.split('.')[0]);
const nodeMinor = Number(process.versions.node.split('.')[1]);
if (nodeMajor > 20 || (nodeMajor === 20 && nodeMinor >= 6)) {
  const stub = join(ROOT, 'stub-writer.mjs');
  writeFileSync(stub, [
    "import fs from 'node:fs';",
    "import mod from 'node:module';",
    'const w = fs.writeFileSync, r = fs.renameSync;',
    "fs.writeFileSync = function (p, ...a) { console.error('STUB_W:' + String(p)); return w.call(fs, p, ...a); };",
    "fs.renameSync = function (a, b) { console.error('STUB_R:' + String(a) + '=>' + String(b)); return r.call(fs, a, b); };",
    'mod.syncBuiltinESMExports();',
  ].join('\n'));
  const plan = join(ROOT, 'plan-pdstub.json');
  const targetAbs = join(ROOT, 'wf', 'pd-stub.txt');
  writeFileSync(plan, JSON.stringify({ files: [{ path: 'wf/pd-stub.txt', before_sha256: null, content: 'S' }] }));
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(stub).href, PIPE, 'apply', plan], { encoding: 'utf8', env: { ...process.env, WF_ROOT: ROOT }, timeout: 15000 });
  const lines = (r.stderr || '').split(/\r?\n/).filter(l => l.startsWith('STUB_R:'));
  const renameTarget = lines.length ? lines[lines.length - 1].slice('STUB_R:'.length).split('=>')[1] : null;
  check('PD-stub-validate-eq-write', r.status === 0 && renameTarget === targetAbs, `status=${r.status} renameTarget=${renameTarget} expected=${targetAbs}`);
} else {
  skip('PD-stub-validate-eq-write', 'node < 20.6, không có --import');
}

// ===== GROUP 3: make-vs-apply — cùng bảng đầu vào, cùng kết luận =====
// Kết luận ∈ {ALLOWED, TRAVERSAL, BLOCKED_PATH}; NOT_ALLOWED/OTHER = lệch.
writeFileSync(join(ROOT, 'wf', 'compare-safe.md'), 'S');
const compareTable = [
  ['wf/compare-safe.md', 'ALLOWED'],
  ['wf/./compare-safe.md', 'ALLOWED'],
  ['../compare-evil.md', 'TRAVERSAL'],
  ['.env', 'BLOCKED_PATH'],
  ['.env.local', 'BLOCKED_PATH'],
  ['.envrc', 'BLOCKED_PATH'],
  ['config/.env', 'BLOCKED_PATH'],
  ['wf/.env', 'BLOCKED_PATH'],
  ['.git/config', 'BLOCKED_PATH'],
];
function classifyMake(r) {
  if (r.status === 0) return 'ALLOWED';
  if (/TRAVERSAL/.test(r.stderr)) return 'TRAVERSAL';
  if (/BLOCKED_PATH/.test(r.stderr)) return 'BLOCKED_PATH';
  return 'OTHER:' + r.status;
}
function classifyApply(r) {
  const o = out(r);
  if (o?.ok === true) return 'ALLOWED';
  if (o?.reason === 'TRAVERSAL') return 'TRAVERSAL';
  if (o?.reason === 'BLOCKED_PATH') return 'BLOCKED_PATH';
  return 'OTHER:' + (o?.reason || r.status);
}
for (const [p, want] of compareTable) {
  const cm = classifyMake(runMake(ROOT, p));
  const ca = classifyApply(planRun(ROOT, [{ path: p, before_sha256: null, content: 'CMP' }]));
  check(`MV-${p.replace(/[\/\\]/g, '_')}`, cm === want && ca === want && cm === ca, `make=${cm} apply=${ca} want=${want}`);
}

// ===== CLEANUP =====
try { for (const j of junctions) spawnSync('cmd', ['/c', 'rmdir', j], { stdio: 'ignore' }); } catch { /* best effort */ }
try { rmSync(outDir, { recursive: true, force: true }); } catch { /* best effort */ }
try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }

console.log(`---\n${failed === 0 ? 'ALL PASS' : 'FAILED: ' + failed}, skipped: ${skipped}`);
process.exit(failed === 0 ? 0 : 1);
