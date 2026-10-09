# T149 Spec — Rút gọn CONTEXT.md + docs/history.md + D14 [PROPOSED]

Date: 2026-10-09
Role: opencode→CHATGPT review
Review: PASS (spec rev3 approved for implement)

## Scope

### 1. CONTEXT.md — rút gọn ≤40 dòng
- Giữ nguyên thông tin vận hành hiện hành: Đội, Kiến trúc V1, Liên hệ nhanh, Phân vai.
- Rút gọn phần "Trạng thái hiện tại": giữ trạng thái hiện hành + task đang mở (T146-T149, T150, T126TEST).
- Chuyển lịch sử dài (T100-T145) sang `docs/history.md`.
- Giữ nguyên mọi guardrail, workspace boundary, quy tắc commit/push và trạng thái task còn mở.
- Nếu không thể giữ đủ thông tin trong 40 dòng, chuyển phần diễn giải sang docs/history.md nhưng CONTEXT.md phải giữ chỉ dẫn vận hành ngắn gọn, KHÔNG được chỉ dẫn sang lịch sử để thay thế guardrail thiết yếu.

### 2. docs/history.md — mới
- Ghi lại lịch sử task/commit có căn cứ từ CONTEXT.md + LOG.md.
- Tách rõ VERIFIED và EXECUTOR-REPORTED.
- Chỉ ghi commit hash/test PASS là VERIFIED khi có bằng chứng tương ứng (git show, test output).
- Nếu chỉ có báo cáo executor, gắn nhãn EXECUTOR-REPORTED.
- Không tự suy diễn rằng commit đã được push chỉ từ việc commit tồn tại.
- Nguồn: nội dung rút gọn từ CONTEXT.md dòng 24-42.

### 3. DECISIONS.md — D14 [PROPOSED]
- D14 hiện tại (dòng 123-127) đã ghi nhưng chưa có tag [PROPOSED].
- Thêm [PROPOSED] vào tiêu đề D14.
- KHÔNG nâng thành quyết định đã phê duyệt.
- KHÔNG đổi nội dung quyết định khác.

## Constraints
- KHÔNG sửa T134 bundle, prereg-manifest, pipeline, LOG sealing.
- KHÔNG stage/commit wf/state.json hoặc AGENTS.md.
- CONTEXT.md ≤40 dòng.
- git diff --check PASS.

## Acceptance
- CONTEXT.md ≤40 dòng, không mất thông tin vận hành + guardrail.
- docs/history.md tồn tại, có phân biệt VERIFIED / EXECUTOR-REPORTED và dẫn nguồn.
- DECISIONS.md D14 có [PROPOSED].
- verifychain exit 0.
- git diff --check exit 0.
- **git status --short: chỉ CONTEXT.md, DECISIONS.md, docs/history.md (mới) — SAU KHI LOẠI TRỪ các thay đổi tồn tại từ trước (wf/state.json, AGENTS.md). KHÔNG được yêu cầu dọn, restore, stage hoặc sửa wf/state.json hay AGENTS.md để đạt gate.**
