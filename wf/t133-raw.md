# T133 — Architect (tab0) spec SEQ 1

VERDICT: PASS

DELTA: T133 SPEC: (1) CLI node wf/pipeline.mjs dispute <task> <create|round|status>. Lưu st.disputes[task]={round,classes,status}; create khởi tạo round=0,status=OPEN; status chỉ đọc. (2) round --class <factual|spec|interpretation|preference> chỉ nhận 4 class, append class và tăng round; round 1–2 = OPEN. Round 3 vẫn ghi round=3, chuyển dispute=BLOCKED; nếu task tồn tại và assertTransition cho phép, chuyển task → DEAD_LETTER; task DONE/không tồn tại thì chỉ BLOCK dispute. (3) Dùng exit 0 cho transition hợp lệ, kể cả BLOCKED: đây là kết quả điều phối hợp lệ, không phải lỗi runtime; giữ nguyên exit 0–8. Class sai ⇒ exit 2. (4) test-dispute.mjs: create → factual → interpretation → round3 ⇒ BLOCKED + DEAD_LETTER; class sai ⇒ exit 2; chạy lặp sạch/idempotent. (5) Mọi mutation phải atomic và không được làm mất dispute hiện tại.

ACTION: Opencode ghi nguyên spec vào wf/t133-spec.md, freeze SHA-256; sau đó CodeLocal triển khai + chạy fixture/regression state-machine. Không mở scope escalation/quota ngoài T133.

EVIDENCE: wf/t130-consensus.md mục T133; workflow-lab/AI_COLLABORATION_PROTOCOL_V1; state machine hiện có assertTransition, max_attempts=3, DEAD_LETTER; T122; T131 exit 8 reserved.
