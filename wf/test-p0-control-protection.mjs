#!/usr/bin/env node
// P0: ensure apply cannot replace control/redaction code or bypass the narrow baseline exception.
import { createHash } from 'node:crypto';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  rmSync, symlinkSync, writeFileSync
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_WF = dirname(fileURLToPath(import.meta.url));
const SOURCE_BASELINE = join(SOURCE_WF, 'test-baseline.json');
const ORIGINAL_BASELINE = readFileSync(SOURCE_BASELINE, 'utf8');
const ORIGINAL_BASELINE_OBJECT = JSON.parse(ORIGINAL_BASELINE);
if (ORIGINAL_BASELINE_OBJECT['test-payload-log.mjs']?.minPassed !== 0) {
  throw new Error('Expected baseline exception source value minPassed=0');
}
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
let passed = 0;
let failed = 0;
let skipped = 0;
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log('PASS ' + name + (detail ? ' ' + detail : '')); }
  else { failed++; console.error('FAIL ' + name + (detail ? ' ' + detail : '')); }
}
function skip(name, detail = '') {
  skipped++;
  console.log('SKIP ' + name + (detail ? ' ' + detail : ''));
}
function changeMinPassed(text, key, oldValue, newValue) {
  const escapedKey = key.replaceAll('.', '\\.');
  const entryPattern = new RegExp(
    '(^[ \\t]*"' + escapedKey + '"[ \\t]*:[ \\t]*\\{\\r?\\n)([\\s\\S]*?)(^[ \\t]{2}\\},?[ \\t]*\\r?$)', 'm'
  );
  const match = text.match(entryPattern);
  if (!match) return text;
  const field = new RegExp('^([ \\t]*"minPassed"[ \\t]*:[ \\t]*)' +
    String(oldValue) + '([ \\t]*,?[ \\t]*\\r?)$', 'm');
  const body = match[2].replace(field, (_f, before, after) => before + String(newValue) + after);
  return text.replace(entryPattern, (_full, prefix, _oldBody, suffix) => prefix + body + suffix);
}
const goodBaseline = changeMinPassed(ORIGINAL_BASELINE, 'test-payload-log.mjs', 0, 1);
const expectedBaselineObject = {
  ...ORIGINAL_BASELINE_OBJECT,
  'test-payload-log.mjs': { ...ORIGINAL_BASELINE_OBJECT['test-payload-log.mjs'], minPassed: 1 }
};
if (goodBaseline === ORIGINAL_BASELINE ||
    JSON.stringify(expectedBaselineObject, null, 2) + '\n' !== goodBaseline) {
  throw new Error('Could not derive byte-exact baseline exception fixture');
}
const targetTamperedBaseline = changeMinPassed(goodBaseline, 'test-p0-apply-boundary.mjs',
  ORIGINAL_BASELINE_OBJECT['test-p0-apply-boundary.mjs'].minPassed,
  ORIGINAL_BASELINE_OBJECT['test-p0-apply-boundary.mjs'].minPassed + 1);

function createWorkspace() {
  const base = mkdtempSync(join(tmpdir(), 'wf-p0-control-protection-'));
  const root = join(base, 'workspace');
  const wf = join(root, 'wf');
  for (const dir of ['logs', 'lib', '.run', 'tasks', 'bundles/p0-control-protection']) {
    mkdirSync(join(wf, dir), { recursive: true });
  }
  mkdirSync(root, { recursive: true });
  const copyFiles = [
    'pipeline.mjs', 'payload-log.mjs', 'payload-log-cli.mjs', 'run-all.mjs',
    'check-syntax.mjs', 'git-gate.ps1', 'report.mjs', 'secret-patterns.json',
    'verify-standalone.mjs', 'prereg-manifest.json', 'wf-v1.schema.json',
    'lib/test-harness.mjs'
  ];
  for (const rel of copyFiles) {
    const src = join(SOURCE_WF, rel);
    if (existsSync(src)) copyFileSync(src, join(wf, rel));
  }
  writeFileSync(join(wf, 'state.json'), JSON.stringify({
    seq: {}, tasks: {}, claudeCalls: { byDate: {}, byTask: {} }
  }, null, 2) + '\n');
  writeFileSync(join(wf, 'test-baseline.json'), ORIGINAL_BASELINE);
  writeFileSync(join(root, 'LOG.md'), '# LOG\n');
  writeFileSync(join(wf, '.apply.lock'), 'pre-existing marker');
  writeFileSync(join(wf, '.run', 'result.txt'), 'pre-existing run artifact');
  writeFileSync(join(wf, 'logs', 'should-not-write.jsonl'), 'pre-existing log marker');
  writeFileSync(join(wf, 'bundles', 'p0-control-protection', 'sha256sums'), 'pre-existing sums');
  for (const rel of ['test-p0-control-protection.mjs', 'other-baseline.json']) {
    writeFileSync(join(wf, rel), 'pre-existing marker');
  }
  return { base, root, wf, planPath: join(root, 'apply-plan.json') };
}
function runApply(workspace, files) {
  writeFileSync(workspace.planPath, JSON.stringify({ files }, null, 2) + '\n');
  return spawnSync(process.execPath, [join(workspace.wf, 'pipeline.mjs'), 'apply', workspace.planPath], {
    cwd: workspace.root,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
    env: { ...process.env, WF_ROOT: workspace.root }
  });
}
function parseResult(result) {
  try { return JSON.parse(result.stdout); } catch { return null; }
}
function targetBytes(workspace, rel) {
  return readFileSync(join(workspace.root, ...rel.split('/')), 'utf8');
}

