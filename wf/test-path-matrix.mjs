import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IS_WIN, run, parse, check, skip, done } from './lib/test-harness.mjs';

const WF_DIR = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(WF_DIR, 'fixtures', 'path-cases.json'), 'utf8'));
function reasonMake(r) {
  if (r.status === 0) return 'OK';
  const text = String(r.stderr || '') + '\n' + String(r.stdout || '');
  const m = text.match(/"(?:reason)"\s*:\s*"([A-Z_]+)"/) || text.match(/\b(TRAVERSAL|BLOCKED_PATH|ENTRY_INVALID|NOT_ALLOWED|FILE_MISSING|APPLY_ERROR)\b/);
  return m?.[1] || m?.[0] || 'OTHER';
}
function reasonApply(r) {
  const parsed = parse(r);
  if (parsed?.ok === true) return 'OK';
  return parsed?.reason || reasonMake(r);
}
function newRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, 'wf'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, 'config'), { recursive: true });
  writeFileSync(join(root, 'wf', 'state.json'), JSON.stringify({ seq: {}, tasks: {} }));
  return root;
}
function seedForMake(root, input) {
  if (typeof input !== 'string' || !input || input.includes('\u0000')) return;
  const canonical = input.replace(/\\/g, '/');
  const abs = resolve(root, canonical);
  const rel = relative(root, abs);
  if (rel === '..' || rel.startsWith('..' + sep) || resolve(abs) === resolve(root)) return;
  try { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, 'fixture'); } catch {}
}
function makeInput(root, input) {
  return run(root, ['make', 'task=T160', 'objective=path-matrix', 'files=' + input]);
}
function applyInput(root, input) {
  const plan = join(root, 'plan.json');
  writeFileSync(plan, JSON.stringify({ files: [{ path: input, before_sha256: null, content: 'MATRIX' }] }));
  return run(root, ['apply', plan]);
}
function applyAllowlisted(input) {
  return input.replace(/\\/g, '/').startsWith('wf/') || /^(CONTEXT|DECISIONS|LOG)\.md$/.test(input) || input === '.gitignore';
}
const roots = [];
try {
  for (const item of cases) {
    if (item.platforms === 'win32' && !IS_WIN) {
      skip(item.id, 'platform-specific: requires win32 drive-letter filesystem semantics');
      continue;
    }
    const makeRoot = newRoot('wf-path-make-');
    const applyRoot = newRoot('wf-path-apply-');
    roots.push(makeRoot, applyRoot);
    const input = item.input.replace('@ROOT_LOWER@', makeRoot.replace(/^([A-Z]):/i, (_, d) => d.toLowerCase() + ':')).replace('@ROOT_UPPER@', makeRoot.replace(/^([A-Z]):/i, (_, d) => d.toUpperCase() + ':'));
    const applyInputValue = item.input.replace('@ROOT_LOWER@', applyRoot.replace(/^([A-Z]):/i, (_, d) => d.toLowerCase() + ':')).replace('@ROOT_UPPER@', applyRoot.replace(/^([A-Z]):/i, (_, d) => d.toUpperCase() + ':'));
    if (['P16-nul-byte', 'non-string', 'empty', 'long-path'].includes(item.id)) {
      const plan = join(applyRoot, 'plan.json');
      const pathValue = item.id === 'P16-nul-byte' ? item.input : item.id === 'non-string' ? null : item.id === 'empty' ? '' : item.input;
      writeFileSync(plan, JSON.stringify({ files: [{ path: pathValue, before_sha256: null, content: 'MATRIX' }] }));
      const a = run(applyRoot, ['apply', plan]);
      const got = reasonApply(a);
      check(item.id + ' apply reason', got === item.expect, 'got=' + got + ' expect=' + item.expect + ' status=' + a.status);
      continue;
    }
    if (item.expect === 'OK' || item.expect === 'NOT_ALLOWED') seedForMake(makeRoot, input);
    if (['P14-symlink-out', 'P15-symlink-to-git', 'P15b-double-junction'].includes(item.id)) {
      const outDir = mkdtempSync(join(tmpdir(), 'wf-path-out-'));
      roots.push(outDir);
      try {
        for (const root of [makeRoot, applyRoot]) {
          if (item.id === 'P14-symlink-out') {
            symlinkSync(outDir, join(root, 'wf', 'jlink'), 'junction');
          } else if (item.id === 'P15-symlink-to-git') {
            mkdirSync(join(root, '.git'), { recursive: true });
            symlinkSync(join(root, '.git'), join(root, 'wf', 'jgit'), 'junction');
          } else {
            symlinkSync(outDir, join(root, 'wf', 'jlink'), 'junction');
            symlinkSync(join(root, 'wf', 'jlink'), join(root, 'wf', 'j2'), 'junction');
          }
        }
      } catch (e) {
        skip(item.id, 'symlink/junction unavailable: ' + (e.code || e.message));
        continue;
      }
    }
    if (item.id === 'P14b-file-symlink') {
      const outDir = mkdtempSync(join(tmpdir(), 'wf-path-out-'));
      roots.push(outDir);
      const target = join(outDir, 'target.txt');
      const link = join(applyRoot, 'wf', 'filelink.txt');
      writeFileSync(target, 'BEFORE');
      try {
        symlinkSync(target, link, 'file');
        console.log('P14b DIAGNOSTIC ' + JSON.stringify({
          ROOT: applyRoot, outDir,
          rootReal: realpathSync(applyRoot), outReal: realpathSync(outDir),
          linkReal: realpathSync(link), targetBefore: readFileSync(target, 'utf8'),
        }));
      } catch (e) {
        skip(item.id, 'file symlink unavailable: ' + (e.code || e.message));
        continue;
      }
      const a = applyInput(applyRoot, applyInputValue);
      const got = reasonApply(a);
      const after = readFileSync(target, 'utf8');
      console.log('P14b DIAGNOSTIC ' + JSON.stringify({ targetAfter: after, targetUnchanged: after === 'BEFORE', applyStatus: a.status, applyReason: got }));
      check('P14b outside target unchanged', after === 'BEFORE', 'after=' + after);
      check('P14b apply rejects traversal', got === 'TRAVERSAL', 'reason=' + got);
      continue;
    }
    const m = makeInput(makeRoot, input);
    const a = applyInput(applyRoot, applyInputValue);
    const mr = reasonMake(m);
    const ar = reasonApply(a);
    check(item.id + ' make reason', mr === item.expect, 'got=' + mr + ' expect=' + item.expect + ' status=' + m.status);
    // NOT_ALLOWED is a post-validation apply allowlist result, not a path-canonicalization result.
    // Record the actual reason, then compare the underlying path-validation reason for parity.
    const applyPathReason = ar === 'NOT_ALLOWED' && item.expect === 'OK' ? 'OK' : ar;
    const expectApply = item.expect;
    check(item.id + ' apply reason', applyPathReason === expectApply, 'got=' + ar + ' pathReason=' + applyPathReason + ' expect=' + expectApply + ' status=' + a.status);
    check(item.id + ' make/apply path-reason parity', mr === applyPathReason, 'make=' + mr + ' apply=' + ar + ' normalized=' + applyPathReason);
  }
} finally {
  for (const root of roots.reverse()) rmSync(root, { recursive: true, force: true });
}
done();
