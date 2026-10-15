import { copyFileSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, mkdtempSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WF = dirname(fileURLToPath(import.meta.url));
const SOURCE_PIPELINE = join(WF, 'pipeline.mjs');
const SOURCE_PAYLOAD_LOG = join(WF, 'payload-log.mjs');
let passed = 0;
let failed = 0;
let skipped = 0;
function skip(name, detail = '') {
  skipped++;
  console.log('SKIP ' + name + (detail ? ' ' + detail : ''));
}
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log('PASS ' + name + (detail ? ' ' + detail : '')); }
  else { failed++; console.log('FAIL ' + name + (detail ? ' ' + detail : '')); }
}
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');

function fixture(label, fault) {
  const base = mkdtempSync(join(tmpdir(), 'wf-p0-apply-hardening-'));
  const root = join(base, 'workspace');
  const wf = join(root, 'wf');
  const tasks = join(wf, 'tasks');
  mkdirSync(tasks, { recursive: true });
  mkdirSync(join(wf, 'logs'), { recursive: true });
  copyFileSync(SOURCE_PAYLOAD_LOG, join(wf, 'payload-log.mjs'));

  let pipelineText = readFileSync(SOURCE_PIPELINE, 'utf8');
  if (fault === 'parent-pivot') {
    const lines = pipelineText.split(/\r?\n/);
    const index = lines.findIndex((line, i) => line.trim() === '// Revalidate and rehash each target immediately before its atomic replacement.' && lines[i + 1]?.trim() === 'for (const e of resolved) {');
    if (index < 0) throw new Error('parent-pivot loop anchor missing or ambiguous');
    lines.splice(index + 2, 0,
      "        if (process.env.P0_TEST_PARENT_PIVOT === '1' && /parent-pivot-a\\.txt$/i.test(e.rel)) {",
      "          writeFileSync(join(process.env.P0_TEST_OUTSIDE_DIR, e.temp.slice(e.temp.lastIndexOf(sep) + 1)), 'ATTACKER-CONTROLLED-TEMP');",
      '          renameSync(dirname(e.abs), process.env.P0_TEST_HELD_DIR);',
      "          await import('node:fs').then(({ symlinkSync }) => symlinkSync(process.env.P0_TEST_OUTSIDE_DIR, dirname(e.abs), 'junction'));",
      '        }'
    );
    pipelineText = lines.join('\n');
  } else if (fault === 'race') {
    const anchor = "if (stale.length) throw new ApplyReject('STALE_REJECT', { stale });";
    if (pipelineText.split(anchor).length !== 2) throw new Error('race injection anchor missing or ambiguous');
    pipelineText = pipelineText.replace(anchor, anchor + '\n' +
      '    // Test-only race: a non-cooperating writer changes a target after initial stale validation.\n' +
      "    if (process.env.P0_TEST_RACE === '1' && resolved[0]) writeFileSync(resolved[0].abs, 'EXTERNAL-RACE');\n");
  } else if (fault === 'commit-failure') {
    const anchor = '      written.push(e.rel);';
    if (pipelineText.split(anchor).length !== 2) throw new Error('commit injection anchor missing or ambiguous');
    pipelineText = pipelineText.replace(anchor, anchor + '\n' +
      '      // Test-only fault: simulate an I/O failure after the first successful target rename.\n' +
      "      if (process.env.P0_TEST_FAIL_AFTER_FIRST_RENAME === '1' && written.length === 1) throw new Error('INJECTED_COMMIT_FAILURE');\n");
  } else if (fault === 'apply-temp-collision') {
    const anchor = "      const tmp = e.abs + '.tmp-apply-' + randomUUID();";
    if (pipelineText.split(anchor).length !== 2) throw new Error('apply-temp collision anchor missing or ambiguous');
    pipelineText = pipelineText.replace(anchor, anchor + '\n' +
      "      if (process.env.P0_TEST_APPLY_TEMP_COLLISION === '1') writeFileSync(tmp, 'EXTERNAL-APPLY-TEMP');\n");
  } else if (fault === 'rollback-temp-collision') {
    const commitAnchor = '      written.push(e.rel);';
    if (pipelineText.split(commitAnchor).length !== 2) throw new Error('rollback fault anchor missing or ambiguous');
    pipelineText = pipelineText.replace(commitAnchor, commitAnchor + '\n' +
      "      if (process.env.P0_TEST_ROLLBACK_TEMP_COLLISION === '1' && written.length === 1) throw new Error('INJECTED_ROLLBACK_FAILURE');\n");
    const tempAnchor = "            const rollbackTemp = e.abs + '.tmp-rollback-' + randomUUID();";
    if (pipelineText.split(tempAnchor).length !== 2) throw new Error('rollback-temp collision anchor missing or ambiguous');
    pipelineText = pipelineText.replace(tempAnchor, tempAnchor + '\n' +
      "            if (process.env.P0_TEST_ROLLBACK_TEMP_COLLISION === '1') writeFileSync(rollbackTemp, 'EXTERNAL-ROLLBACK-TEMP');\n");
  } else if (fault !== 'protected-alias') {
    throw new Error('unknown fixture fault');
  }
  const pipe = join(wf, 'pipeline.mjs');
  writeFileSync(pipe, pipelineText, 'utf8');
  writeFileSync(join(wf, 'state.json'), JSON.stringify({
    seq: {}, tasks: {}, claudeCalls: { byDate: {}, byTask: {} }
  }, null, 2) + '\n');
  writeFileSync(join(root, 'LOG.md'), '# LOG\n');

  const a = join(tasks, label + '-a.txt');
  const b = join(tasks, label + '-b.txt');
  writeFileSync(a, 'old-a');
  writeFileSync(b, 'old-b');
  const planPath = join(wf, label + '-plan.json');
  writeFileSync(planPath, JSON.stringify({ files: [
    { path: 'wf/tasks/' + label + '-a.txt', before_sha256: sha('old-a'), content: 'new-a' },
    { path: 'wf/tasks/' + label + '-b.txt', before_sha256: sha('old-b'), content: 'new-b' }
  ] }, null, 2) + '\n');
  const outside = join(base, 'outside');
  const held = join(wf, label + '-tasks-held');
  if (fault === 'parent-pivot') mkdirSync(outside, { recursive: true });
  return { base, root, wf, tasks, a, b, planPath, outside, held };
}
function runApply(f, extraEnv) {
  return spawnSync(process.execPath, [join(f.wf, 'pipeline.mjs'), 'apply', f.planPath], {
    cwd: f.root,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
    env: { ...process.env, WF_ROOT: f.root, WF_TEST_MODE: '1', ...extraEnv }
  });
}
function parseOutput(r) {
  try { return JSON.parse(r.stdout); } catch { return null; }
}

