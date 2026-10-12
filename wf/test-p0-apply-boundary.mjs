// P0-APPLY-BOUNDARY: source containment and reject-output confidentiality.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PIPE = fileURLToPath(new URL('./pipeline.mjs', import.meta.url));
let failed = 0;
let passed = 0;
let skipped = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log('PASS ' + name); }
  else { failed++; console.error('FAIL ' + name + (detail ? ': ' + detail : '')); }
}
function fixture() {
  const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const base = mkdtempSync(join(repoRoot, '.p0-apply-boundary-'));
  const root = join(base, 'root');
  mkdirSync(join(root, 'wf'), { recursive: true });
  mkdirSync(join(root, 'wf', 'logs'), { recursive: true });
  writeFileSync(join(root, 'wf', 'state.json'), JSON.stringify({ seq: {}, tasks: {} }));
  return { base, root: realpathSync(root) };
}
function run(root, files, label = 'plan.json') {
  const plan = join(root, label);
  writeFileSync(plan, JSON.stringify({ files }));
  return spawnSync(process.execPath, [PIPE, 'apply', plan], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 30000,
    env: { ...process.env, WF_ROOT: root },
  });
}
function logText(root) {
  const p = join(root, 'wf', 'logs', 'code-local-payloads.jsonl');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}
function checkRejected(r, sentinel, root, targetRel, name) {
  let result;
  try { result = JSON.parse(r.stdout); } catch {}
  check(name + ': reject result', r.status !== 0 && result?.ok === false && typeof result.reason === 'string', 'status=' + r.status + ' stdout=' + r.stdout);
  check(name + ': plaintext absent stdout', !String(r.stdout).includes(sentinel));
  check(name + ': plaintext absent stderr', !String(r.stderr).includes(sentinel));
  check(name + ': plaintext absent JSONL', !logText(root).includes(sentinel));
  const target = join(root, targetRel);
  check(name + ': target absent', !existsSync(target));
  return result;
}
const { base, root } = fixture();
try {
  const sentinel = 'P0_SENTINEL_NEVER_EMIT_9f27b3';
  const outside = join(base, 'outside-secret.txt');
  writeFileSync(outside, sentinel);
  const targetAbs = 'wf/target-absolute.txt';
  const r1 = run(root, [{ path: targetAbs, before_sha256: null, contentPath: outside }], 'outside-absolute.json');
  const result1 = checkRejected(r1, sentinel, root, targetAbs, 'absolute-outside-source');
  check('absolute-outside-source: stable containment reason', ['CONTENT_PATH_OUTSIDE_ROOT', 'TRAVERSAL', 'BLOCKED_PATH'].includes(result1?.reason), String(result1?.reason));
  check('absolute-outside-source: outside source not copied', !existsSync(join(root, targetAbs)));

  const targetRelPath = 'wf/target-relative.txt';
  const r2 = run(root, [{ path: targetRelPath, before_sha256: null, contentPath: '../outside-secret.txt' }], 'outside-relative.json');
  const result2 = checkRejected(r2, sentinel, root, targetRelPath, 'relative-outside-source');
  check('relative-outside-source: stable containment reason', ['CONTENT_PATH_OUTSIDE_ROOT', 'TRAVERSAL', 'BLOCKED_PATH'].includes(result2?.reason), String(result2?.reason));

  const existingTarget = join(root, 'wf', 'existing-target.txt');
  writeFileSync(existingTarget, 'original-target-content');
  const rExisting = run(root, [{ path: 'wf/existing-target.txt', before_sha256: null, contentPath: outside }], 'existing-target.json');
  let resultExisting;
  try { resultExisting = JSON.parse(rExisting.stdout); } catch {}
  check('existing target: outside source rejected', rExisting.status !== 0 && resultExisting?.ok === false);
  check('existing target: content unchanged on reject', readFileSync(existingTarget, 'utf8') === 'original-target-content');
  check('existing target: sentinel absent stdout/stderr/JSONL',
    !String(rExisting.stdout).includes(sentinel) && !String(rExisting.stderr).includes(sentinel) && !logText(root).includes(sentinel));

  const blocked = join(root, '.env');
  writeFileSync(blocked, sentinel);
  const targetBlocked = 'wf/target-blocked.txt';
  const r3 = run(root, [{ path: targetBlocked, before_sha256: null, contentPath: '.env' }], 'blocked-source.json');
  const result3 = checkRejected(r3, sentinel, root, targetBlocked, 'blocked-source');
  check('blocked-source: blocked reason', ['BLOCKED_PATH', 'CONTENT_PATH_BLOCKED'].includes(result3?.reason), String(result3?.reason));

  const missingOutside = join(base, 'missing-secret.txt');
  const targetMissing = 'wf/target-missing-outside.txt';
  const r4 = run(root, [{ path: targetMissing, before_sha256: null, contentPath: missingOutside }], 'missing-outside.json');
  let result4;
  try { result4 = JSON.parse(r4.stdout); } catch {}
  check('outside source rejected before read', result4?.reason !== 'CONTENT_UNREADABLE', String(result4?.reason));
  check('outside missing source: no target write', !existsSync(join(root, targetMissing)));

  // Prefer a Windows junction (normally available without symlink privilege), then file symlink.
  const outsideDir = join(base, 'outside-dir');
  mkdirSync(outsideDir);
  writeFileSync(join(outsideDir, 'secret.txt'), sentinel);
  const linkPath = join(root, 'wf', 'outside-link');
  let symlinkReady = false;
  let sourceLink = 'wf/outside-link/secret.txt';
  try { symlinkSync(outsideDir, linkPath, 'junction'); symlinkReady = true; }
  catch {
    try {
      const fileLink = join(root, 'wf', 'outside-link.txt');
      symlinkSync(outside, fileLink, 'file');
      sourceLink = 'wf/outside-link.txt';
      symlinkReady = true;
    } catch {}
  }
  if (symlinkReady) {
    const targetSymlink = 'wf/target-symlink.txt';
    const r5 = run(root, [{ path: targetSymlink, before_sha256: null, contentPath: sourceLink }], 'symlink-outside.json');
    const result5 = checkRejected(r5, sentinel, root, targetSymlink, 'symlink-outside-source');
    check('symlink-outside-source: containment reason', ['CONTENT_PATH_OUTSIDE_ROOT', 'TRAVERSAL', 'BLOCKED_PATH'].includes(result5?.reason), String(result5?.reason));
  } else {
    skipped++;
    console.log('SKIP symlink-outside-source: symlink/junction creation unavailable on this platform');
  }

  // Rejection of a target path must never expose content read from an otherwise valid source.
  const insideSource = join(root, 'wf', 'inside-source.txt');
  writeFileSync(insideSource, sentinel);
  const r6 = run(root, [{ path: '../escape-target.txt', before_sha256: null, contentPath: 'wf/inside-source.txt' }], 'target-traversal.json');
  let result6;
  try { result6 = JSON.parse(r6.stdout); } catch {}
  check('target-traversal: reject', r6.status !== 0 && result6?.ok === false, 'status=' + r6.status);
  check('target-traversal: plaintext absent stdout', !String(r6.stdout).includes(sentinel));
  check('target-traversal: plaintext absent stderr', !String(r6.stderr).includes(sentinel));
  check('target-traversal: plaintext absent JSONL', !logText(root).includes(sentinel));
  check('target-traversal: no escaped target write', !existsSync(join(base, 'escape-target.txt')));

  // Valid in-root source remains supported.
  const validSource = join(root, 'wf', 'valid-source.txt');
  writeFileSync(validSource, 'valid-content-okay');
  const r7 = run(root, [{ path: 'wf/valid-target.txt', before_sha256: null, contentPath: 'wf/valid-source.txt' }], 'valid-source.json');
  let result7;
  try { result7 = JSON.parse(r7.stdout); } catch {}
  check('valid in-root source: success', r7.status === 0 && result7?.ok === true, 'status=' + r7.status + ' stdout=' + r7.stdout);
  check('valid in-root source: content written', existsSync(join(root, 'wf', 'valid-target.txt')) && readFileSync(join(root, 'wf', 'valid-target.txt'), 'utf8') === 'valid-content-okay');
} finally {
  rmSync(base, { recursive: true, force: true });
}
console.log('RESULT passed=' + passed + ' failed=' + failed + ' skipped=' + skipped);
if (failed) process.exitCode = 1;
