# T133 — Executor (tab3) SEQ 2

VERDICT: UNCERTAIN

DELTA: CodeLocal đọc được spec và pipeline.mjs, nhưng edit.patch bị chặn với `patch does not contain a routable workspace path`. Chưa có thay đổi code, chưa chạy fixture/regression.

ACTION: Fallback local/OpenCode triển khai T133 theo frozen spec.

EVIDENCE: workspace ai-workflow-ac2fe45f3e; edit.patch HALTED; terminal chưa chạy.

---

## Fallback local (opencode) — implement theo spec frozen `9a43dd17…`

- Nhánh `dispute <task> <create|round|status>` trong `wf/pipeline.mjs` (giữa `reap` và `log`): create round=0/OPEN, status read-only, `round --class` chỉ nhận 4 class (sai → exit 2), round 1–2 OPEN, **round 3 → BLOCKED + task → DEAD_LETTER qua `assertTransition` (try/catch — DONE/không tồn tại → chỉ BLOCK dispute)**, transition hợp lệ exit 0 kể cả BLOCKED, dispute đã BLOCKED từ chối vòng mới (exit 2).
- `saveState` nâng atomic: temp + `renameSync` (spec mục 5).
- `wf/test-dispute.mjs`: 9 fixture — **9/9 PASS ×2 lần** (create/round1/round2/round3-blocked-deadletter/persist/bad-class=2/blocked-reject/rerun-idempotent/status-readonly); backup/restore `state.json` nên chạy lặp sạch, không rò fixture.
- Regression: `validate` exit 0, `verifychain` exit 0, `prereg check` exit 0, `test-apply.mjs` 4/4 PASS.
- CodeLocal fail streak: 3 lần liên tiếp cùng lỗi routable path (T131 ×2, T133 ×1) → theo rule ≥2 fallback local.