let race;
let parentPivot;
let caseCollision;
let atomic;
let applyCollision;
let rollbackCollision;
let alias;
try {
  race = fixture('race', 'race');
  const raceRun = runApply(race, { P0_TEST_RACE: '1' });
  const raceResult = parseOutput(raceRun);
  check('TOCTOU-race-rejected', raceRun.status !== 0 && raceResult?.reason === 'STALE_REJECT',
    'exit=' + raceRun.status + ' reason=' + (raceResult?.reason ?? 'missing'));
  check('TOCTOU-raced-content-preserved', readFileSync(race.a, 'utf8') === 'EXTERNAL-RACE',
    'actual=' + readFileSync(race.a, 'utf8'));
  check('TOCTOU-second-target-untouched', readFileSync(race.b, 'utf8') === 'old-b',
    'actual=' + readFileSync(race.b, 'utf8'));

  parentPivot = fixture('parent-pivot', 'parent-pivot');
  const pivotRun = runApply(parentPivot, {
    P0_TEST_PARENT_PIVOT: '1',
    P0_TEST_OUTSIDE_DIR: parentPivot.outside,
    P0_TEST_HELD_DIR: parentPivot.held
  });
  const pivotResult = parseOutput(pivotRun);
  check('parent-directory pivot rejected before rename', pivotRun.status !== 0 && pivotResult?.ok === false && pivotResult?.reason === 'TRAVERSAL',
    'exit=' + pivotRun.status + ' reason=' + (pivotResult?.reason ?? 'missing'));
  check('parent-directory pivot does not write target outside', !existsSync(join(parentPivot.outside, 'parent-pivot-a.txt')));
  const outsideTemp = readdirSync(parentPivot.outside).find(name => name.includes('.tmp-apply-'));
  check('parent-directory pivot preserves foreign same-name temp', Boolean(outsideTemp) && readFileSync(join(parentPivot.outside, outsideTemp), 'utf8') === 'ATTACKER-CONTROLLED-TEMP',
    'temp=' + (outsideTemp ?? 'missing'));
  const movedTemp = readdirSync(parentPivot.held).find(name => name.includes('.tmp-apply-'));
  check('parent-directory pivot leaves our staged temp in moved original parent', Boolean(movedTemp) && readFileSync(join(parentPivot.held, movedTemp), 'utf8') === 'new-a',
    'temp=' + (movedTemp ?? 'missing'));
  check('parent-directory pivot retains original targets', readFileSync(join(parentPivot.held, 'parent-pivot-a.txt'), 'utf8') === 'old-a' && readFileSync(join(parentPivot.held, 'parent-pivot-b.txt'), 'utf8') === 'old-b');

  caseCollision = fixture('case-collision', 'protected-alias');
  writeFileSync(caseCollision.planPath, JSON.stringify({ files: [
    { path: 'wf/tasks/case-collision-a.txt', before_sha256: sha('old-a'), content: 'first-candidate' },
    { path: 'wf/tasks/CASE-COLLISION-A.TXT', before_sha256: sha('old-a'), content: 'second-candidate' }
  ] }, null, 2) + '\n');
  const caseCollisionRun = runApply(caseCollision, {});
  const caseCollisionResult = parseOutput(caseCollisionRun);
  check('case-variant duplicate targets rejected', caseCollisionRun.status !== 0 && caseCollisionResult?.reason === 'ENTRY_INVALID',
    'exit=' + caseCollisionRun.status + ' reason=' + (caseCollisionResult?.reason ?? 'missing'));
  check('case-variant duplicate target leaves original unchanged', readFileSync(caseCollision.a, 'utf8') === 'old-a',
    'actual=' + readFileSync(caseCollision.a, 'utf8'));

  atomic = fixture('atomic', 'commit-failure');
  const atomicRun = runApply(atomic, { P0_TEST_FAIL_AFTER_FIRST_RENAME: '1' });
  check('multi-file-fault-fails-closed', atomicRun.status !== 0,
    'exit=' + atomicRun.status);
  check('multi-file-rollback-restores-first-target', readFileSync(atomic.a, 'utf8') === 'old-a',
    'actual=' + readFileSync(atomic.a, 'utf8'));
  check('multi-file-rollback-preserves-second-target', readFileSync(atomic.b, 'utf8') === 'old-b',
    'actual=' + readFileSync(atomic.b, 'utf8'));
  const tempLeftovers = readdirSync(atomic.tasks).filter(name => name.includes('.tmp-apply-') || name.includes('.tmp-rollback-'));
  check('multi-file-failure-cleans-lock-and-temp-files',
    !existsSync(join(atomic.wf, '.apply.lock')) && tempLeftovers.length === 0,
    'lock=' + existsSync(join(atomic.wf, '.apply.lock')) + ' temps=' + tempLeftovers.join(','));

  applyCollision = fixture('apply-temp', 'apply-temp-collision');
  const applyCollisionRun = runApply(applyCollision, { P0_TEST_APPLY_TEMP_COLLISION: '1' });
  const applyCollisionResult = parseOutput(applyCollisionRun);
  const applyTempName = readdirSync(applyCollision.tasks).find(name => name.includes('.tmp-apply-'));
  check('apply-temp-collision-fails-closed', applyCollisionRun.status !== 0 && applyCollisionResult?.reason === 'APPLY_ERROR',
    'exit=' + applyCollisionRun.status + ' reason=' + (applyCollisionResult?.reason ?? 'missing'));
  check('apply-temp-collision-preserves-foreign-file',
    Boolean(applyTempName) && readFileSync(join(applyCollision.tasks, applyTempName), 'utf8') === 'EXTERNAL-APPLY-TEMP',
    'leftover=' + (applyTempName ?? 'missing'));
  check('apply-temp-collision-keeps-targets',
    readFileSync(applyCollision.a, 'utf8') === 'old-a' && readFileSync(applyCollision.b, 'utf8') === 'old-b',
    'a=' + readFileSync(applyCollision.a, 'utf8') + ' b=' + readFileSync(applyCollision.b, 'utf8'));

  rollbackCollision = fixture('rollback-temp', 'rollback-temp-collision');
  const rollbackCollisionRun = runApply(rollbackCollision, { P0_TEST_ROLLBACK_TEMP_COLLISION: '1' });
  const rollbackCollisionResult = parseOutput(rollbackCollisionRun);
  const rollbackTempName = readdirSync(rollbackCollision.tasks).find(name => name.includes('.tmp-rollback-'));
  check('rollback-temp-collision-reports-failure',
    rollbackCollisionRun.status !== 0 && rollbackCollisionResult?.reason === 'ROLLBACK_FAILED',
    'exit=' + rollbackCollisionRun.status + ' reason=' + (rollbackCollisionResult?.reason ?? 'missing'));
  check('rollback-temp-collision-identifies-unrestored-target',
    Array.isArray(rollbackCollisionResult?.extra?.rollbackFailed) &&
      rollbackCollisionResult.extra.rollbackFailed.some(path => String(path).endsWith('rollback-temp-a.txt')),
    'extra=' + JSON.stringify(rollbackCollisionResult?.extra ?? null));
  check('rollback-temp-collision-preserves-foreign-file',
    Boolean(rollbackTempName) && readFileSync(join(rollbackCollision.tasks, rollbackTempName), 'utf8') === 'EXTERNAL-ROLLBACK-TEMP',
    'leftover=' + (rollbackTempName ?? 'missing'));
  check('rollback-temp-collision-exposes-partial-state',
    readFileSync(rollbackCollision.a, 'utf8') === 'new-a' && readFileSync(rollbackCollision.b, 'utf8') === 'old-b',
    'a=' + readFileSync(rollbackCollision.a, 'utf8') + ' b=' + readFileSync(rollbackCollision.b, 'utf8'));

  alias = fixture('alias', 'protected-alias');
  const protectedFile = join(alias.wf, 'test-baseline.json');
  const protectedOriginal = JSON.stringify({ protected: true, minPassed: 0 }) + '\n';
  writeFileSync(protectedFile, protectedOriginal);
  const aliasPath = join(alias.wf, 'alias');
  let aliasReady = false;
  try { symlinkSync(alias.wf, aliasPath, 'junction'); aliasReady = true; }
  catch {
    try { symlinkSync(alias.wf, aliasPath, 'dir'); aliasReady = true; } catch {}
  }
  if (!aliasReady || !existsSync(join(aliasPath, 'test-baseline.json'))) {
    skip('protected-baseline-alias-blocked', 'directory junction/symlink unavailable');
  } else {
    writeFileSync(alias.planPath, JSON.stringify({ files: [
      { path: 'wf/alias/test-baseline.json', before_sha256: sha(protectedOriginal), content: 'ATTACKER-CONTENT' }
    ] }, null, 2) + '\n');
    const aliasRun = runApply(alias, {});
    const aliasResult = parseOutput(aliasRun);
    check('protected-baseline-alias-blocked', aliasRun.status !== 0 && aliasResult?.reason === 'NOT_ALLOWED',
      'exit=' + aliasRun.status + ' reason=' + (aliasResult?.reason ?? 'missing'));
    check('protected-baseline-alias-keeps-original', readFileSync(protectedFile, 'utf8') === protectedOriginal,
      'content=' + readFileSync(protectedFile, 'utf8').trim());
  }
} finally {
  if (race) rmSync(race.base, { recursive: true, force: true });
  if (parentPivot) rmSync(parentPivot.base, { recursive: true, force: true });
  if (caseCollision) rmSync(caseCollision.base, { recursive: true, force: true });
  if (atomic) rmSync(atomic.base, { recursive: true, force: true });
  if (applyCollision) rmSync(applyCollision.base, { recursive: true, force: true });
  if (rollbackCollision) rmSync(rollbackCollision.base, { recursive: true, force: true });
  if (alias) rmSync(alias.base, { recursive: true, force: true });
}
console.log('RESULT passed=' + passed + ' failed=' + failed + ' skipped=' + skipped);
if (failed) process.exitCode = 1;
