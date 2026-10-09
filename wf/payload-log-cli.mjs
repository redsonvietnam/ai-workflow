#!/usr/bin/env node
// CLI mode: node wf/payload-log-cli.mjs <taskId> <workspaceId> <patchFile>
import { readFileSync } from 'node:fs';
import { logPayload } from './payload-log.mjs';

const [taskId, workspaceId, patchFile] = process.argv.slice(2);
if (!taskId || !workspaceId) {
  console.error('Usage: node wf/payload-log-cli.mjs <taskId> <workspaceId> [patchFile]');
  process.exit(1);
}

let patch = null;
if (patchFile) {
  try {
    patch = readFileSync(patchFile, 'utf8');
  } catch (e) {
    console.error('Cannot read patch file:', e.message);
  }
}

const success = logPayload(taskId, workspaceId, patch, {
  source: 'cli',
  patchFile: patchFile || null
});

if (success) {
  console.log('PAYLOAD_LOGGED:', taskId);
  process.exit(0);
} else {
  console.error('PAYLOAD_LOG_FAILED');
  process.exit(1);
}
