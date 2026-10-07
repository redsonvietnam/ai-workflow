# T112 CONSENSUS DRAFT - 4 muc cai thien workflow (2026-10-07)
# Shuttle: ChatGPT-architect (Think) x Grok, 2 vong; CA HAI CHOT = PASS/PASS
# Phase 2 (chua thuc thi): schema gate, enrollment/escalation budget, evidence hash-chain

## C1. Lease + state machine + timeout/requeue  [nguon: ca hai]
- Spec: moi TASK trong state.json co lease + state transition hop le; lease het han thi auto-requeue an toan (khong mutate sau expiry).
- Acceptance: stale worker khong duoc mutate sau lease expiry; task khong bi "quen" giua chung.

## C2. Acceptance-contract gate truoc CodeLocal  [nguon: ca hai]
- Spec: moi execution phai co SPEC + acceptance criteria truoc khi executor code.
- Acceptance: thieu contract = BLOCKED, khong code.

## C3. Idempotent replay  [nguon: ca hai]
- Spec: inbox/outbox/proposal co idempotency key; replay cung input khong tao side effect lap.
- Acceptance: replay cung input -> cung terminal result/effect.

## C4. Minimal observability hook  [nguon: Grok bo sung, ChatGPT chap nhan]
- Spec: ghi state transition + hash cuoi vao CONTEXT/LOG de audit nhanh.
- Acceptance: moi terminal transition co evidence toi thieu, truy vet duoc.
