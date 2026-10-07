# T132 CONSENSUS — Blind-first ChatGPT × Grok (frozen kết quả)

Phương pháp: cùng 1 input gửi độc lập cho 2 AI (blind), thu đủ 2 câu trả lời TRƯỚC khi trao đổi, rồi cross-critique 2 chiều. Evidence đầy đủ: `wf/t132-raw.md`.

## Kết quả

| Vòng | ChatGPT (tab0) | Grok (tab4) |
|---|---|---|
| Blind | **PREFER:d** | **PREFER:d** |
| Cross-critique | PASS | PASS |

**Consensus: `PREFER:d` — ưu tiên #1 hai tuần tới = sửa/kiểm chứng executor path (CodeLocal "routable workspace path"), cả 2 chọn độc lập, 0 vote khác.**

## Đồng thuận (cả 2 nêu blind, không trao đổi)

1. CodeLocal fail 3 lần liên tiếp → executor path là điểm nghẽn thực dụng.
2. 3 cơ chế chống sai sót (prereg/standalone/bundle) đã chạy ổn 35 task → harden thêm lợi ích biên thấp.
3. Mở rộng AI / tự động hóa relay vô nghĩa chừng nào execute còn block.

## Điểm bổ sung sau cross (hai chiều bổ sung cho nhau)

- **ChatGPT:** phân biệt "sửa CodeLocal" vs "xác minh contract routing" — chứng minh root cause trước, tránh patch mù; phải biến routing rule thành **gate kiểm chứng được**, không chỉ tài liệu.
- **Grok:** rủi ro race/path contract — **khóa workspace root trước khi retry** (điểm ChatGPT bỏ sót).
- Khác biệt nhỏ cùng hướng: ChatGPT nhấn fail-closed + acceptance test; Grok nhấn tái hiện + ghi DECISIONS → gộp cả hai.

## ACTION chốt (24h)

Tái hiện lỗi path bằng task tối thiểu → capture workspace/routing evidence → xác định contract đúng/sai → test gate (fail-closed nếu CodeLocal không PASS) → **chỉ sửa khi có root cause** → ghi DECISIONS + khóa workspace root trước retry.

Ghi nhận: blind-first chạy được với cặp ChatGPT+Grok (Claude không nằm trong cặp — theo T130 REVISE), không phát sinh lượt Claude (claude_calls=0).
