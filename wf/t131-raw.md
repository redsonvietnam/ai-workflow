# T131 — Architect (tab0) spec SEQ 1

VERDICT: PASS

DELTA: T131 SPEC: (1) node wf/pipeline.mjs apply <plan.json>; mỗi entry {path,before_sha256|null,content|contentPath}, path chỉ trong allowlist wf/*/được gate cho phép; canonicalize path, từ chối traversal. (2) wx lock wf/.apply.lock; lock lỗi hoặc tồn tại ⇒ exit 8, không ghi. Khi giữ lock: tính lại SHA-256 toàn bộ before_sha256; lệch ⇒ STALE_REJECT exit 8, không file nào được thay đổi; không auto-rebase. Ghi từng file qua temp cùng thư mục rồi rename atomic; cleanup temp/lock trong mọi nhánh. (3) git-gate.ps1: capture HEAD + staged-path/blob snapshot đầu gate; ngay trước commit revalidate HEAD và staged blob, lệch ⇒ gate fail, không commit. (4) test-apply.mjs: valid apply; stale race ⇒ exit 8/no overwrite; held-lock ⇒ exit 8/no write; atomic ⇒ không quan sát được file nửa vời. Test phải tự tạo/dọn fixture và chạy lặp được. (5) Exit 8 chỉ dành cho STALE/LOCK; không thay đổi mã 0–7.

ACTION: Opencode ghi nguyên spec này vào wf/t131-spec.md, freeze SHA-256, sau đó CodeLocal triển khai + chạy 4 fixture và git-gate regression; không mở scope ngoài T131.

EVIDENCE: wf/t130-consensus.md mục T131; ai-coding-core/orchestrator-adapter-contract v1.1; yêu cầu acceptance T131 trong task.
