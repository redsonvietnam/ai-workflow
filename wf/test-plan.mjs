// T146 inbox/outbox — plan-extract, plan-prepare, full flow via WF_ROOT.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WF = dirname(fileURLToPath(import.meta.url));
const PIPE = join(WF, 'pipeline.mjs');
let failed = 0;
function check(name, ok, detail = '') {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + detail : ''));
  if (!ok) failed++;
}
function run(root, ...argv) {
  return spawnSync(process.execPath, [PIPE, ...argv], { encoding: 'utf8', env: { ...process.env, WF_ROOT: root }, timeout: 15000 });
}
function parseOut(r) {
  try { return JSON.parse(r.stdout); } catch { return null; }
}
const ROOT = mkdtempSync(join(process.env.TEMP || process.env.TMP, 't146-'));
mkdirSync(join(ROOT, 'wf'), { recursive: true });
writeFileSync(join(ROOT, 'wf', 'state.json'), JSON.stringify({ seq: {}, tasks: {} }, null, 2));

// 1: plan-extract OK — khối json cuối có files[]
const reply1 = 'text trước\n```json\n{"files":[{"path":"a.txt","content":"A"}]}\n```\ntext sau\n```json\n{"files":[{"path":"b.txt","content":"B"}]}\n```';
const rf1 = join(ROOT, 'reply1.md');
writeFileSync(rf1, reply1);
const e1 = run(ROOT, 'plan-extract', rf1);
const e1Out = parseOut(e1);
check('1-extract-ok', e1.status === 0 && e1Out?.ok === true && e1Out?.files?.length === 1 && e1Out?.files?.[0] === 'b.txt', JSON.stringify(e1Out));

// 2: plan-extract — before_sha256 bị loại bỏ
const reply2 = '```json\n{"files":[{"path":"a.txt","content":"A","before_sha256":"deadbeef"}]}\n```';
const rf2 = join(ROOT, 'reply2.md');
writeFileSync(rf2, reply2);
const e2 = run(ROOT, 'plan-extract', rf2);
check('2-extract-strip-before', e2.status === 0, `status=${e2.status}`);
const extracted = JSON.parse(readFileSync(join(ROOT, 'wf', 'plan.extracted.json'), 'utf8'));
check('2b-no-before-sha', extracted.files[0].before_sha256 === undefined, JSON.stringify(extracted.files[0]));

// 3: plan-extract hỏng → PLAN_NOT_FOUND exit 2
const rf3 = join(ROOT, 'reply3.md');
writeFileSync(rf3, 'không có json');
const e3 = run(ROOT, 'plan-extract', rf3);
check('3-extract-malformed', e3.status === 2 && parseOut(e3)?.reason === 'PLAN_NOT_FOUND', JSON.stringify(parseOut(e3)));

// 4: plan-prepare — file có trong envelope → before_sha256 = hash envelope
const target1 = join(ROOT, 'wf', 'target1.txt');
writeFileSync(target1, 'original');
const h1 = spawnSync(process.execPath, ['-e', `const{createHash}=require('crypto');console.log(createHash('sha256').update(require('fs').readFileSync(${JSON.stringify(target1)})).digest('hex'))`], { encoding: 'utf8' }).stdout.trim();
const env1 = join(ROOT, 'env1.txt');
writeFileSync(env1, `[WF:v1]\nTASK: T146\nINPUT:\nFILE_SHA256: wf/target1.txt=${h1}\n`);
const plan1 = join(ROOT, 'plan1.json');
writeFileSync(plan1, JSON.stringify({ files: [{ path: 'wf/target1.txt', content: 'updated' }] }));
const p1 = run(ROOT, 'plan-prepare', plan1, '--envelope', env1);
const p1Out = parseOut(p1);
check('4-prepare-with-env-hash', p1.status === 0 && p1Out?.ok === true && p1Out?.files?.[0]?.before === h1, JSON.stringify(p1Out));

// 5: plan-prepare — file mới không có trong envelope → before_sha256 = null
const plan2 = join(ROOT, 'plan2.json');
writeFileSync(plan2, JSON.stringify({ files: [{ path: 'wf/newfile.txt', content: 'hello' }] }));
const p2 = run(ROOT, 'plan-prepare', plan2, '--envelope', env1);
const p2Out = parseOut(p2);
check('5-prepare-new-file-null', p2.status === 0 && p2Out?.ok === true && p2Out?.files?.[0]?.before === null, JSON.stringify(p2Out));

// 6: plan-prepare — file tồn tại nhưng không có trong envelope → NOT_IN_ENVELOPE exit 2
const plan3 = join(ROOT, 'plan3.json');
writeFileSync(plan3, JSON.stringify({ files: [{ path: 'wf/target1.txt', content: 'x' }] }));
const env2 = join(ROOT, 'env2.txt');
writeFileSync(env2, '[WF:v1]\nTASK: T146\nINPUT: (empty)\n');
const p3 = run(ROOT, 'plan-prepare', plan3, '--envelope', env2);
check('6-prepare-not-in-envelope', p3.status === 2 && parseOut(p3)?.reason === 'NOT_IN_ENVELOPE', JSON.stringify(parseOut(p3)));

