# T133 SPEC — Phân loại disagreement → BLOCKED/DEAD_LETTER (frozen)

Nguồn: architect SEQ1 (`wf/t133-raw.md`, HASH 8e68241996f39894). FROZEN qua `prereg freeze` — sửa sau freeze = PREREG_MISMATCH.

## 1) CLI `dispute`

- `node wf/pipeline.mjs dispute <task> <create|round|status>`.
- Lưu `st.disputes[task] = {round, classes: [...], status}` trong `state.json`.
- `create`: khởi tạo `round=0, status=OPEN`; `status`: chỉ đọc (in JSON).

## 2) `round --class <factual|spec|interpretation|preference>`

- Chỉ nhận đúng 4 class; append class vào `classes`, tăng `round`.
- Round 1–2: `status` giữ `OPEN`.
- **Round 3**: vẫn ghi `round=3`, chuyển dispute → **`BLOCKED`**; nếu task tồn tại trong `st.tasks` và `assertTransition` cho phép → chuyển task → **`DEAD_LETTER`**; task `DONE`/không tồn tại → chỉ BLOCK dispute, không đụng task.

## 3) Exit codes

- Transition hợp lệ (gồm cả khi ra BLOCKED) → **exit 0** — đây là kết quả điều phối hợp lệ, không phải lỗi runtime. Giữ nguyên mã 0–8 hiện có (8 = STALE/LOCK của T131).
- Class sai / tham số sai → **exit 2** (schema).

## 4) Test — `wf/test-dispute.mjs`

1. `create` → `round --class factual` → `round --class interpretation` → `round --class spec` (vòng 3) → dispute `BLOCKED` + task `DEAD_LETTER`.
2. Class sai (vd `--class wrong`) → exit 2.
3. Chạy lặp sạch (idempotent), tự tạo/dọn fixture.

## 5) Atomicity

- Mọi mutation `state.json` phải atomic (temp + rename) — nâng `saveState` dùng temp+rename; không được làm mất dispute hiện tại.

## Acceptance

- [ ] `node wf/test-dispute.mjs` đủ fixture PASS, chạy lại PASS.
- [ ] Dispute quá 2 vòng → `BLOCKED` + `DEAD_LETTER` đúng state machine (`assertTransition`).
- [ ] Class sai → exit 2; exit 0–8 hiện có không đổi.
