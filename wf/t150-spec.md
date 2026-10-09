# T150 Spec — Cleanup Session State

Date: 2026-10-09
Role: opencode→CHATGPT review

## Context
T146-T149 đã commit + push. wf/state.json có các entry CREATED/undefined/T126TEST chưa dọn.

## Scope

### 1. wf/state.json — dọn session state
- Xóa các entry CREATED không có spec: `T126TEST`, `undefined`.
- Giữ nguyên `T150` (sẽ xử lý khi có spec hoặc chuyển sang DEAD_LETTER).
- Giữ nguyên `seq` — không sửa.
- KHÔNG sửa `claudeCalls`.

### 2. Cập nhật CONTEXT.md
- Bỏ `T126TEST` khỏi task đang mở.
- Giữ nguyên `T150` và `T145-B`.

## Constraints
- KHÔNG sửa T134 bundle, prereg-manifest, pipeline, LOG sealing.
- KHÔNG stage/commit AGENTS.md.
- wf/state.json: giữ nguyên format, chỉ xóa entry CREATED rác.

## Acceptance
- wf/state.json: không còn `T126TEST`, `undefined`.
- CONTEXT.md: không còn `T126TEST`.
- verifychain exit 0.
- git diff --check exit 0.
- git status --short: chỉ wf/state.json, CONTEXT.md — SAU KHI LOẠI TRỪ AGENTS.md và wf/t149-spec.md.
