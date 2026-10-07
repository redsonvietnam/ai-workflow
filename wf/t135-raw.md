# T135 — Architect (tab0, Think ON) spec SEQ 1

VERDICT: PASS

DELTA: 1) Audit clean: kiểm tra git status, git ls-files, git log --all --oneline; tìm junk/noise và secret pattern trong toàn history; history giữ nguyên nếu không có secret, không squash/rewrite. Output: danh sách file lạ + kết luận lịch sử. 2) .gitignore: thêm rule cho .playwright-mcp/, temp/scratch opencode, *.log, cache/runtime artifacts; chỉ commit nếu rule phù hợp repo. Output: nội dung .gitignore + commit đề xuất. 3) GitHub: đề xuất redsonvietnam/ai-workflow, private; tên khớp đúng vai trò workflow/control-plane. Output: tên + visibility + lý do. 4) Push sequence: xác định gh repo create ... --private hoặc tạo repo rồi git remote add origin ...; kiểm tra remote/branch; git push -u origin main; tuyệt đối không force. Output: chuỗi PowerShell 5.1 copy-paste. 5) Clone/continuity: state.json, wf/ tracked nên tiếp tục được; không commit secrets/log/temp/profile artifacts; máy mới chạy git-gate trên wf/* rồi ff-merge main; working tree chưa commit phải inspect/diff trước, không tự xoá/clean. Output: quy trình clone→branch→gate→merge. 6) Rollback/risk: human gate trước push; nếu lỗi sau push thì sửa bằng commit mới; không force-push. Acceptance: đủ 6 mục + pre-push dry-run; không push; ghi wf/t135-push-plan.md.

ACTION: Executor qua CodeLocal tạo đúng wf/t135-push-plan.md, self-check toàn bộ acceptance; CodeLocal fail 2 lần thì fallback local. Sau đó freeze hash rồi mới cho human gate quyết định push.

EVIDENCE: wf/t130-consensus.md + DECISIONS.md D13 + facts kiểm tra bởi opencode; acceptance T135 trong prompt.

---
Ghi chú (control plane): architect viết "Sau đó freeze hash" — thứ tự được hiệu chỉnh theo consensus T125: freeze SPEC trước khi executor chạy (spec = wf/t135-spec.md trích từ DELTA phía trên). Envelope wf/t135-envelope.txt (HASH 80e8c18880a5b65d, SEQ 1); readback khớp 2794/2794.
