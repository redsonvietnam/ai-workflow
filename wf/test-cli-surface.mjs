import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, check, done } from './lib/test-harness.mjs';

const WF = dirname(fileURLToPath(import.meta.url));
const ROOT = mkdtempSync(join(tmpdir(), 'wf-cli-surface-'));
const statePath = join(ROOT, 'wf', 'state.json');
mkdirSync(join(ROOT, 'wf'), { recursive: true });
const initialState = { seq: {}, tasks: {}, claudeCalls: { byDate: {}, byTask: {} } };
writeFileSync(statePath, JSON.stringify(initialState, null, 2) + '\n');
const hash = () => createHash('sha256').update(readFileSync(statePath)).digest('hex');

try {
  const before = hash();
  const positional = run(ROOT, ['make', 'T157', 'objective=x', 'files=wf/state.json']);
  const positionalOutput = String(positional.stdout ?? '') + '\n' + String(positional.stderr ?? '');
  check(
    'S12-positional-task-rejected',
    positional.status === 2 && /usage:/i.test(positionalOutput) && hash() === before,
    'exit=' + positional.status + '; stateUnchanged=' + (hash() === before) + '; output=' + positionalOutput.trim()
  );
  const writtenState = JSON.parse(readFileSync(statePath, 'utf8'));
  check(
    'S-state-key-undefined-rejected',
    !Object.hasOwn(writtenState.seq ?? {}, 'undefined') && !Object.hasOwn(writtenState.tasks ?? {}, 'undefined'),
    JSON.stringify({ seqKeys: Object.keys(writtenState.seq ?? {}), taskKeys: Object.keys(writtenState.tasks ?? {}) })
  );

  const unknown = run(ROOT, ['__w1_2_unknown_command__']);
  const unknownOutput = String(unknown.stdout ?? '') + '\n' + String(unknown.stderr ?? '');
  check(
    'S-unknown-command-exit-2',
    unknown.status === 2 && /UNKNOWN_COMMAND/.test(unknownOutput),
    'exit=' + unknown.status + '; output=' + unknownOutput.trim()
  );

  const commands = [
    'apply', 'bundle', 'bundle-check', 'dispute', 'escalation', 'gate', 'log',
    'make', 'parse', 'plan-extract', 'plan-prepare', 'prereg', 'reap', 'seal',
    'standalone', 'state-validate', 'status', 'task', 'validate', 'verifychain',
  ];
  for (const command of commands) {
    const result = run(ROOT, [command]);
    const output = String(result.stdout ?? '') + '\n' + String(result.stderr ?? '');
    check(
      'S-surface-' + command,
      !/UNKNOWN_COMMAND/.test(output),
      'exit=' + result.status + '; output=' + output.trim().slice(0, 180)
    );
  }
} finally {
  try { rmSync(ROOT, { recursive: true, force: true }); } catch {}
}
done();
