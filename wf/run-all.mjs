import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WF = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(WF, '..');
const BASELINE_PATH = join(WF, 'test-baseline.json');
const OUT_DIR = join(WF, '.run', `${process.platform}-node${process.versions.node.split('.')[0]}`);
const args = new Set(process.argv.slice(2));
const groupIndex = process.argv.indexOf('--group');
const groupArg = process.argv.find(a => a.startsWith('--group='));
const group = groupArg ? groupArg.slice('--group='.length) : (groupIndex >= 0 ? process.argv[groupIndex + 1] : null);
const writeBaseline = args.has('--write-baseline');

if (writeBaseline && group) { console.error('--write-baseline cannot be combined with --group'); process.exit(2); }
if (group && !['unit', 'network'].includes(group)) {
  console.error('Usage: node wf/run-all.mjs [--group=unit|network] [--write-baseline]');
  process.exit(2);
}
if (writeBaseline && process.platform !== 'win32') {
  console.error('--write-baseline is restricted to an interactive Windows run');
  process.exit(2);
}

mkdirSync(OUT_DIR, { recursive: true });
const suites = readdirSync(WF)
  .filter(name => /^test-.*\.mjs$/.test(name) && name !== 'test-harness-selfcheck.mjs')
  .filter(name => group === 'network' ? name === 'test-t134.mjs' : group === 'unit' ? name !== 'test-t134.mjs' : true)
  .sort();

let baseline = {};
if (!writeBaseline) {
  try { baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')); }
  catch (e) {
    console.error(`FAIL baseline-unreadable ${BASELINE_PATH}: ${e.message}`);
    process.exit(1);
  }
}

const results = {};
let failures = 0;
for (const suite of suites) {
  const r = spawnSync(process.execPath, [join(WF, suite)], {
    cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 120000,
    env: { ...process.env, WF_ROOT: ROOT },
  });
  const output = String(r.stdout ?? '') + (r.stderr ? `\n[stderr]\n${r.stderr}` : '');
  writeFileSync(join(OUT_DIR, `${suite}.txt`), output, 'utf8');
  const lines = output.split(/\r?\n/);
  const passed = lines.filter(line => /^(PASS)\b/.test(line)).length;
  const failed = lines.filter(line => /^(FAIL)\b/.test(line)).length;
  const skipped = lines.filter(line => /^(SKIP)\b/.test(line)).length;
  const crashed = r.error || r.status !== 0;
  results[suite] = { minPassed: passed, maxSkipped: { win32: skipped, linux: skipped, darwin: skipped } };
  if (writeBaseline) {
    console.log(`BASELINE ${suite} passed=${passed} failed=${failed} skipped=${skipped} exit=${r.status}`);
    continue;
  }
  const expected = baseline[suite];
  const platformMax = expected?.maxSkipped?.[process.platform];
  const checks = [
    [Boolean(expected), 'missing baseline entry'],
    [passed >= (expected?.minPassed ?? Infinity), `passed ${passed} < minPassed ${expected?.minPassed}`],
    [failed === 0, `FAIL lines=${failed}`],
    [skipped <= (platformMax ?? -1), `skipped ${skipped} > maxSkipped ${platformMax}`],
    [!crashed, `process exit/error ${r.status}: ${r.error?.message ?? ''}`],
  ];
  const bad = checks.filter(([ok]) => !ok);
  if (bad.length) {
    failures++;
    console.log(`FAIL ${suite} ${bad.map(([, why]) => why).join('; ')}`);
  } else {
    console.log(`PASS ${suite} passed=${passed} skipped=${skipped}`);
  }
}
if (writeBaseline) {
  writeFileSync(BASELINE_PATH, JSON.stringify(results, null, 2) + '\n', 'utf8');
  console.log(`WROTE_BASELINE ${BASELINE_PATH}`);
} else {
  console.log(`RESULT ${JSON.stringify({ suites: suites.length, failed: failures })}`);
  process.exitCode = failures ? 1 : 0;
}
