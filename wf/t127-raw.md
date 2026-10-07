VERDICT: UNCERTAIN x2 (routable path, stale-hash) -> FALLBACK LOCAL
DELTA: bundle/bundle-check CLI - SHA256SUMS + provenance (anchor, gitCommit, task_id/attempt_id), exit 7.
ACTION: T125-T127 xong - dung nhu consensus, chay task that tiep theo.
EVIDENCE: bundleCreate/bundleCheck trong pipeline.mjs; 5/5 acceptance local.

## Independent verify (opencode)
- bundle 3 file -> exit 0: PASS
- check chua sua -> ok exit 0: PASS
- sua 1 byte -> HASH_MISMATCH exit 7: PASS
- sua anchor provenance -> ANCHOR_MISMATCH exit 7: PASS
- thieu bundle -> BUNDLE_MISSING exit 7: PASS
- dryrun 6/6: PASS
- ghi chu: t127-envelope.txt (lan 1 qua pipe PS) bi mojibake -> tao lai qua node script, standalone PASS truoc khi gui
=> KET LUAN T127: PASS
