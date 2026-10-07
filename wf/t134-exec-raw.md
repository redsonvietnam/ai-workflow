# T134 — Executor (tab3) SEQ 2

VERDICT: UNCERTAIN

DELTA: CodeLocal apply bị chặn trước khi thực thi; chưa có thay đổi và chưa chạy test.

ACTION: Retry CodeLocal với edit có nội dung/patch cụ thể sau khi đọc frozen spec.

EVIDENCE: workspace ai-workflow-ac2fe45f3e; execution blocked; chưa có test evidence.

---

## Fallback local (opencode) — implement theo spec frozen `f739504d…`

- **Fail streak CodeLocal: 4 lần liên tiếp** (T131 ×2, T133 ×1, T134 ×1 — cùng lỗi routable/blocked) → theo rule ≥2 fallback local, không retry thêm.
- Viết `wf/t134-pcm-constraints.md` (4 nhóm ràng buộc, ID ổn định, excerpt ≤3 dòng nguyên văn, mapping T131/T133, neo 4 nguồn pinned kèm SHA-256 tính lại).
- Viết `wf/test-t134.mjs`: recompute 4 hash từ nguồn pinned (3 file raw pinned commit `ee20500a…` + skill local) → khớp 4/4 PASS; tamper 1 byte → FAIL.
- Không sửa pipeline, không đổi exit 0–8.
