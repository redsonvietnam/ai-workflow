# T124 — Claude (tab2) phản biện

VERDICT: REVISE (T125-T128 PASS, T129 REVISE; thứ tự cần đổi)

DELTA:
T125 prereg freeze: PASS. Trùng C2 (spec lock). Giữ điều kiện "sửa 1 byte → BLOCKED", nhưng hash phải do opencode tính, không phải ChatGPT.
T126 independent verifier: PASS có điều kiện. Đây là mục giá trị nhất, vì nó giải đúng lỗ hổng T103 (VERDICT do model tự quyết). Rủi ro lớn nhất: "independent" chỉ đúng nếu verifier không dùng chung code, tiến trình hay quyền ghi với orchestrator. Nếu orchestrator sở hữu file verdict thì "không bypass được" chỉ là lời hứa. Verifier phải ghi vào đường dẫn orchestrator chỉ đọc, hoặc chạy ở bước riêng mà gate đọc kết quả.
T127 evidence bundle: PASS. Gộp với hash chain C4 và anchor trong commit/tag đã nêu ở Phase 2, tránh hai cơ chế song song. SHA256SUMS chỉ chống sửa nếu tổng hash được neo ngoài bundle.
T128 ground-truth isolation: REVISE, hạ ưu tiên. Với workflow code thường, "oracle" thường chỉ là test, và test đã nằm trong acceptance (C2). Isolation chỉ đáng khi có benchmark hoặc đánh giá model. Chưa thấy use case, nên theo đúng chỉ đạo 80/20 thì để sau.
T129 parallel swarm: REVISE. Song song kéo lease/fencing quay lại, mà C1 đã hoãn tới khi có >=2 worker. Nó cũng đốt quota free-tier nhanh hơn. Nên chuyển thành mục có điều kiện kích hoạt bằng số trong DECISIONS.md, chưa phải task.
Thứ tự: T125→T129 gần đúng nhưng nên là T125 → T126 → T127, rồi dừng và chạy 1 task thật. T128, T129 chỉ mở khi LOG cho thấy nhu cầu. Còn thiếu: dry-run phải test verifier bằng fixture đúng và fixture cố tình sai (có trong T126, nhưng cần là gate bắt buộc).

ACTION:
Đổi consensus thành 3 task bắt buộc (T125-T127) và 2 task có điều kiện kích hoạt (T128, T129), mỗi mục kèm điều kiện bỏ.
Thêm quy tắc: verifier chạy độc lập và ghi vào vùng chỉ đọc với orchestrator, hash đầu chain neo vào git tag.

EVIDENCE: Chỉ dựa trên mô tả trong packet. Chưa xem repo ai-orchestrator, code verifier hay log. HASH 8805a5f79d6715da chưa được đối chiếu vì tôi không tự tính được.
