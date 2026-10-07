VERDICT: PASS
DELTA: T121 - Typed schema gate: CODE wf/pipeline.mjs + wf/wf-v1.schema.json. Validate truoc khi xu ly; invalid -> BLOCKED exit 2. Acceptance: malformed/wrong type bi chan truoc side effect.
T122 - Escalation policy: claude_calls <= 1/task, <= 2/ngay; vuot -> HUMAN_REQUIRED/BLOCKED exit 3, 0 goi Claude them. Acceptance: escalation thu 2 bi chan, counter deterministic.
T123 - Evidence hash-chain: prevHash + hash tren canonical metadata (khong payload); verify mismatch -> exit 4. Acceptance: sua 1 event cu -> phat hien chain break.
ACTION: Thuc thi T121 -> T122 -> T123; moi task co 1 dry-run/fixture acceptance truoc khi live. Khong mo pham vi moi.
EVIDENCE: DECISIONS.md D11 + wf/t112-consensus.md.
