#!/usr/bin/env node
// T151-B: Payload logging cho CodeLocal apply_patch
// Ghi nguyên văn patch/envelope gửi vào CodeLocal cho mọi lần gọi
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = join(SCRIPT_ROOT, 'wf', 'logs');
const PAYLOAD_LOG = join(LOG_DIR, 'code-local-payloads.jsonl');

// Đảm bảo log dir tồn tại
try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

const SECRET_PATTERNS = [
  /\bsk-[a-zA-Z0-9_-]{8,}\b/g,
  /\bsk-ant-[a-zA-Z0-9_-]{8,}\b/g,
  /\bAIza[a-zA-Z0-9_-]{10,}\b/g,
  /\bghp_[a-zA-Z0-9]{20,}\b/g,
  /\bgho_[a-zA-Z0-9]{20,}\b/g,
  /\bghs_[a-zA-Z0-9]{20,}\b/g,
  /\bgithub_pat_[a-zA-Z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[a-zA-Z0-9_-]{10,}\b/g,
  /-----BEGIN (RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----[\s\S]*?-----END (RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----/gs,
  /\bpostgres(?:ql)?:\/\/[^\s]{10,}\b/gi,
  /\bxox[pbas]-[a-zA-Z0-9-]{10,}\b/g,
  /\bBearer\s+[a-zA-Z0-9._-]{20,}\b/g,
  /\b(password|passwd|secret|token|api[_-]?key)\s*[=:]\s*['"]?[^\s'"]{8,}['"]?/gi,
];

export function redact(text) {
  if (!text) return text;
  let out = String(text);
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

export function logPayload(taskId, workspaceId, patch, metadata = {}) {
  const redactedPatch = patch ? redact(patch) : patch;
  const entry = {
    ts: new Date().toISOString(),
    taskId,
    workspaceId,
    patchBytes: patch ? Buffer.byteLength(patch, 'utf8') : 0,
    patchPreview: redactedPatch ? redactedPatch.slice(0, 500) : null,
    patchHeaders: extractPatchHeaders(redactedPatch),
    metadata,
  };
  
  try {
    appendFileSync(PAYLOAD_LOG, JSON.stringify(entry) + '\n');
    return true;
  } catch (e) {
    console.error('PAYLOAD_LOG_FAILED:', e.message);
    return false;
  }
}

function extractPatchHeaders(patch) {
  if (!patch) return null;
  const lines = patch.split('\n');
  const headers = [];
  for (const line of lines) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff --git')) {
      headers.push(line);
    }
    if (headers.length >= 10) break; // Limit
  }
  return headers;
}

// Export default để import từ nơi khác
export default { logPayload, redact };