const protectedPaths = [
  'wf/PAYLOAD-LOG.MJS',
  'wf/STATE.JSON',
  'wf/PREREG-MANIFEST.JSON',
  'wf/TEST-BASELINE.JSON',
  'wf/RUN-ALL.MJS',
  'wf/WF-V1.SCHEMA.JSON',
  'LOG.md',
  'log.md',
  'wf/pipeline.mjs',
  'wf/verify-standalone.mjs',
  'wf/prereg-manifest.json',
  'wf/state.json',
  'wf/test-baseline.json',
  'wf/wf-v1.schema.json',
  'wf/payload-log.mjs',
  'wf/payload-log-cli.mjs',
  'wf/run-all.mjs',
  'wf/check-syntax.mjs',
  'wf/git-gate.ps1',
  'wf/report.mjs',
  'wf/secret-patterns.json',
  'wf/lib/test-harness.mjs',
  'wf/.run/result.txt',
  'wf/.apply.lock',
  'wf/logs/should-not-write.jsonl',
  'wf/test-p0-control-protection.mjs',
  'wf/other-baseline.json',
  'wf/bundles/p0-control-protection/sha256sums',
  'wf/bundles/p0-control-protection/provenance.json',
  'WF/BUNDLES/P0-CONTROL-PROTECTION/PROVENANCE.JSON'
];
for (const rel of protectedPaths) {
  let workspace;
  try {
    workspace = createWorkspace();
    const target = join(workspace.root, ...rel.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    if (!existsSync(target)) writeFileSync(target, 'control marker\n');
    const before = readFileSync(target, 'utf8');
    const result = runApply(workspace, [{
      path: rel,
      before_sha256: sha(before),
      content: 'UNAUTHORIZED-CONTROL-REPLACEMENT\n'
    }]);
    const parsed = parseResult(result);
    check(rel + ': rejected as protected', result.status === 2 && parsed?.reason === 'NOT_ALLOWED',
      'exit=' + result.status + ' reason=' + (parsed?.reason ?? 'missing'));
    check(rel + ': original bytes unchanged', readFileSync(target, 'utf8') === before);
  } catch (error) {
    check(rel + ': test execution', false, String(error?.stack ?? error));
  } finally {
    if (workspace) rmSync(workspace.base, { recursive: true, force: true });
  }
}

function runBaselineCase(name, {
  content = goodBaseline,
  before = sha(ORIGINAL_BASELINE),
  extraFiles = [],
  alias = false,
  targetRel: requestedTargetRel = 'wf/test-baseline.json',
  expectedOk = false,
  expectedReason = 'NOT_ALLOWED',
  expectedExit = 2
} = {}) {
  let workspace;
  try {
    workspace = createWorkspace();
    // Baseline-case fixtures must not inherit the control-path lock marker.
    rmSync(join(workspace.wf, '.apply.lock'), { force: true });
    for (const extra of extraFiles) {
      const extraTarget = join(workspace.root, ...extra.path.split('/'));
      mkdirSync(dirname(extraTarget), { recursive: true });
      if (!existsSync(extraTarget)) writeFileSync(extraTarget, 'side marker');
    }
    let targetRel = requestedTargetRel;
    if (alias) {
      const linkPath = join(workspace.wf, 'alias');
      try {
        symlinkSync(workspace.wf, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
      } catch (error) {
        skip(name, 'directory symlink/junction unavailable: ' + (error?.code ?? 'unknown'));
        return;
      }
      targetRel = 'wf/alias/test-baseline.json';
    }
    const entries = [{ path: targetRel, before_sha256: before, content }, ...extraFiles];
    const result = runApply(workspace, entries);
    const parsed = parseResult(result);
    const baselineAfter = targetBytes(workspace, 'wf/test-baseline.json');
    if (expectedOk) {
      check(name + ': accepted exact one-field transition',
        result.status === 0 && parsed?.ok === true, 'exit=' + result.status + ' reason=' + (parsed?.reason ?? 'missing'));
      check(name + ': exact expected bytes written', baselineAfter === goodBaseline);
    } else {
      check(name + ': rejected with expected reason',
        result.status === expectedExit && parsed?.reason === expectedReason,
        'exit=' + result.status + ' reason=' + (parsed?.reason ?? 'missing'));
      check(name + ': baseline unchanged', baselineAfter === ORIGINAL_BASELINE);
    }
    if (extraFiles.length) {
      const extraTarget = join(workspace.root, ...extraFiles[0].path.split('/'));
      check(name + ': additional target unchanged', readFileSync(extraTarget, 'utf8') === 'side marker');
    }
    if (requestedTargetRel !== 'wf/test-baseline.json') {
      check(name + ': protected copy unchanged', targetBytes(workspace, requestedTargetRel) === 'pre-existing marker');
    }
  } catch (error) {
    check(name + ': test execution', false, String(error?.stack ?? error));
  } finally {
    if (workspace) rmSync(workspace.base, { recursive: true, force: true });
  }
}
runBaselineCase('baseline exception valid exact update', { expectedOk: true });
runBaselineCase('baseline exception stale hash', { before: '0'.repeat(64), expectedReason: 'STALE_REJECT', expectedExit: 8 });
runBaselineCase('baseline exception extra byte', { content: goodBaseline + ' ' });
runBaselineCase('baseline exception malformed JSON', { content: '{"broken":' });
runBaselineCase('baseline exception wrong value', {
  content: changeMinPassed(ORIGINAL_BASELINE, 'test-payload-log.mjs', 0, 2)
});
runBaselineCase('baseline exception unrelated entry changed', { content: targetTamperedBaseline });
runBaselineCase('baseline exception reformatted JSON', {
  content: JSON.stringify(JSON.parse(goodBaseline), null, 4) + '\n'
});
runBaselineCase('baseline exception missing hash', { before: null });
runBaselineCase('baseline exception multi-entry plan', {
  extraFiles: [{ path: 'wf/tasks/side.txt', before_sha256: sha('side marker'), content: 'changed' }]
});
runBaselineCase('baseline exception protected copy path', {
  content: goodBaseline,
  targetRel: 'wf/other-baseline.json'
});
runBaselineCase('baseline exception symlink alias rejects general edit', {
  content: 'UNAUTHORIZED-BASELINE-CHANGE',
  alias: true
});

// Behavioral regression: the blocked redaction-module replacement must not weaken either API.
let redactionWorkspace;
try {
  redactionWorkspace = createWorkspace();
  const rel = 'wf/payload-log.mjs';
  const before = targetBytes(redactionWorkspace, rel);
  const blocked = runApply(redactionWorkspace, [{
    path: rel, before_sha256: sha(before),
    content: 'export function redactString(value) { return value; }\\nexport function redactObject(value) { return value; }\\n'
  }]);
  check('redaction-module overwrite rejected', blocked.status === 2 && parseResult(blocked)?.reason === 'NOT_ALLOWED');
  const probeSource = [
    "import { redactString, redactObject } from './wf/payload-log.mjs';",
    "const token = 'ghp_' + 'A'.repeat(30);",
    'const plain = redactString(token);',
    'const nested = JSON.stringify(redactObject({ nested: { token } }));',
    "if (plain.includes(token) || nested.includes(token)) process.exit(1);",
    "console.log('REDACTION_INVARIANT_OK');"
  ].join('\n');
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', probeSource], {
    cwd: redactionWorkspace.root, encoding: 'utf8', timeout: 15000,
    env: { ...process.env, WF_ROOT: redactionWorkspace.root }
  });
  check('redactString and nested redactObject hide dummy token',
    probe.status === 0 && probe.stdout.includes('REDACTION_INVARIANT_OK'),
    'exit=' + probe.status + ' stdout=' + probe.stdout + ' stderr=' + probe.stderr);
} catch (error) {
  check('redaction invariant test execution', false, String(error?.stack ?? error));
} finally {
  if (redactionWorkspace) rmSync(redactionWorkspace.base, { recursive: true, force: true });
}

console.log('RESULT passed=' + passed + ' failed=' + failed + ' skipped=' + skipped);
if (failed) process.exitCode = 1;
