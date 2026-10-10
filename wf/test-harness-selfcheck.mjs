import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, done } from './lib/test-harness.mjs';

const ROOT = mkdtempSync(join(tmpdir(), 'wf-harness-selfcheck-'));
const WF = join(ROOT, 'wf');
mkdirSync(WF, { recursive: true });
const runner = readFileSync(new URL('./run-all.mjs', import.meta.url), 'utf8');
writeFileSync(join(WF, 'run-all.mjs'), runner);
writeFileSync(join(WF, 'test-dummy-fail.mjs'), "console.log('FAIL intentional'); process.exit(0);\n");
writeFileSync(join(WF, 'test-dummy-low.mjs'), "console.log('PASS only-one'); process.exit(0);\n");
writeFileSync(join(WF, 'test-baseline.json'), JSON.stringify({
  'test-dummy-fail.mjs': { minPassed: 0, maxSkipped: { win32: 0, linux: 0, darwin: 0 } },
  'test-dummy-low.mjs': { minPassed: 2, maxSkipped: { win32: 0, linux: 0, darwin: 0 } },
}, null, 2));
const r = spawnSync(process.execPath, [join(WF, 'run-all.mjs')], { encoding: 'utf8', windowsHide: true });
const output = String(r.stdout ?? '') + String(r.stderr ?? '');
check('FAIL-line-detected-even-exit-zero', r.status !== 0 && /FAIL test-dummy-fail\.mjs/.test(output), output.trim().replace(/\r?\n/g, ' | '));
check('below-baseline-fails', r.status !== 0 && /passed 1 < minPassed 2/.test(output), output.trim().replace(/\r?\n/g, ' | '));
try { rmSync(ROOT, { recursive: true, force: true }); } catch {}
done();
