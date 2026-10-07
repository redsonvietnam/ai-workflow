# CONTEXT — Workflow Đa AI Free-Tier

Cập nhật lần đầu: 2026-10-07

## Đội
- **opencode** (mimo-v2.6, local Windows): control plane — router, executor, hash/SEQ, escalation gate, ghi state.
- **ChatGPT** (tab0, free, quota rộng): primary reasoning/execution.
- **Claude** (tab1, free Sonnet 5.5, quota ít): conditional reviewer CHỈ khi escalate.
- **Human** (Fesdinang): scope + gate + duyệt.

## Kiến trúc V1 (đã chốt — xem DECISIONS.md)

```
HUMAN → scope/gate
  └─ OpenCode CONTROL PLANE
       ├─ STATE: CONTEXT.md / DECISIONS.md / LOG.md
       ├─ GIT: branch + diff + rollback (mỗi task 1 branch)
       ├─ RELAY: WF:v1 structured envelope
       ├─ CHATGPT: primary reasoning/execution
       ├─ CLAUDE: conditional reviewer only
       └─ CODELOCAL: mutation boundary — READ (T101) + WRITE (T102) ĐÃ PROOF end-to-end
```

## Trạng thái hiện tại
- Pilot triết học "Đạo & AI" (2 vòng shuttle DOM): HOÀN THÀNH — method hoạt động.
- Thảo luận meta-workflow vòng 1: **ĐỒNG THƯỜNG V1** (phương án C, WF:v1, escalation policy).
- Thảo luận vòng 2 (chỉ đạo 80/20 + research): **V1.5 FINAL — ChatGPT chốt, Claude KÝ** (xem DECISIONS.md D8). Research findings: mcp-web-llm = reference có sẵn; browser-use/desktop-commander = cắt; model routing bảng D7.
- **V1.5 checklist bước 1-7 DONE**, merge vào main (4566e88). CodeLocal probe PASS (14 tools, Apache-2.0).
- **V2 test DONE (2026-10-07):** T101 read PASS, T102 write PASS (executionMode=live do user chọn; schema mismatch gateway/plugin — điều kiện bỏ ở D9), T103 escalation Claude PASS (claude_calls=1). Evidence: wf/t101-*, wf/t102-*, wf/t103-*.
- **T104/T105 (2026-10-07):** harden pipeline HOÀN THÀNH qua phân vai architect→executor — verifyReply, decideVerdict, byte accounting, 9 fixtures PASS (main=b96e8c8). Còn: fallback inbox/outbox dry test; wire byte-accounting vào relay thật.
- Session exam mobifone: đã logout (task thi đã xong — xem LOG.md mục Exam).
- **Council T112-T115 (2026-10-07):** 4 model thảo luận — ChatGPT-architect (Think) × Grok shuttle 2 vòng, Claude chấm 7/8, chốt consensus 4 mục (wf/t112-consensus.md). **T116-T119 IMPLEMENTED** (D11): C4 observability (terminal transition+finalHash, payload strip), C3 idempotent replay (dedupe LOG), C2 acceptance-contract gate (`gate` exit 0/3), C1 state machine đơn giản (reapStale timeout/attempts/DEAD_LETTER). Executor blocked 2 lần ở T119 → fallback local. **Phase 2 HOÀN THÀNH (2026-10-07): T121 schema gate (`validate` exit 2, wf/v1.schema.json), T122 escalation budget (1/task, 2/ngày, `escalation` exit 3 HUMAN_REQUIRED), T123 hash-chain (prevHash/eventHash canonical, `verifychain` exit 4 tamper detect — main=1ca1284).**
- **Grok đã kết nối** (tab4, user Son Red): thread T112 https://grok.com/c/aea5bb31-8412-437c-ae94-2d6f6e6c4fcc

## Liên hệ nhanh
- **ChatGPT-architect** (context hub, tab0 — Think ON): https://chatgpt.com/c/6ac64508-3590-83ec-805b-bfff5af66840
- **ChatGPT-architect cũ** (archive — CodeLocal đã vô hiệu hóa Think trên tab này, T111 bootstrap sang thread mới): https://chatgpt.com/c/6ac5cc72-166c-83ec-adba-0c647ab76511
- **ChatGPT-executor** (thực thi qua CodeLocal, tab3): https://chatgpt.com/c/6ac63252-3d5c-83ec-8216-b07878332525
- **Claude** (escalation thật sự cần, tab2): https://claude.ai/chat/543d7115-27b3-48ce-a190-f42bb4d66e0d
- Gemini **đã kết nối** (tab5, đăng nhập sẵn, input hoạt động) https://gemini.google.com/app — dự phòng quota. Grok = đã kết nối (tab4).

## Phân vai (2026-10-07, user chỉ đạo)
- **opencode**: điều phối/thuyển thư — sinh envelope, hash/SEQ, verify độc lập, gate commit. Ít làm việc trực tiếp.
- **ChatGPT-architect**: thiết kế spec (tab0, Think ON, bootstrap T111 PASS; context đầy đủ lưu local).
- **ChatGPT-executor**: nhận spec, code qua CodeLocal edit, tự chạy dry-run (tab3, thread mới mỗi task lớn).
- **Claude**: chỉ khi architect UNCERTAIN/block thật sự (tiết kiệm quota). Gemini/Grok: thay thế lúc ChatGPT kẹt.
