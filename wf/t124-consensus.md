# T124 CONSENSUS — Đánh giá repo ai-orchestrator → Kế hoạch tích hợp
Ngày: 2026-10-07. Council: ChatGPT-architect (Think) + Claude (phản biện) + Grok (phản biện). Gemini chưa tham gia (không cần — consensus 3/3).

## Bắt buộc (thứ tự bắt buộc)
1. **T125 — Prereg freeze**: hash bộ spec/acceptance do **opencode tính** (không phải model), freeze trước execution; sửa 1 byte sau freeze ⇒ gate BLOCKED.
2. **T126 — Independent verifier (ưu tiên cao nhất)**: Node, chạy process/bước riêng, output vùng read-only, orchestrator chỉ đọc; **FAIL-CLOSED** khi thiếu/sai/malformed/bypass verdict; gate bắt buộc 2 fixture: đúng → PASS, cố tình sai → FAIL.
3. **T127 — Evidence bundle**: SHA256SUMS + provenance cho input/raw/output/evidence, gộp với hash-chain C4, neo commit/tag git, anchor hash ngoài bundle; sửa 1 artifact ⇒ FAIL. Gắn task_id/attempt_id ngay.

## Có điều kiện (điều kiện bỏ ghi rõ)
4. **T128 — Ground-truth isolation**: chỉ mở khi có benchmark/oracle ngoài acceptance test. Không có → bỏ.
5. **T129 — Parallel swarm + lease/fencing**: chỉ mở khi LOG chứng minh cần concurrent worker; khi đó thiết kế lease/fencing + quota burn + lease-id trong bundle. Không cần → bỏ.

## Không lấy
browser-use, multi Chrome/CDP, CloakBrowser, Ollama fallback, board.json UI orchestration, pipeline/swarm role-prompt thay envelope.

## Thứ tự ra quyết định
T125 → T126 → T127 → **DỪNG**, chạy 1 task thật qua cả 3 rồi audit trước khi mở T128/T129.
