#!/usr/bin/env node
// T141 log concurrency + replay double-budget — hermetic via WF_ROOT.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WF = dirname(fileURLToPath(import.meta.url));
const PIPE = join(WF, 'pipeline.mjs');
const roots = [];
const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wf-t141-'));
  roots.push(root);
  mkdirSync(join(root, 'wf'), { recursive: true });
  writeFileSync(join(root, 'wf', 'state.json'), JSON.stringify({ seq: {}, claudeCalls: { byDate: {}, byTask: {} } }, null, 2));
  writeFileSync(join(root, 'LOG.md'), '# LOG\n');
  return root;
}
function logAsync(root, payload) {
  return new Promise((done) => {
    const p = spawn(process.execPath, [PIPE, 'log', JSON.stringify(payload)], {
      env: { ...process.env, WF_ROOT: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => done({ code: -1, out, err: String(e) }));
    p.on('close', (code) => done({ code, out: out.trim(), err: err.trim() }));
  });
}
function events(root) {
  return readFileSync(join(root, 'LOG.md'), 'utf8').split(/\r?\n/)
    .filter((l) => l.startsWith('- '))
    .map((l) => JSON.parse(l.slice(l.indexOf('|') + 1).trim()));
}
function budget(root) {
  const st = JSON.parse(readFileSync(join(root, 'wf', 'state.json'), 'utf8'));
  const byDate = Object.values(st.claudeCalls?.byDate ?? {}).reduce((a, b) => a + b, 0);
  return { byTask: st.claudeCalls?.byTask ?? {}, byDate };
}
function chain(root) {
  const r = spawnSync(process.execPath, [PIPE, 'verifychain'], { encoding: 'utf8', env: { ...process.env, WF_ROOT: root } });
  try { return JSON.parse(r.stdout); } catch { return null; }
}

// (i) 8 tien trinh cung payload (co claude trong relay): dung 1 dong moi, 7 tien trinh dedupe exit 0.
async function sameKeyScenario() {
  const root = fixture();
  const payload = { task: 'T141-A', seq: 1, hash: 'h141a', relay: 'chatgpt->claude->chatgpt', claude_calls: 0 };
  const rs = await Promise.all(Array.from({ length: 8 }, () => logAsync(root, payload)));
  const ev = events(root);
  const b = budget(root);
  return {
    exits: rs.map((r) => r.code).join(','),
    stderrEmpty: rs.every((r) => r.err === ''),
    newLines: ev.length,
    claudeCallsInLog: ev[0]?.claude_calls,
    byTask: b.byTask['T141-A'],
    byDate: b.byDate,
    chain: chain(root),
    lockLeft: existsSync(join(root, 'wf', '.log.lock')),
  };
}

// (i-bis) 8 tien trinh payload khac nhau: khong dong nao bi ghi chong.
async function distinctScenario() {
  const root = fixture();
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    logAsync(root, { task: 'T141-B', seq: i + 1, hash: 'h141b', relay: 'chatgpt->gemini->chatgpt', claude_calls: 0 })));
  const ev = events(root);
  return {
    exits: rs.map((r) => r.code).join(','),
    newLines: ev.length,
    seqs: ev.map((e) => e.seq).sort((a, b) => a - b).join(','),
    chain: chain(root),
    lockLeft: existsSync(join(root, 'wf', '.log.lock')),
  };
}

// (ii) replay cung idempotencyKey khi budget da cham tran: logged:false, khong tru them.
function replayScenario() {
  const root = fixture();
  const code = `
const { logEvent } = await import(${JSON.stringify(pathToFileURL(PIPE).href)});
const payload = { task: 'T141-C', seq: 1, hash: 'h141c', relay: 'chatgpt->claude', claude_calls: 0 };
const a = logEvent(payload);
const b = logEvent(payload);
console.log('@@RESULT@@' + JSON.stringify({ a, b }));
`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...process.env, WF_ROOT: root } });
  const line = (r.stdout || '').split(/\r?\n/).find((l) => l.startsWith('@@RESULT@@'));
  const res = line ? JSON.parse(line.slice('@@RESULT@@'.length)) : null;
  const b = budget(root);
  return {
    status: r.status,
    firstLogged: res?.a?.logged,
    replayLogged: res?.b?.logged,
    sameKey: Boolean(res?.a?.idempotencyKey) && res?.a?.idempotencyKey === res?.b?.idempotencyKey,
    newLines: events(root).length,
    byTask: b.byTask['T141-C'],
    byDate: b.byDate,
  };
}

try {
  const s1 = await sameKeyScenario();
  const s2 = await sameKeyScenario();
  const expect1 = { exits: '0,0,0,0,0,0,0,0', stderrEmpty: true, newLines: 1, claudeCallsInLog: 1, byTask: 1, byDate: 1, chain: { ok: true, checked: 1, legacy: 0, broken: [] }, lockLeft: false };
  check('1a-same-payload-x8-one-line', JSON.stringify(s1) === JSON.stringify(expect1), JSON.stringify(s1));
  check('1b-same-payload-rerun-identical', JSON.stringify(s1) === JSON.stringify(s2), JSON.stringify(s2));

  const d = await distinctScenario();
  const expectD = { exits: '0,0,0,0,0,0,0,0', newLines: 8, seqs: '1,2,3,4,5,6,7,8', chain: { ok: true, checked: 8, legacy: 0, broken: [] }, lockLeft: false };
  check('1c-distinct-payload-x8-no-overwrite', JSON.stringify(d) === JSON.stringify(expectD), JSON.stringify(d));

  const rp = replayScenario();
  const expectR = { status: 0, firstLogged: true, replayLogged: false, sameKey: true, newLines: 1, byTask: 1, byDate: 1 };
  check('2-replay-no-double-budget', JSON.stringify(rp) === JSON.stringify(expectR), JSON.stringify(rp));
} finally {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
}

const failed = results.filter((x) => !x.pass);
for (const x of results) console.log((x.pass ? 'PASS ' : 'FAIL ') + x.name + ' ' + x.detail);
console.log(JSON.stringify({ total: results.length, failed: failed.length }));
process.exit(failed.length ? 1 : 0);
