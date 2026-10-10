// F1b Bundle Task Validation Tests
// Run: node wf/test-bundle-task-validation.mjs
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync } from 'node:fs';

const __dirname = join(dirname(fileURLToPath(import.meta.url)));
const PIPELINE = join(__dirname, 'pipeline.mjs');
const ROOT = resolve(__dirname, '..');
const WF = join(ROOT, 'wf');

function runBundle(task, files = []) {
  return spawnSync('node', [PIPELINE, 'bundle', task, ...files], { cwd: ROOT, encoding: 'utf8' });
}
function runBundleCheck(task) {
  return spawnSync('node', [PIPELINE, 'bundle-check', task], { cwd: ROOT, encoding: 'utf8' });
}
function parseJSON(out) {
  try { return JSON.parse(out.trim()); } catch { return null; }
}

let passed = 0, failed = 0, skipped = 0;

function assert(name, condition, details = '') {
  if (condition) { console.log(`PASS ${name}`); passed++; }
  else { console.log(`FAIL ${name} ${details}`); failed++; }
}

function assertExit(name, result, expectedCode, expectedReason = null) {
  const ok = result.status === expectedCode;
  const reasonOk = expectedReason ? parseJSON(result.stdout)?.errors?.[0]?.reason === expectedReason : true;
  if (ok && reasonOk) { console.log(`PASS ${name}`); passed++; }
  else { console.log(`FAIL ${name} exit=${result.status} want=${expectedCode} reason=${parseJSON(result.stdout)?.errors?.[0]?.reason} wantReason=${expectedReason}`); failed++; }
}

// --- A. Task ID Validation ---
console.log('\n=== A. Task ID Validation ===');

assertExit('A1: T123 valid', runBundle('T123', ['wf/pipeline.mjs']), 0);
assertExit('A2: T123-abc valid', runBundle('T123-abc', ['wf/pipeline.mjs']), 0);
assertExit('A3: T123-FIX-BUG valid', runBundle('T123-FIX-BUG', ['wf/pipeline.mjs']), 0);
assertExit('A4: t123 lowercase reject', runBundle('t123', ['wf/pipeline.mjs']), 2, 'INVALID_TASK_ID');
assertExit('A5: T123- trailing dash reject', runBundle('T123-', ['wf/pipeline.mjs']), 2, 'INVALID_TASK_ID');
assertExit('A6: T123--BUG double dash reject', runBundle('T123--BUG', ['wf/pipeline.mjs']), 2, 'INVALID_TASK_ID');
assertExit('A7: T123_abc underscore reject', runBundle('T123_abc', ['wf/pipeline.mjs']), 2, 'INVALID_TASK_ID');
assertExit('A8: T123/../evil traversal reject', runBundle('T123/../evil', ['wf/pipeline.mjs']), 2, 'INVALID_TASK_ID');
assertExit('A9: T123\\n newline reject', runBundle('T123\n', ['wf/pipeline.mjs']), 2, 'INVALID_TASK_ID');
assertExit('A10: T123 trailing space reject', runBundle('T123 ', ['wf/pipeline.mjs']), 2, 'INVALID_TASK_ID');
assertExit('A11: empty string reject', runBundle('', ['wf/pipeline.mjs']), 2);
assertExit('A12: T only reject', runBundle('T', ['wf/pipeline.mjs']), 2, 'INVALID_TASK_ID');
assertExit('A13: 123 no T prefix reject', runBundle('123', ['wf/pipeline.mjs']), 2, 'INVALID_TASK_ID');

// --- B. Path Containment & Filesystem ---
console.log('\n=== B. Path Containment & Filesystem ===');

assertExit('B1: bundle traversal reject', runBundle('T123', ['../../evil.txt']), 2, 'TRAVERSAL');
assertExit('B2: bundle backslash traversal reject', runBundle('T123', ['..\\evil.txt']), 2, 'TRAVERSAL');
assertExit('B3: bundle blocked .env reject', runBundle('T123', ['.env']), 2, 'BLOCKED_PATH');
assertExit('B4: bundle blocked .git reject', runBundle('T123', ['.git/config']), 2, 'BLOCKED_PATH');
assertExit('B5: bundle file missing reject', runBundle('T123', ['wf/nonexistent.txt']), 2, 'FILE_MISSING');

// Test symlink/junction - only if we can create them
const testJunction = () => {
  const target = join(ROOT, 'evil-junction-target');
  const link = join(WF, 'bundles', 'T123-junction-test');
  try {
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'evil.txt'), 'evil');
    // Try to create junction (Windows) or symlink (Unix)
    symlinkSync(target, link, 'junction');
    const r = runBundle('T123-junction-test', ['wf/pipeline.mjs']);
    // Cleanup
    try { rmSync(link); } catch {}
    try { rmSync(target, { recursive: true }); } catch {}
    return r;
  } catch (e) {
    // Can't create junction/symlink, skip
    return { status: -1, stdout: 'SKIP' };
  }
};

