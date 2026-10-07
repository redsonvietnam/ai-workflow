# T134 — Architect (tab0) spec SEQ 1

VERDICT: PASS

DELTA: 1) Nguồn neo: chỉ dùng commit ee20500ab4b4334b45e4c3fbbe6a38a75fb35597; ghi docs/PCM.md, docs/PWF.md, docs/CONFORMANCE.md và skill SKILL.md cùng SHA-256 tính lại; tuyệt đối không dùng main. 2) Format: ID | source_file | pinned_commit/path | sha256 | excerpt(≤3 dòng) | mapping_T131 | mapping_T133; mỗi constraint có ID ổn định, chỉ giữ ràng buộc thật sự cần: canonical-state/stale-assumption, provenance/evidence, gate/no-self-approve, lifecycle/stop. 3) Test: wf/test-t134.mjs lấy đúng nguồn pinned, recompute mọi SHA-256 trong doc ⇒ PASS; sửa 1 byte bất kỳ ⇒ FAIL; không sửa pipeline, không đổi exit 0–8. 4) Không audit 42 test PCM.

ACTION: Opencode viết wf/t134-pcm-constraints.md theo format trên, tính hash thực tế cho từng nguồn + trích dẫn ≤3 dòng; sau đó chạy node wf/test-t134.mjs và giữ cả PASS/tamper-FAIL làm evidence.

EVIDENCE: skill SKILL.md SHA-256 ff086e0c39ae26645e875b1460f626503e39b78ccb4bc4f97b7cf0679a1aa442; PCM commit ee20500ab4b4334b45e4c3fbbe6a38a75fb35597; nguồn docs/PCM.md, docs/PWF.md, docs/CONFORMANCE.md.
