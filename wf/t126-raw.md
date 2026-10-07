VERDICT: UNCERTAIN x2 (CodeLocal halt: write content, patch context) -> FALLBACK LOCAL
DELTA: verify-standalone.mjs (process doc lap, khong import pipeline) + CLI standalone + gate doc verdict file.
ACTION: Proceed T127.
EVIDENCE: wf/verify-standalone.mjs; exit codes 0/1/6.

## Independent verify (opencode)
- fixture dung (envelope do node sinh, unicode) -> verdict PASS exit 0: PASS
- fixture co tinh sai hash -> verdict FAIL HASH_MISMATCH exit 1: PASS
- file thieu -> FAIL_CLOSED exit 6: PASS
- gate + verdict PASS -> ok exit 0 (khong tu cham): PASS
- gate + verdict FAIL -> INDEPENDENT_FAIL exit 1: PASS
- gate + verdict malformed -> FAIL_CLOSED exit 6: PASS
- backward-compat (khong verdict file = logic cu), dryrun 6/6: PASS
- bug fix trong test: BOM/CRf strip, exit mapping 5/6/1
- ghi chu: file evidence qua Out-File PS5.1 bi sai encoding voi unicode -> tu nay ghi envelope qua node
=> KET LUAN T126: PASS
