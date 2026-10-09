#!/usr/bin/env node
// T151-B: Test payload logging
import { logPayload } from './payload-log.mjs';

// Test 1: Log payload mẫu
const testPatch = `--- /dev/null
+++ b/wf/test-payload.md
@@ -0,0 +1 @@
+Test payload
`;

const success = logPayload(
  'T151-B-TEST',
  'ai-workflow-ac2fe45f3e',
  testPatch,
  { test: true, source: 'payload-log-test' }
);

if (success) {
  console.log('PAYLOAD_LOG_TEST: PASS');
  console.log('Log file: wf/logs/code-local-payloads.jsonl');
  process.exit(0);
} else {
  console.error('PAYLOAD_LOG_TEST: FAIL');
  process.exit(1);
}
