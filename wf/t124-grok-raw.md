# T124 — Grok (tab4) phản biện

VERDICT: PASS (có điều kiện)

DELTA:
T125: Đồng ý (hash do orchestrator tính + freeze trước run).
T126: Đồng ý mạnh (verifier Node + vùng chỉ-đọc; sửa lỗ hổng tự-chấm).
T127: Đồng ý (bundle + SHA256SUMS + neo git).
T128: Đồng ý hạ (đã cover bởi acceptance; không cần task riêng).
T129: Đồng ý REVISE → conditional trong DECISIONS.md (lease/fencing + quota trước).

Điểm mấu chốt cả 2 có thể bỏ sót:
- Verifier phải fail-closed khi orchestrator cố bypass (không chỉ "không bypass").
- Evidence bundle cần gắn lease-id để chống stale write sau expiry.

ACTION: Thứ tự T125 → T126 → T127 rồi dừng chạy task thật; T128/T129 phase sau hoặc DECISIONS.

EVIDENCE: Khớp consensus T113 (lease + acceptance + idempotent + observability) + free-tier constraint; T126 vá lỗ hổng lớn nhất.
