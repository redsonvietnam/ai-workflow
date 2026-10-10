import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IS_WIN = process.platform === 'win32';
const WF_DIR = dirname(fileURLToPath(import.meta.url));
const PIPE = join(WF_DIR, '..', 'pipeline.mjs');
const counts = { passed: 0, failed: 0, skipped: 0 };

export function tmpDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function run(root, argv, opts) {
  return spawnSync(process.execPath, [PIPE, ...argv], {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, WF_ROOT: root },
    timeout: opts?.timeout ?? 30000,
  });
}

export function parse(result) {
  try { return JSON.parse(result?.stdout ?? ''); }
  catch { return null; }
}

export function check(name, ok, detail = '') {
  const passed = Boolean(ok);
  console.log((passed ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + detail : ''));
  if (passed) counts.passed++;
  else counts.failed++;
}

export function skip(name, reason) {
  console.log('SKIP ' + name + (reason ? ' ' + reason : ''));
  counts.skipped++;
}

export function done() {
  const result = { ...counts };
  console.log('RESULT ' + JSON.stringify(result));
  process.exitCode = counts.failed ? 1 : 0;
  return result;
}
