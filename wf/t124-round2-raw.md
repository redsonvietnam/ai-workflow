# T124 — Architect (tab0) ROUND 2 — CHỐT CONSENSUS CUỐI

VERDICT: PASS

DELTA: Chốt consensus cuối: T125 bắt buộc — Prereg/spec-lock hash do opencode tính và freeze trước execution; acceptance: sửa 1 byte sau freeze ⇒ BLOCKED, model không được tự thay hash. T126 bắt buộc, ưu tiên cao nhất — Independent verifier chạy bước/process riêng, output vùng read-only để orchestrator chỉ đọc; verifier FAIL-CLOSED khi thiếu/sai/malformed/bypass verdict. Acceptance bắt buộc gồm fixture đúng PASS + fixture cố tình sai FAIL. T127 bắt buộc — Evidence bundle chuẩn hóa SHA256SUMS + provenance, gộp hash-chain C4, neo commit/tag git và anchor hash nằm ngoài bundle; acceptance: sửa 1 artifact hoặc chain ⇒ verification FAIL. Có thể gắn task_id/attempt_id ngay; lease-id chưa đưa vào V1 vì C1 hiện không có lease/fencing.

T128 có điều kiện — Ground-truth isolation chỉ mở khi xuất hiện benchmark/oracle ngoài acceptance; điều kiện bỏ: không có nhu cầu benchmark trong thực tế. Acceptance: reviewer/executor không thấy oracle nhưng verifier vẫn đối chiếu được.

T129 có điều kiện — Chỉ mở khi LOG chứng minh cần parallel/concurrent worker hoặc quota-control thực tế; khi đó thiết kế lease/fencing + quota burn. Không cần thì bỏ.

ACTION: Thứ tự T125 → T126 → T127 → DỪNG, chạy 1 task thật qua cả ba rồi audit trước khi mở T128/T129. Đây là consensus cuối; điểm duy nhất chưa chốt là lease-id, tạm hoãn cùng lease/fencing sang T129.

EVIDENCE: Claude REVISE + Grok PASS có điều kiện trong T124-ROUND2; DECISIONS.md D11; C2/C4 và T121–T123.
