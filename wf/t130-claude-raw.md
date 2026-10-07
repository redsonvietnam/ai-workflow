# T130 — Claude (tab2, Sonnet 5.5) phản biện SEQ 2

VERDICT: REVISE (T131 TAKE có điều kiện, T132 REVISE, T133 TAKE, T134 REJECT dạng audit đầy đủ)

DELTA:
T131: chữa được stale-hash chỉ khi revalidate nằm trong cùng bước nguyên tử với apply (kiểm xong rồi mới apply thì vẫn có khoảng hở). Nó chữa phát hiện stale, không chữa nguyên nhân của CodeLocal, và tôi chưa thấy bằng chứng nguyên nhân đó. Cần tái hiện lỗi trước khi nhận là đã chữa.
T132: blind-first mâu thuẫn T122, vì chấm độc lập từ 2 AI nghĩa là tốn thêm lượt Claude trước khi trao đổi. Chỉ chạy được khi cả hai là model rẻ (ChatGPT, Grok) và Claude không nằm trong cặp.
T133: hợp lý, vì "max 2 vòng rồi BLOCKED" trùng max_attempts và DEAD_LETTER, gần như không tốn thêm.
T134: 42 test của PCM tự nhận chưa kiểm chứng ngoài chính nó, nên audit toàn bộ là lãng phí. Chỉ trích các ràng buộc mà T131/T133 thực sự cần.
Điểm hổng chung: probe ACP cho thấy opencode permission deny/ask không enforce. Mọi gate "opencode giữ quyền" đang dựa vào thứ chưa được thực thi, nên cần gate ở tầng git/hệ điều hành.

ACTION:
T131 làm trước, kèm test tái hiện stale-hash (sửa file giữa check và apply thì apply phải bị từ chối).
T132 chỉ cho cặp ChatGPT+Grok, không dùng Claude trong blind-first.
Thu hẹp T134 còn trích ràng buộc cần dùng, không audit 42 test.
Ghi DECISIONS: permission opencode không enforce, nên enforce bằng branch wf/* và pre-commit hook.

EVIDENCE: Chỉ dựa trên tóm tắt trong packet. Chưa đọc wf/t130-raw.md, D11-D12 hay repo nào. HASH 1225ca2e953e31cb chưa đối chiếu vì tôi không tự tính được.

---
Ghi chú: envelope wf/t130-envelope-claude.txt (HASH 1225ca2e953e31cb, SEQ 2); readback trước gửi khớp 2061/2061 ký tự; đây là lượt Claude duy nhất của T130 (budget 1/task).
