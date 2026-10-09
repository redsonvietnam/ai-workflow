#!/usr/bin/env node
// WF:v1 pipeline — HASH/SEQ do script tính, KHÔNG nhờ model.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, closeSync, unlinkSync, renameSync, realpathSync } from 'node:fs';
import { logPayload } from './payload-log.mjs';
import { dirname, join, resolve, sep, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.WF_ROOT ? resolve(process.env.WF_ROOT) : SCRIPT_ROOT;
let ROOT_REAL;
try { ROOT_REAL = realpathSync(ROOT); } catch { console.error('ROOT_REAL_FAILED'); process.exit(2); }
const WF = join(ROOT, 'wf');
const STATE = join(WF, 'state.json');
const LOG = join(ROOT, 'LOG.md');

function loadState() {
  if (!existsSync(STATE)) return { seq: {} };
  return JSON.parse(readFileSync(STATE, 'utf8'));
}
function saveState(s) {
  const tmp = STATE + '.tmp';
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, STATE);
}
export function sha256(s) { return createHash('sha256').update(s, 'utf8').digest('hex'); }
const WIN = process.platform === 'win32';
const norm = (p) => WIN ? p.replace(/\\/g, '/').toLowerCase() : p.replace(/\\/g, '/');
// F2: wrapper log outcome+reason + điểm thoát duy nhất
function logOutcome(outcome, reason, extra = {}) {
  console.error(JSON.stringify({ outcome, reason, ...extra }));
}
function writeOutAndExit(obj, code = 0) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  process.exit(code);
}
function exitWith(reason, extra = {}, code = 2) {
  logOutcome('ERROR', reason, extra);
  writeOutAndExit({ ok: false, reason, ...extra }, code);
}
function successOutcome(written = []) {
  logOutcome('SUCCESS', 'SUCCESS', { written });
  writeOutAndExit({ ok: true, written }, 0);
}
// containment theo thành phần đường dẫn — không false-positive '..notes' (review ChatGPT)
function escapesRoot(rel) {
  if (rel === '' || isAbsolute(rel)) return true;
  return rel.split(/[\\/]+/).some((seg) => seg === '..');
}
// (ii) Windows strip semantics: segment không được kết thúc bằng space/dot (trừ '.' và '..'),
// nếu không '.env ' sẽ thành '.env' ở tầng FS và bypass blocklist.
function winNormalize(rawPath) {
  if (!WIN) return rawPath;
  return rawPath.split(/[\\/]+/).map((seg) => (seg === '.' || seg === '..') ? seg : seg.replace(/[ .]+$/, '')).join('/');
}
// F2: errorClass mapping table (single source of truth)
const ERROR_CLASS_MAP = {
  TRAVERSAL: 'VALIDATE_REJECT',
  BLOCKED_PATH: 'VALIDATE_REJECT',
  NOT_ALLOWED: 'VALIDATE_REJECT',
  ENTRY_INVALID: 'VALIDATE_REJECT',
  PLAN_MALFORMED: 'VALIDATE_REJECT',
  PLAN_EMPTY: 'VALIDATE_REJECT',
  NO_PLAN: 'VALIDATE_REJECT',
  CONTENT_UNREADABLE: 'VALIDATE_REJECT',
  ENTRY_NO_CONTENT: 'VALIDATE_REJECT',
  STALE_REJECT: 'CONCURRENCY',
  LOCKED: 'CONCURRENCY',
  APPLY_ERROR: 'IO_ERROR',
};

function errorClassFor(reason) {
  return ERROR_CLASS_MAP[reason] ?? 'INTERNAL';
}

// F2: log to JSONL file (wf/logs/code-local-payloads.jsonl)
function logToJsonl(entry) {
  try {
    mkdirSync(dirname(join(WF, 'logs', 'code-local-payloads.jsonl')), { recursive: true });
    appendFileSync(join(WF, 'logs', 'code-local-payloads.jsonl'), JSON.stringify(entry) + '\n');
  } catch { /* best-effort, never throw */ }
}

