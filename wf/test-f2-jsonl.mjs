// W1-3 RED tests: apply must emit exactly one structured JSONL record per invocation.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { check, done } from './lib/test-harness.mjs';

const PIPE = fileURLToPath(new URL('./pipeline.mjs', import.meta.url));
const LOG_REL = join('wf', 'logs', 'code-local-payloads.jsonl');

function fixture(prefix = 'f2-jsonl-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, 'wf'), { recursive: true });
  writeFileSync(join(root, 'wf', 'state.json'), JSON.stringify({ seq: {}, tasks: {} }));
  return root;
}
function run(root, args, extraEnv = {}, timeout = 30000) {
  return spawnSync(process.execPath, [PIPE, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    timeout,
    env: { ...process.env, WF_ROOT: root, ...extraEnv },
  });
}
function plan(root, files, name = 'plan.json') {
  const p = join(root, name);
  writeFileSync(p, JSON.stringify({ files }));
  return p;
}
function records(root) {
  const p = join(root, LOG_REL);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
function assertOne(root, r, expectedReason, label, expectedClass) {
  let rows = [];
  let parseError = '';
  try { rows = records(root); } catch (e) { parseError = e.message; }
  check(label + ': exit', r.status === ({ SUCCESS: 0, STALE_REJECT: 8, LOCKED: 8, INTERNAL: 1 }[expectedReason] ?? 2),
    'status=' + r.status + ' stderr=' + String(r.stderr).slice(0, 180));
  check(label + ': exactly one parseable JSONL row', rows.length === 1 && !parseError, 'rows=' + rows.length + ' ' + parseError);
  const row = rows[0];
  check(label + ': schema and reason', Boolean(row && row.v === 1 && row.ts && Number.isInteger(row.pid)
    && row.cmd === 'apply' && Array.isArray(row.rawPaths) && Array.isArray(row.canonicalPaths)
    && Number.isInteger(row.entryCount) && ['SUCCESS', 'ERROR'].includes(row.outcome)
    && row.reason === expectedReason && row.errorClass === expectedClass
    && typeof row.platform === 'string' && Number.isFinite(row.durationMs)),
  row ? JSON.stringify({ reason: row.reason, errorClass: row.errorClass, outcome: row.outcome }) : 'no row');
  return row;
}
function oneCase(label, files, reason, errorClass, setup) {
  const root = fixture();
  try {
    setup?.(root);
    const p = files === null
      ? (existsSync(join(root, 'bad.json')) ? join(root, 'bad.json') : null)
      : plan(root, files);
    const r = run(root, p ? ['apply', p] : ['apply']);
    return assertOne(root, r, reason, label, errorClass);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// Each named apply branch must append exactly one row with the canonical reason/class.
oneCase('SUCCESS', [{ path: 'wf/success.txt', before_sha256: null, content: 'ok' }], 'SUCCESS', 'OK');
oneCase('NO_PLAN', null, 'NO_PLAN', 'VALIDATE_REJECT');
oneCase('PLAN_MALFORMED', null, 'PLAN_MALFORMED', 'VALIDATE_REJECT', (root) => writeFileSync(join(root, 'bad.json'), '{'));
{
  const root = fixture();
  try {
    const p = plan(root, []);
    const r = run(root, ['apply', p]);
    assertOne(root, r, 'PLAN_EMPTY', 'PLAN_EMPTY', 'VALIDATE_REJECT');
  } finally { rmSync(root, { recursive: true, force: true }); }
}
oneCase('ENTRY_INVALID', [{ before_sha256: null, content: 'x' }], 'ENTRY_INVALID', 'VALIDATE_REJECT');
oneCase('TRAVERSAL', [{ path: '../escape.txt', before_sha256: null, content: 'x' }], 'TRAVERSAL', 'VALIDATE_REJECT');
oneCase('BLOCKED_PATH', [{ path: 'wf/.env', before_sha256: null, content: 'x' }], 'BLOCKED_PATH', 'VALIDATE_REJECT');
oneCase('NOT_ALLOWED', [{ path: 'root-not-allowed.txt', before_sha256: null, content: 'x' }], 'NOT_ALLOWED', 'VALIDATE_REJECT');
oneCase('CONTENT_UNREADABLE', [{ path: 'wf/no-content.txt', before_sha256: null, contentPath: 'wf/missing.txt' }], 'CONTENT_UNREADABLE', 'VALIDATE_REJECT');
oneCase('ENTRY_NO_CONTENT', [{ path: 'wf/no-content.txt', before_sha256: null }], 'ENTRY_NO_CONTENT', 'VALIDATE_REJECT');
oneCase('STALE_REJECT', [{ path: 'wf/stale.txt', before_sha256: '0'.repeat(64), content: 'new' }], 'STALE_REJECT', 'CONCURRENCY', (root) => writeFileSync(join(root, 'wf', 'stale.txt'), 'old'));
oneCase('LOCKED', [{ path: 'wf/locked.txt', before_sha256: null, content: 'new' }], 'LOCKED', 'CONCURRENCY', (root) => writeFileSync(join(root, 'wf', '.apply.lock'), 'held'));
oneCase('APPLY_ERROR', [{ path: 'wf/adir', before_sha256: null, content: 'x' }], 'APPLY_ERROR', 'IO_ERROR', (root) => mkdirSync(join(root, 'wf', 'adir')));

// INTERNAL fault injection must be gated by WF_TEST_MODE=1 and release the lock before logging.
{
  const root = fixture();
  try {
    const p = plan(root, [{ path: 'wf/fault.txt', before_sha256: null, content: 'x' }]);
    const r = run(root, ['apply', p], { WF_TEST_MODE: '1', WF_TEST_FAULT: 'after-lock' });
    assertOne(root, r, 'INTERNAL', 'INTERNAL', 'INTERNAL');
    check('INTERNAL hook: lock released', !existsSync(join(root, 'wf', '.apply.lock')));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// Secrets must be redacted in every string field, including raw paths and content digests;
// never persist content/preview, and PEM without END must still be masked.
{
  const root = fixture();
  try {
    const rawPath = 'sk-ant-abcdefghijklmnop-secret.txt';
    const content = 'password=supersecretvalue eyJabcdefghijklmno.payload.signature\n-----BEGIN RSA PRIVATE KEY-----\nPRIVATEKEYMATERIALWITHOUTEND';
    const p = plan(root, [{ path: rawPath, before_sha256: null, content }]);
    const r = run(root, ['apply', p]);
    const row = assertOne(root, r, 'NOT_ALLOWED', 'redaction-error', 'VALIDATE_REJECT');
    const logPath = join(root, LOG_REL);
    const raw = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    check('redaction: API key absent', !raw.includes('sk-ant-abcdefghijklmnop-secret'));
    check('redaction: password absent', !raw.includes('supersecretvalue'));
    check('redaction: JWT absent', !raw.includes('eyJabcdefghijklmno.payload.signature'));
    check('redaction: unterminated PEM absent', !raw.includes('PRIVATEKEYMATERIALWITHOUTEND'));
    check('redaction: content never logged', !raw.includes(content) && !raw.includes('supersecretvalue') && !raw.includes('PRIVATEKEYMATERIALWITHOUTEND'));
    check('redaction: error stores content digest and byte length', Boolean(row && Array.isArray(row.content)
      && row.content[0]?.sha256 === createHash('sha256').update(content, 'utf8').digest('hex')
      && row.content[0]?.length === Buffer.byteLength(content, 'utf8')));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// CR/LF inside an input field must not create a second JSONL record or forge taskId.
{
  const root = fixture();
  try {
    const injected = 'wf/bad\r\n{"taskId":"FAKE"}';
    const p = plan(root, [{ path: injected, before_sha256: null, content: 'content\r\n{"taskId":"FAKE"}' }]);
    run(root, ['apply', p]);
    const logPath = join(root, LOG_REL);
    const raw = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    const lines = raw.split(/\r?\n/).filter(Boolean);
    check('log injection: exactly one physical JSONL line', lines.length === 1);
    let row;
    try { row = JSON.parse(lines[0]); } catch {}
    check('log injection: forged taskId impossible', Boolean(row && row.taskId !== 'FAKE'));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// Logging failures must not alter apply's result/exit code; LOG_FAILED is emitted once.
{
  const root = fixture();
  try {
    writeFileSync(join(root, 'wf', 'logs'), 'not a directory');
    const p = plan(root, [{ path: 'wf/log-fail.txt', before_sha256: null, content: 'ok' }]);
    const r = run(root, ['apply', p]);
    check('log failure: apply result unchanged', r.status === 0 && existsSync(join(root, 'wf', 'log-fail.txt')));
    check('log failure: one LOG_FAILED line', (r.stderr.match(/LOG_FAILED/g) ?? []).length === 1, r.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// A plan of 3000 entries proves stdout is fully flushed when the child exits through a pipe.
{
  const root = fixture();
  try {
    const files = Array.from({ length: 3000 }, (_, i) => ({
      path: 'wf/bulk-' + i + '.txt', before_sha256: null, content: 'x',
    }));
    const p = plan(root, files);
    const r = run(root, ['apply', p], {}, 120000);
    let output;
    try { output = JSON.parse(r.stdout); } catch {}
    check('pipe stdout: complete JSON result', r.status === 0 && output?.ok === true && output?.written?.length === 3000,
      'status=' + r.status + ' stdoutBytes=' + Buffer.byteLength(r.stdout ?? ''));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

// Test-only fault injection must be inert unless WF_TEST_MODE=1.
{
  const root = fixture();
  try {
    const p = plan(root, [{ path: 'wf/no-hook.txt', before_sha256: null, content: 'ok' }]);
    const r = run(root, ['apply', p], { WF_TEST_FAULT: 'after-lock' });
    check('fault hook gated: succeeds without test mode', r.status === 0 && existsSync(join(root, 'wf', 'no-hook.txt')));
  } finally { rmSync(root, { recursive: true, force: true }); }
}

done();
