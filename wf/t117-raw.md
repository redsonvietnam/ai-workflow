VERDICT: UNCERTAIN (executor - terminal bi CodeLocal block)
DELTA: C3 idempotency key + LOG dedupe da code.
ACTION: opencode chay node wf\pipeline.mjs + replay test.
EVIDENCE: wf/pipeline.mjs SHA256 f95fb51c...ff8f6b.

## Independent verify (opencode)
- dryrun 6/6 khong hong: PASS
- idempotencyKey = sha256([task,seq,hash,relay]), duplicate check tren LOG truoc khi append: PASS
- replay test: log cung entry 2 lan -> LOG chi co 1 dong TIDEMPT: PASS
- backward-compatible (line cu khong co key van doc duoc): PASS
=> KET LUAN T117: PASS