// F2: redaction function (shared)
function redactForLog(text) {
  if (!text) return text;
  let out = String(text);
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

// F2: single logOnce function - writes one JSONL line with all required fields
function logOnce(result, taskId, rawPaths, canonicalPaths) {
  const entry = {
    ts: new Date().toISOString(),
    pid: process.pid,
    taskId: taskId ?? null,
    entryCount: Array.isArray(rawPaths) ? rawPaths.length : 0,
    rawPaths: rawPaths ?? [],
    canonicalPaths: canonicalPaths ?? [],
    outcome: result.ok ? 'SUCCESS' : 'ERROR',
    reason: result.ok ? 'SUCCESS' : (result.reason ?? 'UNKNOWN'),
    errorClass: result.ok ? 'OK' : errorClassFor(result.reason),
  };
  // For blocked branches: include sha256 + length of content instead of preview
  if (!result.ok && result.written) {
    entry.written = result.written;
  } else if (!result.ok && result.extra && result.extra.content) {
    const content = String(result.extra.content);
    entry.contentSha256 = createHash('sha256').update(content, 'utf8').digest('hex');
    entry.contentLength = Buffer.byteLength(content, 'utf8');
  }
  // Redact before any truncation
  const redactedEntry = JSON.parse(redactForLog(JSON.stringify(entry)));
  logToJsonl(redactedEntry);
}

// F2: ApplyReject error class - replaces bail()
class ApplyReject extends Error {
  constructor(reason, extra = {}) {
    super(reason);
    this.name = 'ApplyReject';
    this.reason = reason;
    this.extra = extra;
  }
}

// F2: core apply logic - returns result object, never calls process.exit
async function runApply(planPath) {
  const planText = readFileSync(planPath, 'utf8');
  let plan;
  try { plan = JSON.parse(planText); } catch { throw new ApplyReject('PLAN_MALFORMED'); }
  const entries = Array.isArray(plan) ? plan : plan.files;
  if (!Array.isArray(entries) || entries.length === 0) throw new ApplyReject('PLAN_EMPTY');
  const allowRel = (rel) => rel.split(sep).join('/').startsWith('wf/') || /^(CONTEXT|DECISIONS|LOG)\.md$/.test(rel) || /^\.git(ignore|attributes)$/.test(rel);
  const resolved = [];
  const rawPaths = [];
  const canonicalPaths = [];
  for (const e of entries) {
    if (!e || typeof e.path !== 'string' || e.path.length === 0) throw new ApplyReject('ENTRY_INVALID', { entry: e });
    if (e.before_sha256 !== null && !(typeof e.before_sha256 === 'string' && /^[0-9a-f]{64}$/.test(e.before_sha256))) throw new ApplyReject('ENTRY_INVALID', { entry: e });
    const v = validateWorkspacePath(e.path);
    if (!v.ok) throw new ApplyReject(v.reason, { path: e.path });
    const { abs, rel } = v;
    if (!allowRel(rel)) throw new ApplyReject('NOT_ALLOWED', { rel });
    rawPaths.push(e.path);
    canonicalPaths.push(v.abs);
    let content = null;
    if (typeof e.content === 'string') content = e.content;
    else if (typeof e.contentPath === 'string') {
      try { content = readFileSync(resolve(ROOT, e.contentPath), 'utf8'); } catch { throw new ApplyReject('CONTENT_UNREADABLE', { path: e.contentPath }); }
    } else throw new ApplyReject('ENTRY_NO_CONTENT', { entry: e });
    resolved.push({ abs: v.abs, rel, before: e.before_sha256, content });
  }
  const LOCK = join(WF, '.apply.lock');
  let fd = null;
  try { fd = openSync(LOCK, 'wx'); } catch { throw new ApplyReject('LOCKED', { lock: LOCK }); }
  const temps = [];
  let result, exitCode = 0;
  try {
    const stale = [];
    for (const e of resolved) {
      const cur = existsSync(e.abs) ? createHash('sha256').update(readFileSync(e.abs)).digest('hex') : null;
      if (cur !== e.before) stale.push({ path: e.rel, expected: e.before, actual: cur });
    }
    if (stale.length) { throw new ApplyReject('STALE_REJECT', { stale }); }
    const written = [];
    for (const e of resolved) {
      const tmp = e.abs + '.tmp-apply-' + process.pid;
      writeFileSync(tmp, e.content, 'utf8');
      renameSync(tmp, e.abs);
      written.push(e.rel);
    }
    return { ok: true, written, writtenRel: written };
  } finally {
    // Release lock before logging
    try { if (fd !== null) closeSync(fd); } catch { /* ignore */ }
    try { if (existsSync(LOCK)) unlinkSync(LOCK); } catch { /* ignore */ }
    // Cleanup temps
    for (const t of temps) { try { if (existsSync(t)) unlinkSync(t); } catch { /* ignore */ } }
  }
}
function inRoot(candidate) {
  const rel = relative(ROOT_REAL, candidate);
  if (escapesRoot(rel)) return false;
  return true;
}
function safeContain(abs) {
  let real;
  try { real = realpathSync(abs); } catch { real = null; }
  if (real) return inRoot(real);
  let dir = dirname(abs);
  while (true) {
    try { const rd = realpathSync(dir); return inRoot(rd); }
    catch { const parent = dirname(dir); if (parent === dir) return false; dir = parent; }
  }
}

// F1: blocklist segment — .git/.ssh/.aws/.envrc/.env(.khiêm tốn) trên canonical path
const BLOCK_RE = /(^|\/)(\.git|\.ssh|\.aws|\.envrc|\.env)(\.|\/|$)/i;
function normSeg(p) { const n = p.split(sep).join('/'); return WIN ? n.toLowerCase() : n; }
function realpathResolved(p) {
  try { return realpathSync(p); } catch { /* walk up */ }
  let dir = dirname(p);
  while (true) {
    try { return join(realpathSync(dir), relative(dir, p)); }
    catch { const parent = dirname(dir); if (parent === dir) return null; dir = parent; }
  }
}
// F1: một hàm validate duy nhất cho make và apply (Claude: không vá riêng lẻ).
// Trả về { ok, abs, rel } hoặc { ok:false, reason } — reason ∈ TRAVERSAL | BLOCKED_PATH.
export function validateWorkspacePath(raw) {
  const normRaw = winNormalize(raw);
  const abs = isAbsolute(normRaw) ? resolve(normRaw) : resolve(ROOT, normRaw);
  const rel = relative(ROOT, abs);
  if (escapesRoot(rel)) return { ok: false, reason: 'TRAVERSAL', path: raw };
  const real = realpathResolved(abs);
  if (!real) return { ok: false, reason: 'TRAVERSAL', path: raw }; // fail-closed khi không resolve được realpath
  const rr = relative(normSeg(ROOT_REAL), normSeg(real));
  if (escapesRoot(rr)) return { ok: false, reason: 'TRAVERSAL', path: raw };
  if (BLOCK_RE.test(normSeg(rr))) return { ok: false, reason: 'BLOCKED_PATH', path: raw };
  if (BLOCK_RE.test(normSeg(rel))) return { ok: false, reason: 'BLOCKED_PATH', path: raw };
  return { ok: true, abs, rel };
}

export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}
export function computeEventHash(prevHash, meta) {
  const { prevHash: _p, eventHash: _e, ...rest } = meta;
  return sha256((prevHash ?? 'GENESIS') + canonical(rest));
}
export function lastEventHash() {
  if (!existsSync(LOG)) return null;
  const lines = readFileSync(LOG, 'utf8').split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const j = lines[i].indexOf('|');
    if (j < 0) continue;
    try {
      const ev = JSON.parse(lines[i].slice(j + 1).trim());
      if (ev.eventHash) return ev.eventHash;
    } catch { continue; }
  }
  return null;
}
export function bundleCreate(task, paths) {
  const dir = join(WF, 'bundles', task);
  mkdirSync(dir, { recursive: true });
  const files = [];
  const lines = [];
  for (const p of paths) {
    const h = sha256(readFileSync(join(ROOT, p)));
    files.push({ path: p, sha256: h });
    lines.push(`${h}  ${p}`);
  }
  const sums = lines.join('\n') + '\n';
  writeFileSync(join(dir, 'SHA256SUMS'), sums);
  const st = loadState();
  const gitCommit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: ROOT }).stdout?.trim() ?? null;
  const provenance = { taskId: task, attemptId: st.tasks?.[task]?.attempts ?? 0, createdAt: new Date().toISOString(), gitCommit, files, anchor: sha256(sums) };
  writeFileSync(join(dir, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
  return provenance;
}
export function bundleCheck(task) {
  const dir = join(WF, 'bundles', task);
  const sumsPath = join(dir, 'SHA256SUMS');
  const provPath = join(dir, 'provenance.json');
  if (!existsSync(sumsPath) || !existsSync(provPath)) return { ok: false, errors: [{ path: dir, reason: 'BUNDLE_MISSING' }] };
  const errors = [];
  const sums = readFileSync(sumsPath, 'utf8');
  let prov = null;
  try { prov = JSON.parse(readFileSync(provPath, 'utf8')); } catch { prov = null; }
  if (!prov || !prov.anchor) return { ok: false, errors: [{ path: 'provenance.json', reason: 'MALFORMED' }] };
  if (prov.anchor !== sha256(sums)) errors.push({ path: 'SHA256SUMS', reason: 'ANCHOR_MISMATCH' });
  for (const line of sums.split(/\r?\n/).filter(Boolean)) {
    const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (!m) { errors.push({ path: line, reason: 'SUMS_MALFORMED' }); continue; }
    const [, h, p] = m;
    try { if (sha256(readFileSync(join(ROOT, p))) !== h) errors.push({ path: p, reason: 'HASH_MISMATCH' }); }
    catch { errors.push({ path: p, reason: 'MISSING' }); }
  }
  return { ok: errors.length === 0, errors };
}
export function collectSealInfo(logText) {
  const legacyLines = [];
  const seals = [];
  const malformedSeals = [];
  for (const line of String(logText ?? '').split(/\r?\n/)) {
    const j = line.indexOf('|');
    if (j < 0) continue;
    let ev;
    try { ev = JSON.parse(line.slice(j + 1).trim()); } catch { continue; }
    if (!ev) continue;
    if (ev.type === 'SEAL') {
      if (ev.eventHash) seals.push(ev);
      else malformedSeals.push(ev);
      continue;
    }
    if (!ev.eventHash) legacyLines.push(line);
  }
  const legacyDigest = sha256(legacyLines.join('\n'));
  return { legacyLines, legacyCount: legacyLines.length, legacyDigest, seals, malformedSeals };
}
export function verifyChain(logText) {
  const checked = [];
  const legacy = [];
  const broken = [];
  let prev = 'GENESIS';
  for (const line of String(logText ?? '').split(/\r?\n/)) {
    const j = line.indexOf('|');
    if (j < 0) continue;
    let ev;
    try { ev = JSON.parse(line.slice(j + 1).trim()); } catch { continue; }
    if (!ev || !ev.eventHash) { legacy.push(ev?.task ?? '?'); continue; }
    const expect = computeEventHash(ev.prevHash, ev);
    if (ev.prevHash !== prev || ev.eventHash !== expect) {
      broken.push({ task: ev.task, linkOk: ev.prevHash === prev, hashOk: ev.eventHash === expect });
      break;
    }
    prev = ev.eventHash;
    checked.push(ev.task ?? '?');
  }
  const result = { ok: broken.length === 0, checked: checked.length, legacy: legacy.length, broken };
  if (broken.length > 0) {
    result.reason = 'CHAIN_BROKEN';
  }
  const sealInfo = collectSealInfo(logText);
  if (sealInfo.malformedSeals.length > 0) {
    result.ok = false;
    result.reason = 'SEAL_MALFORMED';
    result.sealed = false;
  } else if (sealInfo.seals.length > 1) {
    result.ok = false;
    result.reason = 'MULTIPLE_SEALS';
    result.sealed = false;
  } else if (sealInfo.seals.length === 1) {
    const seal = sealInfo.seals[0];
    const digestOk = seal.legacyDigest === sealInfo.legacyDigest && seal.legacyCount === sealInfo.legacyCount;
    if (digestOk && broken.length === 0) {
      result.sealed = true;
    } else {
      if (!digestOk) {
        result.ok = false;
        result.reason = 'LEGACY_TAMPER';
      }
      result.sealed = false;
    }
  }
  return result;
}

export function checkEscalation(task, today = new Date().toISOString().slice(0, 10), additionalCalls = 1) {
  const st = loadState();
  const calls = st.claudeCalls ?? { byDate: {}, byTask: {} };
  const byDate = calls.byDate ?? {};
  const byTask = calls.byTask ?? {};
  const n = Math.max(0, Number(additionalCalls) || 0);
  if (Number(byTask[task] ?? 0) + n > 1 || Number(byDate[today] ?? 0) + n > 2) {
    return { ok: false, reason: 'HUMAN_REQUIRED' };
  }
  return { ok: true };
}

function consumeEscalation(task, additionalCalls, today = new Date().toISOString().slice(0, 10)) {
  const st = loadState();
  const calls = st.claudeCalls ?? { byDate: {}, byTask: {} };
  calls.byDate = calls.byDate ?? {};
  calls.byTask = calls.byTask ?? {};
  const n = Math.max(0, Number(additionalCalls) || 0);
  calls.byTask[task] = Number(calls.byTask[task] ?? 0) + n;
  calls.byDate[today] = Number(calls.byDate[today] ?? 0) + n;
  st.claudeCalls = calls;
  saveState(st);
}

export function makeEnvelope({ task, role = 'CHATGPT', objective, contextRef = '', input = '', ask, constraints = [] }) {
  const st = loadState();
  st.seq[task] = (st.seq[task] || 0) + 1;
  st.tasks = st.tasks ?? {};
  if (!st.tasks[task]) {
    const now = new Date().toISOString();
    st.tasks[task] = { state: 'CREATED', attempts: 0, timeoutMs: 8 * 3600000, createdAt: now, updatedAt: now };
  }
  saveState(st);
  const seq = st.seq[task];
  const body = { task, seq, role, objective, contextRef, input, ask, constraints };
  const hash = sha256(JSON.stringify(body)).slice(0, 16);
  const env = [
    '[WF:v1]',
    `TASK: ${task}`,
    `SEQ: ${seq}`,
    `ROLE: ${role}`,
    `HASH: ${hash}`,
    `OBJECTIVE: ${objective}`,
    contextRef ? `CONTEXT_REF: ${contextRef}` : null,
    `INPUT: ${input}`,
    `ASK: ${ask}`,
    constraints.length ? `CONSTRAINTS:\n${constraints.map(c => `- ${c}`).join('\n')}` : null,
    'OUTPUT:',
    '  VERDICT: PASS|FAIL|UNCERTAIN',
    '  DELTA: <new information only>',
    '  ACTION: <next concrete action>',
    '  EVIDENCE: <path/hash/test>',
  ].filter(Boolean).join('\n');
  return { envelope: env, hash, seq };
}

// Parser chịu lỗi: chấp nhận markdown bold, bullet, retry khi thiếu VERDICT.
export function verifyReply(raw, expectedHash, expectedSeq) {
  const clean = raw.replace(/\*\*/g, '').replace(/^#{1,6}\s*/gm, '');
  const hash = clean.match(/(?:^|\n)\s*[-*]?\s*HASH\s*[:=]\s*([^\s\n]+)/i)?.[1] ?? null;
  const seq = clean.match(/(?:^|\n)\s*[-*]?\s*SEQ\s*[:=]\s*(\d+)/i)?.[1] ?? null;
  const ok = hash === expectedHash && seq !== null && Number(seq) === Number(expectedSeq);
  return { ok, hash, seq: seq === null ? null : Number(seq), reason: ok ? null : 'HASH_SEQ_MISMATCH' };
}

export function parseResponse(raw) {
  const out = { ok: false, verdict: null, delta: null, action: null, evidence: null, chars: [...raw].length, hash: sha256(raw).slice(0, 16) };
  const clean = raw.replace(/^﻿/, '').replace(/\*\*/g, '').replace(/^#{1,6}\s*/gm, '');
  const vm = clean.match(/\bVERDICT\b[\s:\-–—]{0,12}\b(PASS|FAIL|UNCERTAIN)\b/i)
    || clean.match(/\b(PASS|FAIL|UNCERTAIN)\b(?=[\s,.)]|$)/i);
  if (!vm) { out.reason = 'VERDICT missing — needs retry'; return out; }
  out.verdict = vm[1].toUpperCase();
  const grab = (name) => {
    const m = clean.match(new RegExp('(?:^|\\n)\\s*[-*]?\\s*' + name + '[\\s:\\-–—]{0,12}([^\\n]+)', 'i'));
    return m ? m[1].trim() : null;
  };
  out.delta = grab('DELTA');
  out.action = grab('ACTION');
  out.evidence = grab('EVIDENCE');
  out.ok = true;
  return out;
}

export function decideVerdict(parsed, conditions = {}) {
  const scriptVerdict = conditions.verdict || (conditions.pass === true ? 'PASS' : conditions.fail === true ? 'FAIL' : 'UNCERTAIN');
  const modelVerdict = parsed?.verdict ?? null;
  return {
    verdict: scriptVerdict,
    modelRecommendation: modelVerdict,
    mismatch: modelVerdict !== null && modelVerdict !== scriptVerdict,
    mismatchReason: modelVerdict !== null && modelVerdict !== scriptVerdict ? 'MODEL_VERDICT_MISMATCH' : null,
  };
}

const LOG_LOCK = join(WF, '.log.lock');
const LOG_LOCK_TIMEOUT_MS = 15000;
const LOG_LOCK_STALE_MS = 30000;

function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err?.code === 'EPERM'; }
}
function lockStaleness(raw) {
  let info = null;
  try { info = JSON.parse(raw); } catch { info = null; }
  if (!info) return null;
  return !pidAlive(info.pid) || Date.now() - Number(info.ts) > LOG_LOCK_STALE_MS;
}
function acquireLogLock() {
  mkdirSync(WF, { recursive: true });
  const deadline = Date.now() + LOG_LOCK_TIMEOUT_MS;
  let unknownSince = null;
  for (;;) {
    try {
      const fd = openSync(LOG_LOCK, 'wx');
      try { writeFileSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now() })); } catch { /* lock van duoc giu */ }
      return fd;
    } catch (err) {
      if (err?.code !== 'EEXIST') throw err;
    }
    if (Date.now() > deadline) throw new Error('LOG_LOCK_TIMEOUT');
    let raw;
    try { raw = readFileSync(LOG_LOCK, 'utf8'); } catch { continue; }
    let stale = lockStaleness(raw);
    if (stale === null) {
      unknownSince = unknownSince ?? Date.now();
      stale = Date.now() - unknownSince > 2000;
    } else unknownSince = null;
    if (stale) {
      try { if (readFileSync(LOG_LOCK, 'utf8') === raw) unlinkSync(LOG_LOCK); } catch { /* da bi nha/pha */ }
      continue;
    }
    sleepMs(5 + Math.floor(Math.random() * 15));
  }
}
function releaseLogLock(fd) {
  try { closeSync(fd); } catch { /* bo qua */ }
  try {
    const owner = JSON.parse(readFileSync(LOG_LOCK, 'utf8'));
    if (owner?.pid === process.pid) unlinkSync(LOG_LOCK);
  } catch { /* bo qua */ }
}
function withLogLock(fn) {
  const fd = acquireLogLock();
  try { return fn(); } finally { releaseLogLock(fd); }
}
function restoreState(snapshot) {
  try {
    if (snapshot === null) { if (existsSync(STATE)) unlinkSync(STATE); }
    else { const tmp = STATE + '.tmp'; writeFileSync(tmp, snapshot); renameSync(tmp, STATE); }
  } catch { /* best-effort */ }
}
function appendLogLine(line) {
  if (!existsSync(LOG)) writeFileSync(LOG, '# LOG\n');
  const fd = openSync(LOG, 'a');
  try { writeFileSync(fd, line); } finally { closeSync(fd); }
}

