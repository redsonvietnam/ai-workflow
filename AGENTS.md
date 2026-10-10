Vai trò: bạn là EXECUTOR; opencode là control plane và là người duy nhất commit.
Chỉ sửa file trong danh sách FILES của prompt. TUYỆT ĐỐI không sửa file nằm trong wf/bundles/*/SHA256SUMS hoặc wf/prereg-manifest.json.
Không git commit/push. Không tự tính hay khẳng định SHA256; hash do script tính.
Terminal chỉ dùng: `node wf/<tên>.mjs`, `node wf/pipeline.mjs <lệnh>`, `git status`, `git diff`. Cần sửa file thì dùng tool edit (đọc trước, sửa chính xác), không dùng redirect shell.
Nếu một tool bị chặn/lease fail/policy-block: DỪNG sau 1 lần, không thử lặp. Trả về nội dung cuối của từng file trong khối ``` riêng, ghi rõ path, để opencode áp dụng.
Báo cáo cuối đúng 4 dòng: VERDICT: PASS|FAIL|UNCERTAIN / DELTA / ACTION / EVIDENCE (dán 10 dòng cuối output của lệnh ACCEPT).
Giữ nguyên LF, không đổi BOM của file có sẵn.

## Gates bắt buộc
- **Trước khi sửa LOG.md:** chạy `node wf/pipeline.mjs verifychain` — exit 0 mới được tiếp tục.
- **Sau khi sửa LOG.md:** chạy lại `verifychain` — exit 0, không broken.
- **Trước khi gọi Claude:** chạy `node wf/pipeline.mjs escalation <task>` — exit 3 (HUMAN_REQUIRED) thì DỪNG, không gửi.
- **Schema:** envelope phải đúng format `[WF:v1]` với đủ TASK/SEQ/ROLE/HASH/OBJECTIVE/INPUT/ASK/OUTPUT — sai → exit 2 khi parse.
- **Secret gate:** chạy `node wf/pipeline.mjs gate <file>` — exit 0 mới pass.
- **ACCEPT:** `node wf/pipeline.mjs` (dry-run) exit 0; `node wf/pipeline.mjs verifychain` exit 0; `git status` chỉ có AGENTS.md mới.

## Bundle Task Validation (F1b)
- `bundle` và `bundle-check` MUST validate task IDs against `T\d+(-[A-Za-z0-9]+)*` before filesystem mutation or bundle access.
- Resolve and validate the canonical bundle directory using `realpathResolved` walk-up; reject traversal and symlink/junction escapes outside `WF/bundles` using component check (`escapesRoot`).
- Invalid task IDs and bundle integrity failures MUST return documented non-zero exit codes: validation=2, integrity=7.
- Add dedicated positive, negative, traversal, filesystem-link and integrity tests. Record skipped tests as SKIPPED, never PASS.
- Keep F1b RED test-only and GREEN implementation commits separate; do not amend either commit. OpenCode alone performs Git commits/pushes when explicitly authorized.
- Do not modify protected bundle seals (`wf/bundles/*/SHA256SUMS`), `wf/prereg-manifest.json`, or `LOG.md` outside the task's approved scope.