// 7: full flow — extract → prepare → apply ghi đúng file
const target2 = join(ROOT, 'wf', 'target2.txt');
writeFileSync(target2, 'v1');
const h2 = spawnSync(process.execPath, ['-e', `const{createHash}=require('crypto');console.log(createHash('sha256').update(require('fs').readFileSync(${JSON.stringify(target2)})).digest('hex'))`], { encoding: 'utf8' }).stdout.trim();
const env3 = join(ROOT, 'env3.txt');
writeFileSync(env3, `FILE_SHA256: wf/target2.txt=${h2}\n`);
const reply7 = '```json\n{"files":[{"path":"wf/target2.txt","content":"v2-final"}]}\n```';
const rf7 = join(ROOT, 'reply7.md');
writeFileSync(rf7, reply7);
run(ROOT, 'plan-extract', rf7);
run(ROOT, 'plan-prepare', join(ROOT, 'wf', 'plan.extracted.json'), '--envelope', env3);
const ap1 = run(ROOT, 'apply', join(ROOT, 'wf', 'plan.prepared.json'));
const ap1Out = parseOut(ap1);
check('7-full-flow-apply', ap1.status === 0 && ap1Out?.ok === true && readFileSync(target2, 'utf8') === 'v2-final', JSON.stringify(ap1Out));

// 8: full flow — file bị sửa giữa envelope và apply → STALE_REJECT exit 8
const target3 = join(ROOT, 'wf', 'target3.txt');
writeFileSync(target3, 'v1');
const h3 = spawnSync(process.execPath, ['-e', `const{createHash}=require('crypto');console.log(createHash('sha256').update(require('fs').readFileSync(${JSON.stringify(target3)})).digest('hex'))`], { encoding: 'utf8' }).stdout.trim();
const env4 = join(ROOT, 'env4.txt');
writeFileSync(env4, `FILE_SHA256: wf/target3.txt=${h3}\n`);
const reply8 = '```json\n{"files":[{"path":"wf/target3.txt","content":"v2"}]}\n```';
const rf8 = join(ROOT, 'reply8.md');
writeFileSync(rf8, reply8);
run(ROOT, 'plan-extract', rf8);
run(ROOT, 'plan-prepare', join(ROOT, 'wf', 'plan.extracted.json'), '--envelope', env4);
writeFileSync(target3, 'raced');
const ap2 = run(ROOT, 'apply', join(ROOT, 'wf', 'plan.prepared.json'));
check('8-full-flow-stale', ap2.status === 8 && readFileSync(target3, 'utf8') === 'raced', `status=${ap2.status}`);

// 9: plan-prepare traversal → exit 2
const planT = join(ROOT, 'planT.json');
writeFileSync(planT, JSON.stringify({ files: [{ path: join(ROOT, '..', 'escape.txt'), content: 'x' }] }));
const pT = run(ROOT, 'plan-prepare', planT, '--envelope', env1);
check('9-prepare-traversal', pT.status === 2 && parseOut(pT)?.reason === 'TRAVERSAL', JSON.stringify(parseOut(pT)));

// 10: plan-extract entry sai cấu trúc → PLAN_MALFORMED exit 2 + không tạo output mới
const extractBefore10 = existsSync(join(ROOT, 'wf', 'plan.extracted.json')) ? readFileSync(join(ROOT, 'wf', 'plan.extracted.json'), 'utf8') : null;
const reply10 = '```json\n{"files":[{"path":"a.txt","content":"A"},{"nope":true},{"path":"","content":"x"},{"path":"b.txt"}]}\n```';
const rf10 = join(ROOT, 'reply10.md');
writeFileSync(rf10, reply10);
const e10 = run(ROOT, 'plan-extract', rf10);
const extractAfter10 = existsSync(join(ROOT, 'wf', 'plan.extracted.json')) ? readFileSync(join(ROOT, 'wf', 'plan.extracted.json'), 'utf8') : null;
check('10-extract-bad-entries-fail-closed', e10.status === 2 && parseOut(e10)?.reason === 'PLAN_MALFORMED' && extractAfter10 === extractBefore10, JSON.stringify(parseOut(e10)));

// 11: plan-extract toàn entry sai → PLAN_MALFORMED exit 2
const reply11 = '```json\n{"files":[{"nope":1},{"path":"","content":""}]}\n```';
const rf11 = join(ROOT, 'reply11.md');
writeFileSync(rf11, reply11);
const e11 = run(ROOT, 'plan-extract', rf11);
check('11-extract-all-bad', e11.status === 2 && parseOut(e11)?.reason === 'PLAN_MALFORMED', JSON.stringify(parseOut(e11)));

// 12: symlink escape (Windows: mklink /D) → TRAVERSAL exit 2
const outsideDir = mkdtempSync(join(process.env.TEMP || process.env.TMP, 't146-out-'));
writeFileSync(join(outsideDir, 'escape.txt'), 'leaked');
const linkPath = join(ROOT, 'wf', 'symescape');
let symlinkOk = false;
try { spawnSync('cmd', ['/c', 'mklink', '/D', linkPath, outsideDir], { encoding: 'utf8' }); symlinkOk = existsSync(linkPath); } catch { /* skip */ }
if (symlinkOk) {
  const planS = join(ROOT, 'planS.json');
  writeFileSync(planS, JSON.stringify({ files: [{ path: 'wf/symescape/escape.txt', content: 'x' }] }));
  const pS = run(ROOT, 'plan-prepare', planS, '--envelope', env1);
  check('12-prepare-symlink-escape', pS.status === 2 && parseOut(pS)?.reason === 'TRAVERSAL', JSON.stringify(parseOut(pS)));
} else {
  check('12-prepare-symlink-escape', true, 'SKIP (symlink unavailable)');
}

console.log(JSON.stringify({ total: 12, failed }));
process.exit(failed ? 1 : 0);