export function logEvent(entry) {
  return withLogLock(() => logEventLocked(entry));
}

// Critical section (giu .log.lock): dedupe -> validate -> budget -> state -> append LOG.
function logEventLocked(entry) {
  const relayParts = String(entry.relay ?? '').split('->');
  const inferredClaudeCalls = relayParts.reduce((n, part) => n + (/\bclaude\b/i.test(part) ? 1 : 0), 0);
  const declaredClaudeCalls = Math.max(0, Number(entry.claude_calls ?? 0) || 0);
  const normalizedClaudeCalls = Math.max(declaredClaudeCalls, inferredClaudeCalls);
  const idempotencyKey = sha256(JSON.stringify([
    entry.task ?? null,
    entry.seq ?? null,
    entry.hash ?? null,
    entry.relay ?? null,
  ]));
  const prev = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '# LOG\n';
  const duplicate = prev.split(/\r?\n/).some((line) => {
    const i = line.indexOf('|');
    if (i < 0) return false;
    try { return JSON.parse(line.slice(i + 1).trim()).idempotencyKey === idempotencyKey; } catch { return false; }
  });
  if (duplicate) return { logged: false, idempotencyKey };
  const request = entry.request ?? entry.input ?? '';
  const reply = entry.reply ?? entry.output ?? '';
  const transition = { ...(entry.stateTransition ?? {
    from: entry.stateFrom ?? null,
    to: entry.stateTo ?? entry.state ?? null,
  }) };
  const task = transition.to != null ? loadState().tasks?.[entry.task] : null;
  if (transition.to != null) {
    if (!task) throw new Error('TASK_NOT_FOUND');
    if (transition.from == null) transition.from = task.state;
  }
  if (transition.from != null && transition.to != null) {
    assertTransition(transition.from, transition.to);
  }
  const terminalStates = new Set(['DONE', 'FAILED', 'BLOCKED', 'DEAD_LETTER', 'HUMAN_REQUIRED']);
  const isTerminal = entry.terminal === true || terminalStates.has(transition.to);
  const finalHash = entry.finalHash ?? entry.replyHash ?? null;
  if (isTerminal && (!transition.from || !transition.to || !finalHash)) {
    throw new Error('TERMINAL_EVIDENCE_REQUIRED');
  }
  if (task && task.state !== transition.from) throw new Error('INVALID_STATE_TRANSITION');
  const today = new Date().toISOString().slice(0, 10);
  if (normalizedClaudeCalls > 0 && !checkEscalation(entry.task, today, normalizedClaudeCalls).ok) {
    throw new Error('HUMAN_REQUIRED');
  }
  const enriched = {
    task: entry.task ?? null,
    seq: entry.seq ?? null,
    hash: entry.hash ?? null,
    relay: entry.relay ?? null,
    verdict: entry.verdict ?? null,
    stateTransition: transition,
    terminal: isTerminal,
    finalHash,
    evidence: entry.evidence ?? null,
    claude_calls: normalizedClaudeCalls,
    requestChars: entry.requestChars ?? [...request].length,
    replyChars: entry.replyChars ?? [...reply].length,
    requestBytes: entry.requestBytes ?? Buffer.byteLength(request, 'utf8'),
    replyBytes: entry.replyBytes ?? Buffer.byteLength(reply, 'utf8'),
  };
  enriched.idempotencyKey = idempotencyKey;
  if (entry.type != null) enriched.type = entry.type;
  if (entry.legacyCount != null) enriched.legacyCount = entry.legacyCount;
  if (entry.legacyDigest != null) enriched.legacyDigest = entry.legacyDigest;
  const prevEventHash = lastEventHash();
  enriched.prevHash = prevEventHash ?? 'GENESIS';
  enriched.eventHash = computeEventHash(enriched.prevHash, enriched);
  const line = `- ${new Date().toISOString()} | ${JSON.stringify(enriched)}\n`;
  const snapshot = existsSync(STATE) ? readFileSync(STATE, 'utf8') : null;
  try {
    if (normalizedClaudeCalls > 0) consumeEscalation(entry.task, normalizedClaudeCalls, today);
    if (transition.to != null) {
      const st = loadState();
      const t = st.tasks[entry.task];
      t.state = transition.to;
      t.updatedAt = new Date().toISOString();
      if (transition.to === 'FAILED') {
        t.attempts = Number(t.attempts ?? 0) + 1;
        if (t.attempts >= MAX_ATTEMPTS) t.state = 'DEAD_LETTER';
      }
      saveState(st);
    }
    appendLogLine(line);
  } catch (err) {
    restoreState(snapshot);
    throw err;
  }
  return { logged: true, idempotencyKey };
}

