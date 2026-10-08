#!/usr/bin/env node
// T145 seal legacy events — hermetic via WF_ROOT.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WF = dirname(fileURLToPath(import.meta.url));
const PIPE = join(WF, 'pipeline.mjs');
const roots = [];
const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wf-t145-'));
  roots.push(root);
  mkdirSync(join(root, 'wf'), { recursive: true });
  writeFileSync(join(root, 'wf', 'state.json'), JSON.stringify({ seq: {}, claudeCalls: { byDate: {}, byTask: {} } }, null, 2));
  const legacy1 = '- 2026-10-01T00:00:00.000Z | {"task":"LEGACY-A","seq":1,"verdict":"PASS"}';
  const legacy2 = '- 2026-10-01T00:01:00.000Z | {"task":"LEGACY-B","seq":1,"verdict":"PASS"}';
  const legacy3 = '- 2026-10-01T00:02:00.000Z | {"task":"LEGACY-C","seq":1,"verdict":"PASS"}';
  writeFileSync(join(root, 'LOG.md'), '# LOG\n' + legacy1 + '\n' + legacy2 + '\n' + legacy3 + '\n');
  const code = `
const { logEvent } = await import(${JSON.stringify(pathToFileURL(PIPE).href)});
logEvent({ task: 'HASHED-1', seq: 1, hash: 'h1', verdict: 'PASS', claude_calls: 0 });
logEvent({ task: 'HASHED-2', seq: 1, hash: 'h2', verdict: 'PASS', claude_calls: 0 });
`;
  spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, WF_ROOT: root } });
  return root;
}
function run(root, cmd) {
  return spawnSync(process.execPath, [PIPE, cmd], { encoding: 'utf8', env: { ...process.env, WF_ROOT: root } });
}
function parseOut(r) {
  try { return JSON.parse(r.stdout); } catch { return null; }
}
function lineCount(root) {
  return readFileSync(join(root, 'LOG.md'), 'utf8').split(/\r?\n/).filter(l => l.startsWith('- ')).length;
}

