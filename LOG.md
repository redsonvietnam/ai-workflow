# LOG — Sự kiện & Evidence

## 2026-10-07
- **Exam mobifone (hoàn tất):** 7 lần thi, đều Đạt (5×30/30, 1×29/30). Script tô+nộp+verify qua Playwright. Câu sai lần cuối = click lệch vị trí (key C đúng theo API `exam/info/{candidateId}`), không phải key sai. Session đã logout.
- **Pilot "Đạo & AI":** shuttle 2 vòng ChatGPT↔Claude qua DOM — relay method OK, nhưng đắt token + mong manh selector.
- **Thảo luận meta-workflow (2026-10-07):** context + tranh luận A/B/C đã đưa vào cả 2 khung chat. Vòng 1: ChatGPT đề xuất phương án C + [WF:v1] + verify CodeLocal + Pilot P1. Vòng 2: Claude phản biện (C="B ngoại giao"? quota loop, hash phải do opencode, git-as-memory, dry-run, threat model). Vòng 3: ChatGPT trả lời 4 điểm + chốt schema V1. **Vòng chốt: Claude ĐỒNG Ý V1** với 2 điều kiện: (1) escalation bằng code, ngưỡng 2 Claude/task; (2) CodeLocal bước 0 trước mọi verify.
- **Ghi state:** tạo `D:\ai-workflow\{CONTEXT,DECISIONS,LOG}.md` — hệ thống record local theo D1.

## Việc tiếp theo = V1.5 checklist (DECISIONS.md D8)
1. CodeLocal probe 1h: ChatGPT Free có thấy connector/MCP không → không thì STOP.
2. Dry-run + parser + git gate (0 quota) → adapter Playwright mỏng ChatGPT → 1 task thật.
3. Hard stop: adapter chưa ổn sau 8h → fallback inbox/outbox file.

## 2026-10-07 (vòng 2 — chỉ đạo 80/20)
- Research: browser-use 117k★ (cắt), Playwright MCP (nền), **mcp-web-llm** (reference relay web-UI free), desktop-commander 8.8k★ (cắt — opencode có shell; ChatGPT connector đòi Developer mode), CodeLocal Project Brain (probe — license npm UNLICENSED vs GitHub Apache-2.0), model routing (Gemini=tool/long-context, Grok=2nd opinion, Claude=escalation vì quota ít).
- 2 vòng thảo luận ChatGPT↔Claude → **V1.5 FINAL: ChatGPT chốt, Claude KÝ + điều kiện hard-stop 8h adapter → inbox/outbox fallback**. Điểm mốc: KHÔNG fork nguyên khối mcp-web-llm (đọc code tham khảo, tự viết adapter ~150 dòng), ask_all bị loại, Claude_calls=0 trong V1.5.
