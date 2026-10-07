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
       └─ CODELOCAL: optional mutation boundary (probe riêng, CHƯA chạy)
```

## Trạng thái hiện tại
- Pilot triết học "Đạo & AI" (2 vòng shuttle DOM): HOÀN THÀNH — method hoạt động.
- Thảo luận meta-workflow vòng 1: **ĐỒNG THƯỜNG V1** (phương án C, WF:v1, escalation policy).
- Thảo luận vòng 2 (chỉ đạo 80/20 + research): **V1.5 FINAL — ChatGPT chốt, Claude KÝ** (xem DECISIONS.md D8). Research findings: mcp-web-llm = reference có sẵn; browser-use/desktop-commander = cắt; model routing bảng D7.
- **Tiếp theo = V1.5 checklist:** bước 1 = CodeLocal probe 1h (free có thấy connector/MCP?), rồi dry-run → parser → git gate → adapter ChatGPT → 1 task thật.
- CodeLocal: CHƯA cài — chờ probe. License npm UNLICENSED vs GitHub Apache-2.0 cần verify.
- Session exam mobifone: đã logout (task thi đã xong — xem LOG.md mục Exam).

## Liên hệ nhanh
- ChatGPT thread: https://chatgpt.com/c/6ac5cc72-166c-83ec-adba-0c647ab76511
- Claude thread: https://claude.ai/chat/543d7115-27b3-48ce-a190-f42bb4d66e0d
