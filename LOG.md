# LOG — Sự kiện & Evidence

## 2026-10-07
- **Exam mobifone (hoàn tất):** 7 lần thi, đều Đạt (5×30/30, 1×29/30). Script tô+nộp+verify qua Playwright. Câu sai lần cuối = click lệch vị trí (key C đúng theo API `exam/info/{candidateId}`), không phải key sai. Session đã logout.
- **Pilot "Đạo & AI":** shuttle 2 vòng ChatGPT↔Claude qua DOM — relay method OK, nhưng đắt token + mong manh selector.
- **Thảo luận meta-workflow (2026-10-07):** context + tranh luận A/B/C đã đưa vào cả 2 khung chat. Vòng 1: ChatGPT đề xuất phương án C + [WF:v1] + verify CodeLocal + Pilot P1. Vòng 2: Claude phản biện (C="B ngoại giao"? quota loop, hash phải do opencode, git-as-memory, dry-run, threat model). Vòng 3: ChatGPT trả lời 4 điểm + chốt schema V1. **Vòng chốt: Claude ĐỒNG Ý V1** với 2 điều kiện: (1) escalation bằng code, ngưỡng 2 Claude/task; (2) CodeLocal bước 0 trước mọi verify.
- **Ghi state:** tạo `D:\ai-workflow\{CONTEXT,DECISIONS,LOG}.md` — hệ thống record local theo D1.

## 2026-10-07 (thực thi V1.5 — checklist 1→7)
- **Bước 1 CodeLocal probe = PASS:** plugin ChatGPT Free đã cài, OAuth connected 16/09/2026, 14 tools load (agent/edit/git/terminal/browser/computer/workspace/context/verify...), Developer mode tồn tại trên Free. Cài `codelocal@1.5.87`, authorize workspace `ai-workflow-ac2fe45f3e`, runtime chạy (PID 15108). License GitHub = Apache-2.0 (npm UNLICENSED = lệch packaging).
- **Bước 2:** repo git `D:\ai-workflow` init, root commit `c681269` (main), nhánh `wf/v1-5-setup`.
- **Bước 3-4:** `wf/pipeline.mjs` — envelope WF:v1 (SEQ/SHA256 do script), parser chịu lỗi (bold/bullet/chip retry), **dry-run PASS 6/6 deterministic** (2 vòng giống hệt).
- **Bước 5:** `wf/git-gate.ps1` (branch wf/* + allowlist + diff limit + secret scan) → commit `688cd72` GATE PASS. Parser fix 2 bug thật trong quá trình: split('=') 2 dấu, field bắt nhầm giữa dòng.
- **Bước 6-7 (task thật T100):** envelope `HASH=8a0629e571b0eb3b SEQ=3` → relay opencode→ChatGPT (Playwright, zero copy) → reply 381 ký tự đúng 4 field → parse ok → verdict **UNCERTAIN** (ChatGPT đúng: tự nó không thể tự chốt hop của chính nó — cần human/gate chấm) → log event `claude_calls=0`.
- **V1.5 gate:** dryrun PASS ✓, git gate PASS ✓, 1 task thật relay zero-copy ✓, Claude_calls=0 ✓, token ghi nhận ✓ → các bước 1-7 DONE. Còn bước 8-10 = human merge vào main + quyết định mở V2.
- **Câu hỏi Playwright:** giữ nguyên — research 2026 không có gì tốt hơn cho hướng opencode→chat (browser-use quá nặng, Playwright MCP cùng engine, mcp-web-llm cũng dùng Playwright+CDP). Phân công mới: Playwright = đi ra, CodeLocal = đi vào.

## 2026-10-07 (vòng 2 — chỉ đạo 80/20)
- Research: browser-use 117k★ (cắt), Playwright MCP (nền), **mcp-web-llm** (reference relay web-UI free), desktop-commander 8.8k★ (cắt — opencode có shell; ChatGPT connector đòi Developer mode), CodeLocal Project Brain (probe — license npm UNLICENSED vs GitHub Apache-2.0), model routing (Gemini=tool/long-context, Grok=2nd opinion, Claude=escalation vì quota ít).
- 2 vòng thảo luận ChatGPT↔Claude → **V1.5 FINAL: ChatGPT chốt, Claude KÝ + điều kiện hard-stop 8h adapter → inbox/outbox fallback**. Điểm mốc: KHÔNG fork nguyên khối mcp-web-llm (đọc code tham khảo, tự viết adapter ~150 dòng), ask_all bị loại, Claude_calls=0 trong V1.5.
- 2026-10-07T05:10:06.045Z | {"task":"T100","seq":3,"hash":"8a0629e571b0eb3b","relay":"opencode->chatgpt","verdict":"UNCERTAIN","parse":"ok 4/4 fields","reply_chars":381,"reply_hash":"12f45b4aa2f6bec5","claude_calls":0,"copy_manual":false}
- 2026-10-07T11:04:36.246Z | {"task":"T101","seq":1,"hash":"96fa034fd1ba641b","relay":"opencode->chatgpt->codelocal->git","verdict":"PASS","direction":"READ local via CodeLocal plugin","head_expected":"4566e88","head_evidenced":"4566e88","match":true}
- 2026-10-07T11:34:32.656Z | {"task":"T102","seq":6,"hash":"291fc7917a52b929","relay":"opencode->chatgpt->codelocal->localwrite","verdict":"PASS","direction":"WRITE local via CodeLocal plugin","file":"wf/t102-write-proof.txt","content":"4566e88","sha256":"c1b38adf1d4fde5050171f932371f4bb3e62e23bbf34ea050f87a195297ebde6","verify":"independent-local","executionMode":"live","seqs_used":6,"claude_calls":0,"finding":"gateway schema mismatch: workspace(action=execution) not in published schema v15; called trim-enum per gateway nextAction"}
- 2026-10-07T11:39:01.611Z | {"task":"T103","seq":1,"hash":"91176c3ed93cbea7","relay":"opencode->claude","verdict":"UNCERTAIN","parse":"ok 4/4 fields","reply_hash":"2546e00400b12175","claude_calls":1,"role":"CLAUDE","purpose":"V2-TC1 escalation path","finding":"protocol review: verify reply-side HASH (khong tin echo), VERDICT = recommendation, gate = code; schema-mismatch dieu kiu bo >2 lan/tuan hoac 1 lan mat du lieu -> pin plugin/bo gateway"}
