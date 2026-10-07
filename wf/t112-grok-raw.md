## Grok round 1 (thread aea5bb31-8412-437c-ae94-2d6f6e6c4fcc, user Son Red)
- 1) Schema gate: DONG Y - validate truoc, bat loi som
- 2) Lease/state machine: DONG Y - chan task bi quen (thuc te voi free-tier timeout/adapter chet)
- 3) Acceptance-contract gate: DONG Y - spec co acceptance ro truoc khi code
- 4) Hash-chain: DONG Y (nhe) - overhead cao neu moi evidence; nen batch/critical path, phase 2
- 5) Enrollment/escalation policy: DONG Y - trigger + ngan sach bat buoc free-tier
- 6) Idempotent replay: DONG Y - nen tang on dinh khi adapter chet
- BO SUNG: (a) timeout + auto-requeue gan voi lease; (b) minimal observability hook (log state transition + hash cuoi vao CONTEXT/LOG)
- TOP 3 UU TIEN CAO: Lease/state machine > Acceptance-contract gate > Idempotent replay (schema + enrollment ke sau; hash-chain phase 2)
