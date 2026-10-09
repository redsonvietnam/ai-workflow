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

export function logPayload(taskId, workspaceId, patch, metadata = {}) {
  const entry = {
    ts: new Date().toISOString(),
    taskId,
    workspaceId,
    patchBytes: patch ? Buffer.byteLength(patch, 'utf8') : 0,
    patchPreview: patch ? patch.slice(0, 500) : null,
    patchHeaders: extractPatchHeaders(patch),
    metadata,
    // Lưu ý: KHÔNG log secrets. Chỉ log path và headers.
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
export default { logPayload };
