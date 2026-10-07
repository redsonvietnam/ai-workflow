# T104 — Architect spec (raw, tab1 thread)

TASK T104 SEQ1 HASH=7468353aaa1f3fb7

VERDICT: PASS
DELTA: pipeline.mjs hien co makeEnvelope, parseResponse, logEvent, dryRun; parseResponse chua verify reply-side HASH/SEQ va verdict gate con tin model.
ACTION: Executor trien khai 4 buoc:

1. wf/pipeline.mjs — parseResponse + verifier
Them verifyReply(raw, expectedHash, expectedSeq).
Parse HASH, SEQ; yeu cau khop envelope/script.
Sai/missing -> ok=false, reason=HASH_SEQ_MISMATCH, cho phep retry 1 lan.
HASH/SEQ deu do script tinh, khong tin model.

2. wf/pipeline.mjs — verdict gate
Them decideVerdict(parsed, conditions).
Script quyet PASS|FAIL|UNCERTAIN tu parse + dieu kien.
VERDICT model chi la recommendation; mismatch phai ghi ro.

3. logEvent — accounting
Moi relay log toi thieu: relay, requestChars, replyChars, requestBytes, replyBytes.
Dung Buffer.byteLength(..., 'utf8'); khong can API-token estimate.
Backward-compatible voi log cu.

4. Tests/fallback
Fixture inbox/outbox: clean PASS, noisy, HASH sai, SEQ sai, missing HASH/SEQ, verdict mismatch, retry success/fail.
Dry-run toan bo, khong sleep/8h.
Assert retry toi da 1 lan + accounting deterministic.

EVIDENCE: wf/pipeline.mjs hash 2643f8dd...; current dry-run fixtures 3x2.
