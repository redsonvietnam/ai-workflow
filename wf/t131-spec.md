# T131 SPEC — Stale-check nguyên tử trước APPLY (frozen)

Nguồn: architect SEQ1 (`wf/t131-raw.md`, HASH 241d1b15325050f0). FROZEN qua `prereg freeze` — sửa sau freeze = PREREG_MISMATCH (exit 5).

## 1) Lệnh `apply`

- `node wf/pipeline.mjs apply <plan.json>`; mỗi entry `{path, before_sha256|null, content|contentPath}`.
- `before_sha256: null` = file chưa tồn tại (mọi entry khác phải khớp hash hiện tại).
- Path chỉ trong allowlist `wf/` (hoặc file được gate cho phép); canonicalize path, **từ chối traversal** (`..`, đường dẫn tuyệt đối ra ngoài).

## 2) Chu trình nguyên tử (lock + revalidate + atomic rename)

- Acquire lock `wf/.apply.lock` bằng create-exclusive (`wx`); lock lỗi hoặc đã tồn tại ⇒ **exit 8**, không ghi gì.
- Khi đang giữ lock: tính lại SHA-256 của **tất cả** `before_sha256` → lệch bất kỳ ⇒ **STALE_REJECT exit 8**, không file nào bị thay đổi, **không auto-rebase**.
- Ghi từng file: temp cùng thư mục → `rename` atomic; **cleanup temp + lock trong mọi nhánh** (thành công, stale, lỗi giữa chừng).

## 3) Tích hợp git-gate.ps1

- Đầu gate: capture `HEAD` + snapshot `staged-path/blob-hash` của từng file staged.
- **Ngay trước `git commit`**: revalidate HEAD + staged blob; lệch ⇒ **GATE FAIL, không commit**.

## 4) Test fixtures — `wf/test-apply.mjs`

1. Apply hợp lệ → exit 0, file đúng nội dung.
2. Tái hiện stale: plan theo hash H của X, sửa X (mô phỏng race), apply → **exit 8**, X không bị ghi đè.
3. Lock đang giữ → apply thứ 2 **exit 8**, không ghi.
4. Atomic: không quan sát được file nửa vời (temp+rename).
- Test tự tạo/dọn fixture, chạy lặp được (idempotent).

## 5) Exit codes

- **8 = STALE/LOCK** (mới, reserved); mã 0–7 giữ nguyên.

## Acceptance

- [ ] 4 fixture PASS (`node wf/test-apply.mjs`).
- [ ] Sửa file giữa check và apply → reject (fixture 2).
- [ ] git-gate regression: gate thường vẫn PASS; staged đổi giữa đầu gate và commit → FAIL không commit.
- [ ] Không force, không ghi đè khi stale; test chạy lại được.
