VERDICT: UNCERTAIN x2 (lan 1 doc file truoc khi tao; lan 2 CodeLocal chan edit stale-hash) -> FALLBACK: opencode code local
DELTA: Schema gate da them: wf/wf-v1.schema.json + lenh validate (exit 0/2), validateEnvelope zero-dep.
ACTION: opencode verify.
EVIDENCE: wf/wf-v1.schema.json + wf/pipeline.mjs (opencode edit).

## Independent verify (opencode)
- (a) envelope hop le t121-envelope.txt -> ok exit 0: PASS
- (b) SEQ "khong-phai-so" -> "expected finite number", exit 2: PASS
- (c) thieu ASK + OUTPUT thieu DELTA/ACTION/EVIDENCE -> exit 2: PASS
- (d) envelope make moi nhat -> exit 0: PASS
- dryrun 6/6 khong hong: PASS
- fix 2 bug trong test: regex chiu CRLF, NaN khong qua type number
=> KET LUAN T121: PASS (fallback 2 lan fail CodeLocal per D8)
