# Ghi chú thảo luận: chính sách tab AI cho workflow

> Ghi lại từ chỉ đạo của user (2026-10-08, trong lúc chạy T138/BAMSO) — **để thảo luận sau**, chưa phải quyết định (chưa ghi DECISIONS.md).

## Đề xuất
- **Điều kiện bình thường: chỉ cần 2 tab**
  1. **ChatGPT (kèm CodeLocal)** — thực thi/đọc code local khi CodeLocal hoạt động
  2. **ChatGPT Thinking (architect)** — thiết kế/spec
- **Nếu fail nhiều lần** (CodeLocal blocked, envelope FAIL/BLOCKED liên tiếp, hash/verify lỗi…): mới cân nhắc hỏi AI khác.
- **Claude là lựa chọn ưu tiên khi escalate** — "rất giỏi" (theo user); Grok/Gemini là dự phòng tiếp theo (tiết kiệm quota Claude — T122: 1/task, 2/ngày).

## Bối cảnh quan sát thực tế (T131–T137)
- CodeLocal DEGRADED/blocked ≥6 lần liên tiếp → phần lớn task fallback local (opencode làm trực tiếp).
- Phân vai hiện tại trong CONTEXT.md ghi 4 tab (architect/executor/Claude/Grok+Gemini) — có thể thừa so với nhu cầu thực tế 2 tab.

## Câu hỏi thảo luận
1. Có chính thức hóa "2 tab mặc định, escalate khi fail ≥N lần" thành D-quyết định mới?
2. Nên chăng tách bớt tab Grok/Gemini khỏi danh sách mặc định (chỉ mở khi cần)?
3. Ngưỡng fail rõ ràng để escalate (2 lần? 3 lần?) — hiện phản xạ ngầm là "≥2 lần → fallback local", còn escalate Claude thì theo T122.