try {
  // 1: seal thành công, legacyCount=3
  const r1 = fixture();
  const seal1 = run(r1, 'seal');
  const seal1Out = parseOut(seal1);
  check('1-seal-success', seal1.status === 0 && seal1Out?.ok === true && seal1Out?.status === 'SEALED' && seal1Out?.legacyCount === 3, JSON.stringify({ status: seal1.status, out: seal1Out }));

  // 2: verifyChain sealed:true, ok:true, exit 0
  const vc1 = run(r1, 'verifychain');
  const vc1Out = parseOut(vc1);
  check('2-verifychain-sealed-true', vc1.status === 0 && vc1Out?.sealed === true && vc1Out?.ok === true && vc1Out?.legacy === 3, JSON.stringify({ status: vc1.status, out: vc1Out }));

  // 3: seal lần hai → SEAL_EXISTS, không tăng số dòng
  const before3 = lineCount(r1);
  const seal2 = run(r1, 'seal');
  const seal2Out = parseOut(seal2);
  const after3 = lineCount(r1);
  check('3-seal-exists-idempotent', seal2.status === 0 && seal2Out?.status === 'SEAL_EXISTS' && before3 === after3, JSON.stringify({ status: seal2.status, out: seal2Out, before3, after3 }));

  // 4: sửa 1 ký tự legacy → verifychain LEGACY_TAMPER exit 4
  const logPath = join(r1, 'LOG.md');
  let logText = readFileSync(logPath, 'utf8');
  logText = logText.replace('LEGACY-A', 'LEGACY-X');
  writeFileSync(logPath, logText);
  const vc2 = run(r1, 'verifychain');
  const vc2Out = parseOut(vc2);
  check('4-tamper-legacy-tamper', vc2.status === 4 && vc2Out?.ok === false && vc2Out?.reason === 'LEGACY_TAMPER', JSON.stringify({ status: vc2.status, out: vc2Out }));

  // 5: seal sau tamper → LEGACY_TAMPER exit 4, không append
  const before5 = lineCount(r1);
  const seal3 = run(r1, 'seal');
  const seal3Out = parseOut(seal3);
  const after5 = lineCount(r1);
  check('5-seal-after-tamper-blocked', seal3.status === 4 && seal3Out?.reason === 'LEGACY_TAMPER' && before5 === after5, JSON.stringify({ status: seal3.status, out: seal3Out, before5, after5 }));

  // 6: nhiều SEAL → MULTIPLE_SEALS exit 4
  const r2 = fixture();
  run(r2, 'seal');
  const code2 = `
const { logEvent } = await import(${JSON.stringify(pathToFileURL(PIPE).href)});
logEvent({ task: 'T145', seq: 99, hash: 'second-seal', relay: null, verdict: 'PASS', type: 'SEAL', legacyCount: 99, legacyDigest: 'deadbeef', claude_calls: 0 });
`;
  spawnSync(process.execPath, ['--input-type=module', '-e', code2], { encoding: 'utf8', env: { ...process.env, WF_ROOT: r2 } });
  const vc3 = run(r2, 'verifychain');
  const vc3Out = parseOut(vc3);
  check('6-multiple-seals-fail-closed', vc3.status === 4 && vc3Out?.ok === false && vc3Out?.reason === 'MULTIPLE_SEALS', JSON.stringify({ status: vc3.status, out: vc3Out }));

  // 7: seal khi đã có nhiều SEAL → MULTIPLE_SEALS exit 4
  const seal4 = run(r2, 'seal');
  const seal4Out = parseOut(seal4);
  check('7-seal-multiple-seals-blocked', seal4.status === 4 && seal4Out?.reason === 'MULTIPLE_SEALS', JSON.stringify({ status: seal4.status, out: seal4Out }));

  // 8: không SEAL → verifychain không có sealed:true (backward-compat), ok:true exit 0
  const r3 = fixture();
  const vc4 = run(r3, 'verifychain');
  const vc4Out = parseOut(vc4);
  check('8-no-seal-no-sealed-field', vc4.status === 0 && vc4Out?.sealed === undefined && vc4Out?.ok === true && vc4Out?.legacy === 3, JSON.stringify({ status: vc4.status, out: vc4Out }));

  // 9: SEAL giả thiếu eventHash → SEAL_MALFORMED, fail-closed
  const r4 = fixture();
  const fakeSealLine = '- 2026-10-02T00:00:00.000Z | {"task":"FAKE","type":"SEAL","legacyCount":3,"legacyDigest":"x"}';
  writeFileSync(join(r4, 'LOG.md'), readFileSync(join(r4, 'LOG.md'), 'utf8') + fakeSealLine + '\n');
  const vc5 = run(r4, 'verifychain');
  const vc5Out = parseOut(vc5);
  check('9-fake-seal-no-eventhash-malformed', vc5.status === 4 && vc5Out?.ok === false && vc5Out?.reason === 'SEAL_MALFORMED', JSON.stringify({ status: vc5.status, out: vc5Out }));
  const before9 = lineCount(r4);
  const seal5 = run(r4, 'seal');
  const seal5Out = parseOut(seal5);
  const after9 = lineCount(r4);
  check('9b-seal-blocked-on-malformed', seal5.status === 4 && seal5Out?.reason === 'SEAL_MALFORMED' && before9 === after9, JSON.stringify({ status: seal5.status, out: seal5Out, before9, after9 }));

  // 10: sửa eventHash của SEAL (legacy giữ nguyên) → verifychain không sealed:true; seal → SEAL_INVALID
  const r5 = fixture();
  run(r5, 'seal');
  const lines5 = readFileSync(join(r5, 'LOG.md'), 'utf8').split(/\r?\n/);
  const newLines5 = lines5.map((l) => {
    const j = l.indexOf('|');
    if (j < 0) return l;
    try {
      const ev = JSON.parse(l.slice(j + 1).trim());
      if (ev.type === 'SEAL') { ev.eventHash = '0'.repeat(64); return l.slice(0, j + 1) + ' ' + JSON.stringify(ev); }
      return l;
    } catch { return l; }
  });
  writeFileSync(join(r5, 'LOG.md'), newLines5.join('\n'));
  const vc6 = run(r5, 'verifychain');
  const vc6Out = parseOut(vc6);
  check('10-seal-eventhash-tamper-not-sealed', vc6.status === 4 && vc6Out?.ok === false && vc6Out?.sealed === false, JSON.stringify({ status: vc6.status, out: vc6Out }));
  const seal6 = run(r5, 'seal');
  const seal6Out = parseOut(seal6);
  check('10b-seal-blocked-on-invalid-seal', seal6.status === 4 && seal6Out?.reason === 'SEAL_INVALID', JSON.stringify({ status: seal6.status, out: seal6Out }));
} finally {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
}

const failed = results.filter(x => !x.pass);
for (const x of results) console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + ' ' + x.detail);
console.log(JSON.stringify({ total: results.length, failed: failed.length }));
process.exit(failed.length ? 1 : 0);
