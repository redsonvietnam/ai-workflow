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