const junctionResult = testJunction();
if (junctionResult.status === -1) {
  console.log('SKIP B6: symlink/junction escape (cannot create on this system)');
  skipped++;
} else {
  const reason = parseJSON(junctionResult.stdout)?.errors?.[0]?.reason;
  if (reason === 'TRAVERSAL' || reason === 'NOT_ALLOWED') {
    console.log(`PASS B6: junction escape reject (${reason})`);
    passed++;
  } else {
    console.log(`FAIL B6: junction escape reject reason=${reason} want=TRAVERSAL|NOT_ALLOWED`);
    failed++;
  }
}

// Test bundle directory already exists but canonical path outside (via existing junction)
const testExistingJunction = () => {
  const link = join(WF, 'bundles', 'T123-existing-junction');
  try {
    symlinkSync(ROOT, link, 'junction');
    const r = runBundle('T123-existing-junction', ['wf/pipeline.mjs']);
    try { rmSync(link); } catch {}
    return r;
  } catch (e) {
    return { status: -1, stdout: 'SKIP' };
  }
};

const existingJunctionResult = testExistingJunction();
if (existingJunctionResult.status === -1) {
  console.log('SKIP B7: existing junction escape (cannot create on this system)');
  skipped++;
} else {
  const reason = parseJSON(existingJunctionResult.stdout)?.errors?.[0]?.reason;
  if (reason === 'TRAVERSAL' || reason === 'NOT_ALLOWED') {
    console.log(`PASS B7: existing junction escape reject (${reason})`);
    passed++;
  } else {
    console.log(`FAIL B7: existing junction escape reject reason=${reason} want=TRAVERSAL|NOT_ALLOWED`);
    failed++;
  }
}
  
// Test bundle directory doesn't exist yet (new creation)
assertExit('B8: new bundle directory creation', runBundle('T123-new-create', ['wf/pipeline.mjs']), 0);

// Case sensitivity on Windows - skip if not applicable
console.log('SKIP B9: Windows drive letter case (P17 known limitation)');
skipped++;

// --- C. Bundle Integrity & CLI ---
console.log('\n=== C. Bundle Integrity & CLI ===');

// Create a valid bundle for integrity tests
const integrityTask = 'T123-integrity-test';
runBundle(integrityTask, ['wf/pipeline.mjs']); // setup

assertExit('C1: bundle-check valid', runBundleCheck(integrityTask), 0);

// Modify a file in bundle
const sumsPath = join(WF, 'bundles', integrityTask, 'SHA256SUMS');
const sumsContent = 'corrupted';
writeFileSync(sumsPath, sumsContent);
assertExit('C2: corrupted sums fail', runBundleCheck(integrityTask), 7, 'ANCHOR_MISMATCH');

// Restore and test missing file
runBundle(integrityTask, ['wf/pipeline.mjs']); // restore
const provPath = join(WF, 'bundles', integrityTask, 'provenance.json');
writeFileSync(provPath, '{}'); // malformed
assertExit('C3: malformed provenance fail', runBundleCheck(integrityTask), 7, 'MALFORMED');

// Restore and test hash mismatch
runBundle(integrityTask, ['wf/pipeline.mjs']); // restore
const sumsContent2 = readFileSync(sumsPath, 'utf8');
const sumsLines = sumsContent2.split('\n').filter(Boolean);
const firstLine = sumsLines[0];
const modifiedLine = firstLine.replace(/^[0-9a-f]{64}/, '0'.repeat(64));
writeFileSync(sumsPath, modifiedLine + '\n' + sumsLines.slice(1).join('\n') + '\n');
// Restore and test hash mismatch - anchor check runs first
runBundle(integrityTask, ['wf/pipeline.mjs']); // restore
const sumsContent3 = readFileSync(sumsPath, 'utf8');
const sumsLines3 = sumsContent3.split('\n').filter(Boolean);
const firstLine3 = sumsLines3[0];
const modifiedLine3 = firstLine3.replace(/^[0-9a-f]{64}/, '0'.repeat(64));
writeFileSync(sumsPath, modifiedLine3 + '\n' + sumsLines3.slice(1).join('\n') + '\n');
assertExit('C4: hash mismatch fail (anchor first)', runBundleCheck(integrityTask), 7, 'ANCHOR_MISMATCH');

// Restore and test missing file in bundle - anchor check runs first
runBundle(integrityTask, ['wf/pipeline.mjs']); // restore
writeFileSync(sumsPath, '0000000000000000000000000000000000000000000000000000000000000000  wf/missing.txt\n');
assertExit('C5: missing file in bundle fail (anchor first)', runBundleCheck(integrityTask), 7, 'ANCHOR_MISMATCH');

// Test invalid task ID in bundle-check
assertExit('C6: bundle-check invalid task id', runBundleCheck('invalid-task'), 2, 'INVALID_TASK_ID');

// Test I/O error not swallowed (permission denied would be hard to test)
// Just verify error structure
const r = runBundleCheck('T999-nonexistent');
assertExit('C7: bundle-check missing bundle', r, 7, 'BUNDLE_MISSING');

// --- Summary ---
console.log(`\n=== SUMMARY ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Skipped: ${skipped}`);
console.log(`Total: ${passed + failed + skipped}`);

if (failed > 0) process.exit(1);