function preregManifestPath() { return join(WF, 'prereg-manifest.json'); }
function fileSha256(path) { return sha256(readFileSync(join(ROOT, path))); }
export function preregCheck() {
  const manifestPath = preregManifestPath();
  if (!existsSync(manifestPath)) return { ok: true, skipped: true, failures: [] };
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const failures = [];
  for (const item of manifest.files ?? []) {
    try {
      const actual = fileSha256(item.path);
      if (actual !== item.sha256) failures.push({ path: item.path, reason: 'HASH_MISMATCH', expected: item.sha256, actual });
    } catch {
      failures.push({ path: item.path, reason: 'MISSING' });
    }
  }
  return { ok: failures.length === 0, skipped: false, failures };
}
function preregFreeze(paths) {
  const files = paths.map((path) => ({ path, sha256: fileSha256(path) }));
  const manifest = { frozenAt: new Date().toISOString(), files, note: 'Frozen by prereg freeze; changes require re-freeze.' };
  writeFileSync(preregManifestPath(), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
export function acceptanceGate(raw) {
  const clean = String(raw ?? '').replace(/^﻿/, '');
  const field = (name) => clean.match(new RegExp('(?:^|\\n)\\s*' + name + '\\s*:\\s*([^\\n]+)', 'i'))?.[1]?.trim() ?? null;
  const task = field('TASK');
  const hash = field('HASH');
  const ask = field('ASK');
  const command = field('COMMAND');
  const allowlist = field('ALLOWLIST');
  const redTest = field('RED_TEST');
  const specLock = Boolean(task && hash && ask);
  const commandOk = Boolean(command && command !== 'BLOCKED');
  const allowlistOk = Boolean(allowlist && allowlist !== 'BLOCKED');
  const redTestOk = Boolean(redTest && /^(RED|FAIL|NOT_PASS|UNPASS)/i.test(redTest));
  const checks = { command: commandOk, allowlist: allowlistOk, redTest: redTestOk, specLock };
  const prereg = preregCheck();
  if (!prereg.ok) return { ok: false, checks, reason: 'PREREG_MISMATCH', prereg };
  const vf = join(WF, 'verdict-' + (field('TASK') ?? 'UNKNOWN') + '.json');
  if (existsSync(vf)) {
    let v = null;
    try { v = JSON.parse(readFileSync(vf, 'utf8')); } catch { v = null; }
    if (!v || !v.task || !v.verdict || !v.reason) {
      return { ok: false, checks, reason: 'FAIL_CLOSED', prereg, verdictFile: vf };
    }
    return { ok: v.verdict === 'PASS', checks, reason: v.verdict === 'PASS' ? null : 'INDEPENDENT_FAIL', prereg, verdict: v };
  }
  return { ok: Object.values(checks).every(Boolean), checks, reason: Object.values(checks).every(Boolean) ? null : 'ACCEPTANCE_CONTRACT_BLOCKED', prereg };
}

export const STATES = ['CREATED', 'RUNNING', 'DONE', 'FAILED', 'DEAD_LETTER'];
export const MAX_ATTEMPTS = 3;
export const TRANSITIONS = {
  CREATED: ['RUNNING', 'DEAD_LETTER'],
  RUNNING: ['RUNNING', 'DONE', 'FAILED', 'DEAD_LETTER'],
  FAILED: ['RUNNING', 'DEAD_LETTER'],
  DONE: [],
  DEAD_LETTER: [],
};
export function assertTransition(from, to) {
  if (!STATES.includes(from) || !STATES.includes(to)) throw new Error('INVALID_STATE');
  if (!TRANSITIONS[from].includes(to)) throw new Error('INVALID_STATE_TRANSITION');
  return to;
}

export function transitionTask(task, action, now = new Date().toISOString()) {
  const st = loadState();
  const t = st.tasks?.[task];
  if (!t) throw new Error('TASK_NOT_FOUND');
  const targets = { start: 'RUNNING', done: 'DONE', fail: 'FAILED', dead: 'DEAD_LETTER' };
  const to = targets[action];
  if (!to) throw new Error('INVALID_ACTION');
  const from = t.state;
  let next = assertTransition(from, to);
  let attempts = Number(t.attempts ?? 0);
  if (action === 'fail') {
    attempts += 1;
    if (attempts >= MAX_ATTEMPTS) next = 'DEAD_LETTER';
  }
  if (next !== to) assertTransition(from, next);
  t.state = next;
  t.attempts = attempts;
  t.updatedAt = now;
  saveState(st);
  return { task, from, to: next, attempts, updatedAt: now };
}

export function reapStale(tasks, now = Date.now()) {
  const changed = {};
  for (const [k, t] of Object.entries(tasks)) {
    if (!['RUNNING', 'FAILED'].includes(t.state)) continue;
    const timeoutMs = t.timeoutMs ?? 8 * 3600000;
    if (now - (t.updatedAt ?? 0) <= timeoutMs) continue;
    const attempts = (t.attempts ?? 0) + 1;
    changed[k] = {
      ...t,
      state: attempts >= MAX_ATTEMPTS ? 'DEAD_LETTER' : 'FAILED',
      attempts,
      updatedAt: now,
    };
  }
  return changed;
}

export function validateEnvelope(raw, schema) {
  const clean = String(raw ?? '').replace(/^\uFEFF/, '');
  const field = (name) => clean.match(new RegExp('(?:^|\\r?\\n)\\s*' + name + '\\s*:\\s*([^\\r\\n]+)', 'i'))?.[1]?.trim() ?? null;
  const outputSection = clean.match(/OUTPUT:\r?\n([\s\S]*)$/)?.[1] ?? '';
  const outField = (name) => outputSection.match(new RegExp('(?:^|\\r?\\n)\\s*' + name + '\\s*:\\s*([^\\r\\n]+)', 'i'))?.[1]?.trim() ?? null;
  const obj = {
    TASK: field('TASK'),
    SEQ: field('SEQ') === null ? null : Number(field('SEQ')),
    ROLE: field('ROLE'),
    HASH: field('HASH'),
    OBJECTIVE: field('OBJECTIVE'),
    ASK: field('ASK'),
    OUTPUT: { VERDICT: outField('VERDICT'), DELTA: outField('DELTA'), ACTION: outField('ACTION'), EVIDENCE: outField('EVIDENCE') },
  };
  const ctx = field('CONTEXT_REF');
  if (ctx !== null) obj.CONTEXT_REF = ctx;
  const inp = field('INPUT');
  if (inp !== null) obj.INPUT = inp;
  const errs = [];
  const typeOf = (v) => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
  const check = (val, sch, path) => {
    if (sch.type && typeOf(val) !== sch.type) { errs.push(`${path}: expected ${sch.type}, got ${typeOf(val)}`); return; }
    if (sch.type === 'number' && !Number.isFinite(val)) { errs.push(`${path}: expected finite number`); return; }
    if (sch.type === 'object') {
      for (const k of sch.required ?? []) if (!(k in (val ?? {}))) errs.push(`${path}.${k}: required`);
      for (const [k, sub] of Object.entries(sch.properties ?? {})) if (k in (val ?? {})) check(val[k], sub, `${path}.${k}`);
    }
    if (sch.type === 'array') for (const item of val ?? []) check(item, sch.items ?? {}, `${path}[]`);
  };
  check(obj, schema, '$');
  return { ok: errs.length === 0, errors: errs, envelope: obj };
}

function dryRun() {
  const expectedHash = 'abc123';
  const expectedSeq = 7;
  const fixtures = [
    { name: 'clean', raw: `HASH: ${expectedHash}\nSEQ: ${expectedSeq}\nVERDICT: PASS\nDELTA: ok\nACTION: deploy\nEVIDENCE: test/ok`, ok: true },
    { name: 'noisy', raw: `## Reply\n**HASH:** ${expectedHash}\n- **SEQ:** ${expectedSeq}\n**VERDICT:** PASS`, ok: true },
    { name: 'wrong-hash', raw: `HASH: wrong\nSEQ: ${expectedSeq}\nVERDICT: PASS`, ok: false },
    { name: 'wrong-seq', raw: `HASH: ${expectedHash}\nSEQ: 8\nVERDICT: PASS`, ok: false },
    { name: 'missing', raw: 'VERDICT: PASS', ok: false },
  ];
  const baseResults = fixtures.map(f => ({ name: f.name, ok: verifyReply(f.raw, expectedHash, expectedSeq).ok === f.ok }));
  const baseDeterministic = JSON.stringify(baseResults) === JSON.stringify(fixtures.map(f => ({ name: f.name, ok: verifyReply(f.raw, expectedHash, expectedSeq).ok === f.ok })));

  const mismatch = decideVerdict({ verdict: 'FAIL' }, { pass: true });
  const retrySuccess = [`HASH: bad\nSEQ: ${expectedSeq}`, `HASH: ${expectedHash}\nSEQ: ${expectedSeq}`]
    .map(raw => verifyReply(raw, expectedHash, expectedSeq)).find(r => r.ok);
  const retryFail = [`HASH: bad\nSEQ: 99`, 'VERDICT: PASS']
    .map(raw => verifyReply(raw, expectedHash, expectedSeq)).every(r => !r.ok);
  const newFixtures = [
    { name: 'verdict-mismatch', ok: mismatch.verdict === 'PASS' && mismatch.mismatch && mismatch.modelRecommendation === 'FAIL' },
    { name: 'retry-success', ok: Boolean(retrySuccess) },
    { name: 'retry-fail', ok: retryFail },
    { name: 'utf8-bytes', ok: Buffer.byteLength('đạo', 'utf8') === Buffer.from('đạo', 'utf8').length && Buffer.byteLength('đạo', 'utf8') > [...'đạo'].length },
  ];
  const all = [...baseResults, ...newFixtures];
  const ok = baseResults.every(x => x.ok) && baseDeterministic && newFixtures.every(x => x.ok);
  console.log(JSON.stringify({
    dryrun: ok ? 'PASS' : 'FAIL',
    passed: `${all.filter(x => x.ok).length}/${all.length}`,
    deterministic: baseDeterministic,
    fixtures: all,
    retry: { success: Boolean(retrySuccess), fail: retryFail },
  }, null, 2));
  if (!ok) process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'make') {
  const o = {};
  for (const a of args) { const i = a.indexOf('='); o[a.slice(0, i)] = a.slice(i + 1); }
  let input = o.input || '';
  if (o.files) {
    const fileLines = [];
    for (const fp of o.files.split(',')) {
      const v = validateWorkspacePath(fp);
      if (!v.ok) exitWith(v.reason, { path: fp });
      if (!existsSync(v.abs)) exitWith('FILE_MISSING', { path: fp });
      fileLines.push(`FILE_SHA256: ${fp}=${sha256(readFileSync(v.abs))}`);
    }
    input = fileLines.join('\n') + '\n' + input;
  }
  const { envelope, hash, seq } = makeEnvelope({ task: o.task, role: o.role || 'CHATGPT', objective: o.objective, ask: o.ask, input, contextRef: o.contextRef || '', constraints: o.constraints ? o.constraints.split('|') : [] });
  console.log(envelope);
  console.error(`HASH=${hash} SEQ=${seq}`);
  successOutcome();
} else if (cmd === 'parse') {
  const file = args[0];
  const opts = {};
  for (const a of args.slice(1)) {
    const i = a.indexOf('=');
    if (i > 0) opts[a.slice(0, i)] = a.slice(i + 1);
  }
  const raw = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
  const p = parseResponse(raw);
  const hasHash = Object.prototype.hasOwnProperty.call(opts, 'hash');
  const hasSeq = Object.prototype.hasOwnProperty.call(opts, 'seq');
  if (hasHash || hasSeq) {
    if (!hasHash || !hasSeq) {
      console.log(JSON.stringify({ ...p, verify: { ok: false, reason: 'HASH_SEQ_MISMATCH', hash: null, seq: null } }, null, 2));
      process.exit(2);
    }
    const verify = verifyReply(raw, opts.hash, Number(opts.seq));
    console.log(JSON.stringify({ ...p, verify }, null, 2));
    if (!verify.ok) process.exit(2);
  }
  const hasPass = opts.pass === '1';
  const hasFail = opts.fail === '1';
  if (hasPass || hasFail) {
    const gateVerdict = decideVerdict(p, { pass: hasPass, fail: hasFail });
    console.log(JSON.stringify({ gateVerdict }, null, 2));
  }
} else if (cmd === 'gate') {
  const file = args[0];
  const raw = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
  const gate = acceptanceGate(raw);
  console.log(JSON.stringify(gate, null, 2));
  if (!gate.ok) process.exit(gate.reason === 'PREREG_MISMATCH' ? 5 : gate.reason === 'FAIL_CLOSED' ? 6 : gate.reason === 'INDEPENDENT_FAIL' ? 1 : 3);
} else if (cmd === 'bundle') {
  const task = args[0];
  const files = args.slice(1);
  if (!task || !files.length) { console.error('usage: bundle <task> <file...>'); process.exit(2); }
  // Validate task id format: T\\d+(-[A-Za-z0-9]+)* (prevent traversal)
  if (!/^T\d+(-[A-Za-z0-9]+)*$/.test(task)) { console.error('INVALID_TASK_ID'); process.exit(2); }
  console.log(JSON.stringify(bundleCreate(task, files), null, 2));
} else if (cmd === 'bundle-check') {
  const task = args[0] ?? '';
  if (!/^T\d+(-[A-Za-z0-9]+)*$/.test(task)) { console.error('INVALID_TASK_ID'); process.exit(2); }
  const r = bundleCheck(task);
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exit(7);
} else if (cmd === 'standalone') {
  const file = args[0];
  if (!file || !existsSync(file)) {
    console.log(JSON.stringify({ reason: 'FAIL_CLOSED', detail: 'envelope file missing' }, null, 2));
    process.exit(6);
  }
  const envText = readFileSync(file, 'utf8');
  const task = envText.match(/(?:^|\n)TASK: (\S+)/)?.[1] ?? 'UNKNOWN';
  const vf = join(WF, `verdict-${task}.json`);
  spawnSync(process.execPath, [join(WF, 'verify-standalone.mjs'), file], { encoding: 'utf8', timeout: 30000 });
  if (!existsSync(vf)) {
    console.log(JSON.stringify({ reason: 'FAIL_CLOSED', detail: 'verdict file missing' }, null, 2));
    process.exit(6);
  }
  let v = null;
  try { v = JSON.parse(readFileSync(vf, 'utf8')); } catch { v = null; }
  if (!v || !v.task || !v.verdict || !v.reason) {
    console.log(JSON.stringify({ reason: 'FAIL_CLOSED', detail: 'verdict malformed' }, null, 2));
    process.exit(6);
  }
  console.log(JSON.stringify(v, null, 2));
  if (v.verdict !== 'PASS') process.exit(1);
} else if (cmd === 'prereg') {
  const sub = args[0];
  if (sub === 'freeze') {
    const manifest = preregFreeze(args.slice(1));
    console.log(JSON.stringify(manifest, null, 2));
  } else if (sub === 'check') {
    const result = preregCheck();
    if (result.skipped) console.log(JSON.stringify({ ok: true, skipped: true }, null, 2));
    else if (result.ok) console.log(JSON.stringify({ ok: true, ...result }, null, 2));
    else console.log(JSON.stringify({ ok: false, reason: 'PREREG_MISMATCH', failures: result.failures }, null, 2));
  } else {
    console.error('usage: prereg freeze <file...> | prereg check');
    process.exit(2);
  }
} else if (cmd === 'apply') {
  const planPath = args[0];
  const bail = (reason, extra = {}, code = 2) => { exitWith(reason, extra, code); };
  if (!planPath) bail('NO_PLAN');
  let plan;
  try { plan = JSON.parse(readFileSync(planPath, 'utf8')); } catch { bail('PLAN_MALFORMED'); }
  const entries = Array.isArray(plan) ? plan : plan.files;
  if (!Array.isArray(entries) || entries.length === 0) bail('PLAN_EMPTY');
  const allowRel = (rel) => rel.split(sep).join('/').startsWith('wf/') || /^(CONTEXT|DECISIONS|LOG)\.md$/.test(rel) || /^\.git(ignore|attributes)$/.test(rel);
  const resolved = [];
  for (const e of entries) {
    if (!e || typeof e.path !== 'string' || e.path.length === 0) bail('ENTRY_INVALID', { entry: e });
    if (e.before_sha256 !== null && !(typeof e.before_sha256 === 'string' && /^[0-9a-f]{64}$/.test(e.before_sha256))) bail('ENTRY_INVALID', { entry: e });
    const v = validateWorkspacePath(e.path);
    if (!v.ok) bail(v.reason, { path: e.path });
    const { abs, rel } = v;
    if (!allowRel(rel)) bail('NOT_ALLOWED', { rel });
    let content = null;
    if (typeof e.content === 'string') content = e.content;
    else if (typeof e.contentPath === 'string') {
      try { content = readFileSync(resolve(ROOT, e.contentPath), 'utf8'); } catch { bail('CONTENT_UNREADABLE', { path: e.contentPath }); }
    } else bail('ENTRY_NO_CONTENT', { entry: e });
    resolved.push({ abs, rel, before: e.before_sha256, content });
  }
  const LOCK = join(WF, '.apply.lock');
  let fd = null;
  try { fd = openSync(LOCK, 'wx'); } catch { bail('LOCKED', { lock: LOCK }, 8); }
  const temps = [];
  let result, exitCode = 0;
  try {
    const stale = [];
    for (const e of resolved) {
      const cur = existsSync(e.abs) ? createHash('sha256').update(readFileSync(e.abs)).digest('hex') : null;
      if (cur !== e.before) stale.push({ path: e.rel, expected: e.before, actual: cur });
    }
    if (stale.length) { result = { ok: false, reason: 'STALE_REJECT', stale }; exitCode = 8; }
    else {
      const written = [];
      for (const e of resolved) {
        const tmp = e.abs + '.tmp-apply-' + process.pid;
        temps.push(tmp);
        writeFileSync(tmp, e.content, 'utf8');
        renameSync(tmp, e.abs);
        temps.splice(temps.indexOf(tmp), 1);
        written.push(e.rel);
      }
      result = { ok: true, written };
      try {
        const preview = resolved.map(e => `+++ b/${e.rel}\n${e.content.slice(0, 200)}`).join('\n---\n');
        logPayload('apply', 'ai-workflow', preview, { source: 'apply-cmd', files: written });
      } catch { /* payload log best-effort */ }
    }
  } catch (err) {
    result = { ok: false, reason: 'APPLY_ERROR', message: String(err && err.message || err) }; exitCode = 8;
  } finally {
    for (const t of temps) { try { if (existsSync(t)) unlinkSync(t); } catch { /* bỏ qua */ } }
    try { if (fd !== null) closeSync(fd); } catch { /* bỏ qua */ }
    try { if (existsSync(LOCK)) unlinkSync(LOCK); } catch { /* bỏ qua */ }
  }
  if (result.ok) { successOutcome(result.written); }
  else { exitWith(result.reason, result, exitCode); }
} else if (cmd === 'plan-extract') {
  const file = args[0];
  if (!file || !existsSync(file)) { console.log(JSON.stringify({ ok: false, reason: 'PLAN_NOT_FOUND' }, null, 2)); process.exit(2); }
  const raw = readFileSync(file, 'utf8');
  const blocks = [...raw.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  let plan = null;
  for (let i = blocks.length - 1; i >= 0; i--) {
    try { const p = JSON.parse(blocks[i][1]); if (p && Array.isArray(p.files)) { plan = p; break; } } catch { /* continue */ }
  }
  if (!plan) { console.log(JSON.stringify({ ok: false, reason: 'PLAN_NOT_FOUND' }, null, 2)); process.exit(2); }
  for (const f of plan.files) {
    if (!f || typeof f.path !== 'string' || f.path.length === 0 || typeof f.content !== 'string') {
      console.log(JSON.stringify({ ok: false, reason: 'PLAN_MALFORMED', entry: f }, null, 2));
      process.exit(2);
    }
  }
  plan.files = plan.files.map((f) => { const { before_sha256, ...rest } = f; return rest; });
  const extractPath = join(WF, 'plan.extracted.json');
  writeFileSync(extractPath, JSON.stringify(plan, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, files: plan.files.map((f) => f.path) }, null, 2));
} else if (cmd === 'plan-prepare') {
  const planPath = args[0];
  if (!planPath || !existsSync(planPath)) { console.log(JSON.stringify({ ok: false, reason: 'PLAN_NOT_FOUND' }, null, 2)); process.exit(2); }
  let envPath = null;
  for (let i = 1; i < args.length; i++) if (args[i] === '--envelope') envPath = args[i + 1];
  if (!envPath || !existsSync(envPath)) { console.log(JSON.stringify({ ok: false, reason: 'ENVELOPE_MISSING' }, null, 2)); process.exit(2); }
  let plan;
  try { plan = JSON.parse(readFileSync(planPath, 'utf8')); } catch { console.log(JSON.stringify({ ok: false, reason: 'PLAN_MALFORMED' }, null, 2)); process.exit(2); }
  if (!Array.isArray(plan.files)) { console.log(JSON.stringify({ ok: false, reason: 'PLAN_MALFORMED' }, null, 2)); process.exit(2); }
  const envText = readFileSync(envPath, 'utf8');
  const envHashes = new Map();
  for (const m of envText.matchAll(/FILE_SHA256:\s*(\S+?)=([0-9a-f]{64})/g)) envHashes.set(m[1], m[2]);
  const prepared = [];
  for (const f of plan.files) {
    if (!f || typeof f.path !== 'string' || f.path.length === 0 || typeof f.content !== 'string') {
      console.log(JSON.stringify({ ok: false, reason: 'PLAN_MALFORMED', entry: f }, null, 2));
      process.exit(2);
    }
    const abs = resolve(ROOT, f.path);
    if (!norm(abs).startsWith(norm(ROOT) + '/') || !safeContain(abs)) {
      console.log(JSON.stringify({ ok: false, reason: 'TRAVERSAL', path: f.path }, null, 2));
      process.exit(2);
    }
    const rel = relative(ROOT, abs);
    const envHash = envHashes.get(rel) ?? envHashes.get(f.path) ?? null;
    if (envHash) {
      prepared.push({ ...f, before_sha256: envHash });
    } else if (!existsSync(abs)) {
      prepared.push({ ...f, before_sha256: null });
    } else {
      console.log(JSON.stringify({ ok: false, reason: 'NOT_IN_ENVELOPE', path: f.path }, null, 2));
      process.exit(2);
    }
  }
  const outPath = join(WF, 'plan.prepared.json');
  writeFileSync(outPath, JSON.stringify({ files: prepared }, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, prepared: outPath, files: prepared.map((f) => ({ path: f.path, before: f.before_sha256 })) }, null, 2));
} else if (cmd === 'task') {
  const task = args[0];
  const action = args[1];
  if (!task || !action) { console.log(JSON.stringify({ ok: false, reason: 'USAGE' })); process.exit(2); }
  try {
    const result = transitionTask(task, action);
    console.log(JSON.stringify({ ok: true, ...result }, null, 2));
  } catch (err) {
    const reason = err?.message || 'INVALID_STATE_TRANSITION';
    console.log(JSON.stringify({ ok: false, reason }, null, 2));
    process.exit(2);
  }
} else if (cmd === 'status') {
  const st = loadState();
  const tasks = Object.entries(st.tasks ?? {}).sort((a, b) => String(b[1].updatedAt ?? '').localeCompare(String(a[1].updatedAt ?? '')));
  const now = Date.now();
  const age = (value) => {
    const parsed = Date.parse(value);
    const ms = Math.max(0, now - (Number.isFinite(parsed) ? parsed : Number(value) || now));
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return sec + 's';
    const min = Math.floor(sec / 60);
    if (min < 60) return min + 'm';
    const hour = Math.floor(min / 60);
    if (hour < 24) return hour + 'h';
    return Math.floor(hour / 24) + 'd';
  };
  console.log('| id | state | attempts | tuổi | seq | claudeCalls |');
  console.log('|---|---|---:|---:|---:|---:|');
  for (const [id, t] of tasks) {
    const calls = st.claudeCalls?.byTask?.[id] ?? 0;
    console.log('| ' + id + ' | ' + t.state + ' | ' + (t.attempts ?? 0) + ' | ' + age(t.updatedAt) + ' | ' + (st.seq?.[id] ?? 0) + ' | ' + calls + ' |');
  }
} else if (cmd === 'validate') {
  const file = args[0];
  const raw = file === '-' ? readFileSync(0, 'utf8') : readFileSync(file, 'utf8');
  const schema = JSON.parse(readFileSync(join(WF, 'wf-v1.schema.json'), 'utf8'));
  const r = validateEnvelope(raw, schema);
  console.log(JSON.stringify({ ok: r.ok, errors: r.errors }, null, 2));
  if (!r.ok) process.exit(2);
} else if (cmd === 'escalation') {
  const task = args[0];
  const today = new Date().toISOString().slice(0, 10);
  const budget = checkEscalation(task, today);
  console.log(JSON.stringify(budget, null, 2));
  if (!budget.ok) process.exit(3);
} else if (cmd === 'verifychain') {
  const r = verifyChain(existsSync(LOG) ? readFileSync(LOG, 'utf8') : '');
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exit(4);
} else if (cmd === 'seal') {
  const logText = existsSync(LOG) ? readFileSync(LOG, 'utf8') : '';
  const sealInfo = collectSealInfo(logText);
  if (sealInfo.malformedSeals.length > 0) {
    console.log(JSON.stringify({ ok: false, reason: 'SEAL_MALFORMED', malformedFound: sealInfo.malformedSeals.length }, null, 2));
    process.exit(4);
  }
  if (sealInfo.seals.length > 1) {
    console.log(JSON.stringify({ ok: false, reason: 'MULTIPLE_SEALS', sealsFound: sealInfo.seals.length }, null, 2));
    process.exit(4);
  }
  if (sealInfo.seals.length === 1) {
    const seal = sealInfo.seals[0];
    const sealHashOk = seal.eventHash === computeEventHash(seal.prevHash, seal);
    if (!sealHashOk) {
      console.log(JSON.stringify({ ok: false, reason: 'SEAL_INVALID', detail: 'SEAL eventHash mismatch' }, null, 2));
      process.exit(4);
    }
    if (seal.legacyDigest === sealInfo.legacyDigest && seal.legacyCount === sealInfo.legacyCount) {
      console.log(JSON.stringify({ ok: true, status: 'SEAL_EXISTS', legacyCount: sealInfo.legacyCount, legacyDigest: sealInfo.legacyDigest }, null, 2));
      process.exit(0);
    }
    console.log(JSON.stringify({ ok: false, reason: 'LEGACY_TAMPER', expected: seal.legacyDigest, actual: sealInfo.legacyDigest }, null, 2));
    process.exit(4);
  }
  try {
    const res = logEvent({
      task: 'T145',
      hash: null,
      relay: null,
      verdict: 'PASS',
      type: 'SEAL',
      legacyCount: sealInfo.legacyCount,
      legacyDigest: sealInfo.legacyDigest,
      claude_calls: 0,
    });
    if (!res.logged) {
      console.log(JSON.stringify({ ok: true, status: 'SEAL_EXISTS', legacyCount: sealInfo.legacyCount, legacyDigest: sealInfo.legacyDigest }, null, 2));
      process.exit(0);
    }
    console.log(JSON.stringify({ ok: true, status: 'SEALED', legacyCount: sealInfo.legacyCount, legacyDigest: sealInfo.legacyDigest }, null, 2));
    process.exit(0);
  } catch (err) {
    if (err?.message === 'HUMAN_REQUIRED') {
      console.log(JSON.stringify({ ok: false, reason: 'HUMAN_REQUIRED' }, null, 2));
      process.exit(3);
    }
    throw err;
  }
} else if (cmd === 'reap') {
  const st = loadState();
  st.tasks = st.tasks ?? {};
  const changed = reapStale(st.tasks);
  saveState(st);
  console.log(JSON.stringify({ changed, tasks: st.tasks }, null, 2));
} else if (cmd === 'state-validate') {
  const st = loadState();
  const errors = [];
  // S01: schema valid
  if (!st.seq || typeof st.seq !== 'object') errors.push({ field: 'seq', reason: 'MISSING_OR_INVALID' });
  if (!st.tasks || typeof st.tasks !== 'object') errors.push({ field: 'tasks', reason: 'MISSING_OR_INVALID' });
  if (!st.claudeCalls || typeof st.claudeCalls !== 'object') errors.push({ field: 'claudeCalls', reason: 'MISSING_OR_INVALID' });
  if (!st.claudeCalls?.byDate || typeof st.claudeCalls.byDate !== 'object') errors.push({ field: 'claudeCalls.byDate', reason: 'MISSING_OR_INVALID' });
  if (!st.claudeCalls?.byTask || typeof st.claudeCalls.byTask !== 'object') errors.push({ field: 'claudeCalls.byTask', reason: 'MISSING_OR_INVALID' });
  // S02/S05: seq monotonic per task
  for (const [task, seq] of Object.entries(st.seq ?? {})) {
    if (!Number.isInteger(seq) || seq < 0) errors.push({ task, field: 'seq', reason: 'SEQ_INVALID', value: seq });
  }
  // S03/S08: valid state transitions (only obvious invalid states, not history inference)
  for (const [task, t] of Object.entries(st.tasks ?? {})) {
    if (!t.state || !['CREATED', 'RUNNING', 'DONE', 'FAILED', 'DEAD_LETTER'].includes(t.state)) {
      errors.push({ task, field: 'state', reason: 'INVALID_STATE', value: t.state });
    }
    if (!t.createdAt || !t.updatedAt) errors.push({ task, field: 'timestamps', reason: 'MISSING' });
    // S04: attempts must be non-negative integer
    if (typeof t.attempts !== 'number' || t.attempts < 0 || !Number.isInteger(t.attempts)) {
      errors.push({ task, field: 'attempts', reason: 'ATTEMPTS_INVALID', value: t.attempts });
    }
    // S10: attempts >= MAX_ATTEMPTS -> DEAD_LETTER
    if ((t.attempts ?? 0) >= 3 && t.state !== 'DEAD_LETTER') {
      errors.push({ task, field: 'state', reason: 'ATTEMPTS_EXCEEDED', detail: 'attempts >= 3 but state not DEAD_LETTER' });
    }
  }
  // S13: idempotency key uniqueness is enforced in logEvent, not here
  // S14: hash-chain integrity - verifychain handles this
  if (errors.length > 0) {
    console.log(JSON.stringify({ ok: false, reason: 'SCHEMA_INVALID', errors }, null, 2));
    process.exit(2);
  }
  console.log(JSON.stringify({ ok: true }, null, 2));
} else if (cmd === 'dispute') {
  const task = args[0];
  const action = args[1];
  const usage = () => { console.error('usage: dispute <task> <create|round|status>'); process.exit(2); };
  if (!task || !action) usage();
  const st = loadState();
  st.disputes = st.disputes ?? {};
  const classes = ['factual', 'spec', 'interpretation', 'preference'];
  if (action === 'create') {
    st.disputes[task] = { round: 0, classes: [], status: 'OPEN' };
    saveState(st);
    console.log(JSON.stringify({ task, dispute: st.disputes[task] }, null, 2));
  } else if (action === 'status') {
    const d = st.disputes[task];
    if (!d) { console.error('dispute chưa tồn tại: ' + task); process.exit(2); }
    console.log(JSON.stringify({ task, dispute: d }, null, 2));
  } else if (action === 'round') {
    const d = st.disputes[task];
    if (!d) { console.error('dispute chưa tạo: ' + task); process.exit(2); }
    if (d.status === 'BLOCKED') { console.error('dispute đã BLOCKED — không nhận vòng mới'); process.exit(2); }
    const ci = args.indexOf('--class');
    const cls = ci >= 0 ? args[ci + 1] : null;
    if (!classes.includes(cls)) { console.error('class phải thuộc: ' + classes.join('|')); process.exit(2); }
    d.round += 1;
    d.classes.push(cls);
    let taskState = st.tasks?.[task]?.state ?? null;
    if (d.round > 2) {
      d.status = 'BLOCKED';
      const t = st.tasks?.[task];
      if (t) {
        try { t.state = assertTransition(t.state, 'DEAD_LETTER'); t.updatedAt = Date.now(); }
        catch { /* DONE/không cho phép → chỉ BLOCK dispute */ }
        taskState = t.state;
      }
    }
    saveState(st);
    console.log(JSON.stringify({ task, dispute: d, taskState }, null, 2));
  } else usage();
} else if (cmd === 'log') {
  const payload = (args[0].startsWith('@') ? readFileSync(args[0].slice(1), 'utf8') : args[0]).replace(/^﻿/, '');
  try {
    logEvent(JSON.parse(payload));
  } catch (err) {
    if (err?.message === 'HUMAN_REQUIRED') {
      console.log(JSON.stringify({ ok: false, reason: 'HUMAN_REQUIRED' }, null, 2));
      process.exit(3);
    }
    throw err;
  }
  console.log('logged');
} else if (cmd === 'log-event') {
  const opts = {};
  for (const a of args) {
    const eq = a.indexOf('=');
    if (eq > 0) opts[a.slice(2, eq)] = a.slice(eq + 1);
  }
  const entry = {
    task: opts.task,
    seq: opts.seq ? Number(opts.seq) : null,
    hash: opts.hash,
    relay: opts.relay,
    verdict: opts.verdict,
    stateFrom: opts['state-from'],
    stateTo: opts['state-to'],
    claude_calls: opts['claude-calls'] ? Number(opts['claude-calls']) : 0,
  };
  try {
    const res = logEvent(entry);
    console.log(JSON.stringify({ ok: true, ...res }, null, 2));
  } catch (err) {
    if (err?.message === 'HUMAN_REQUIRED') {
      console.log(JSON.stringify({ ok: false, reason: 'HUMAN_REQUIRED' }, null, 2));
      process.exit(0);
    }
    throw err;
  }
} else {
  dryRun();
}
