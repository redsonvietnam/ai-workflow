# T137 — SPEC (architect ChatGPT, 2026-10-08)

TASK: T137
SEQ: 1
ROLE: CHATGPT
HASH: be4c9d4934d64074
VERDICT: PASS

## OBJECTIVE
Stabilize full-test determinism (2 lỗi flaky), fix root cause, không che lỗi bằng timeout.

## CONTEXT_REF
- T136 SEQ2 verdict (GitHub-based): nhánh `agent/bamso-core06-audit-snapshot-20261005` @ `2f6cf9a` đã push, ahead main 10 / behind 0; repo public; open issues 0; PR cũ #16/#15/#3/#2 không phản ánh workstream hiện tại.
- Repo: D:\bamso

## SPEC

### (1) KioskQueuePeek
- Giả thuyết: timeout do dynamic import/module transform của `@/app/kiosk/page` tranh tài nguyên khi Vitest chạy song song, không phải test assertion.
- Xác minh trước patch:
  1. `npm test -- --run src/components/customer/KioskQueuePeek.test.tsx` (chạy riêng)
  2. `npm test -- --run` ≥3 lần, ghi đúng test file/5s timeout
  3. So sánh chạy cùng test với execution tuần tự/pool hiện có để xác định concurrency sensitivity.
- Fix chỉ được đổi test-harness/Vitest setup/import strategy; **không tăng timeout** và không sửa feature.

### (2) audit-service
- Giả thuyết: các worker dùng chung SQLite DB khiến row của test khác tồn tại (`1` → `2`).
- Xác minh:
  1. `npm test -- --run src/lib/__tests__/audit-service.test.ts` (chạy riêng)
  2. Chạy file này đồng thời với một test DB khác
  3. Kiểm tra `vitest.config.ts`, setup DB/reset hooks và đường dẫn `DATABASE_URL`.
- Fix ưu tiên isolated DB/worker hoặc serialize đúng nhóm DB; **không đổi schema/migration/prod code**.

### (3) Acceptance
- Full suite `npm test -- --run` **GREEN 3 lần liên tiếp**.
- Mỗi test riêng PASS.
- `npm run type-check`, `npm run lint`, `npm run build` giữ nguyên PASS.
- Không tăng timeout để che lỗi; production behavior không đổi.

### (4) Boundaries
- Chỉ test harness/isolation cần thiết; tối đa mỗi lỗi 1 commit.
- Không migration/schema/customer-kiosk feature.

## ACTION
Executor bắt đầu bằng **reproduce + capture evidence trước patch** cho cả hai lỗi, rồi mới chọn fix tối thiểu dựa trên root cause đã chứng minh.

## EVIDENCE
- T136 SEQ2; branch `agent/bamso-core06-audit-snapshot-20261005` @ `2f6cf9a`
- HANDOFF.md ghi hai intermittent failures và việc cả hai PASS khi chạy riêng.
