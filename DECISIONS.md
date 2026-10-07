# DECISIONS — Quyết định đã chốt

## D1. Context ở đâu? (2026-10-07, đồng thuận ChatGPT + Claude + opencode)
**Phương án C:** file local = source of truth (durable); ChatGPT = active reasoning theo phiên (không phải cache — hydrate lại từ local mỗi phiên mới); Claude = independent reviewer. Chat web KHÔNG bao giờ là system of record.
- `CONTEXT.md` = trạng thái hiện tại
- `DECISIONS.md` = quyết định + lý do (file này)
- `LOG.md` = sự kiện/evidence
- Transcript không nhét vào file.

## D2. Protocol relay — [WF:v1]
Envelope gửi cho AI, OUTPUT bắt buộc:
```
[WF:v1]
TASK: <task_id>   SEQ: <n>   ROLE: CHATGPT|CLAUDE
OBJECTIVE: <1 câu>
CONTEXT_REF: <file/section>
INPUT: <facts only>
ASK: <câu hỏi chính xác>
CONSTRAINTS: <tối đa 3>
OUTPUT:
  VERDICT: PASS|FAIL|UNCERTAIN
  DELTA: <thông tin mới>
  ACTION: <hành động kế tiếp>
  EVIDENCE: <path/test>
```
- **Hash/SEQ do opencode tính** — model KHÔNG tính SHA256 (Claude).
- Parser chịu lỗi + retry (model hay thêm lời dẫn/markdown bọc) + timeout + chunk detection.
- Relay vận chuyển envelope, KHÔNG shuttle transcript. **Gọi 1 model/lần — KHÔNG dùng ask_all song song (đốt quota).**

## D3. Escalation policy (Claude quota)
- Claude KHÔNG nằm trong mandatory loop. Mặc định ChatGPT decide/implement.
- Escalate khi: kiến trúc >1 module | bug chưa giải thích sau 1 vòng | risk/security/data-migration | ChatGPT UNCERTAIN | human yêu cầu.
- Escalation phải do **opencode thực thi bằng code**, ngưỡng cứng **tối đa 2 lượt Claude/task** — không tin model tự khai UNCERTAIN.
- **V1.5: Claude_calls = 0** (chứng minh ChatGPT-only trước; mở Claude escalation ở V2 sau PASS).

## D4. Git = control plane (không thay DECISIONS.md)
- Git trả lời what/when; DECISIONS.md trả lời why → giữ cả hai.
- Branch: `wf/<task-id>-<slug>`; **opencode = sole committer** (quyền, không phải niềm tin); main do human merge.
- Chống commit sai (cơ chế): pre-commit gate = test pass + allowlist file theo task + diff limit + secret scan; checkpoint commit trước/sau mutation; diff hiện human trước merge.
- Chống mất state (logout...): metadata + task/event log + commit hash nằm trong git; KHÔNG lưu cookie/token.
- Mọi quyết định chọn công cụ ghi kèm **ĐIỀU KIỆN BỎ** (vd: "adapter vỡ >2 lần/tuần → chuyển X").

## D5. Dry-run mode
Mock fixtures test parser/retry/chunking/git gate với 0 quota AI thật. Chạy thật chỉ sau dry-run deterministic pass. **Làm trước khi đụng DOM thật.**

## D6. Transport — tham khảo, không phát minh lại bánh xe (2026-10-07)
- **PROBE CodeLocal = PASS** (2026-10-07, test thật trên ChatGPT Free): plugin đã cài + OAuth connected (16/09/2026), **14 tools load được**: agent, edit (SHA-256), git (approval), terminal, browser (Playwright), computer, workspace (Project Brain remember/recall), context, verify, read, search, mcp, social, blog. Developer mode link tồn tại trên Free. Local runtime `codelocal@1.5.87` đã cài + workspace `ai-workflow` authorized + runtime chạy. → CodeLocal là executor chính (trạng thái: ACTIVE-EXECUTOR, giới hạn workspace D:\ai-workflow).
- **Playwright GIỮ NGUYÊN** — research 2026 không có gì tốt hơn cho hướng opencode→chat: browser-use = dao mổ chặt cây; Playwright MCP = cùng engine bọc MCP; mcp-web-llm cũng dùng Playwright+CDP. Phân công: **Playwright (opencode) = hướng đi ra** (relay envelope); **CodeLocal browser/terminal = hướng vào** (ChatGPT thực thi local).
- **KHÔNG fork nguyên khối** `mcp-web-llm` — đọc code làm reference (selector/CDP re-login/session recovery). Fork = backup, chỉ nếu: pin commit + audit license/deps + profile trình duyệt RIÊNG.
- **License CodeLocal VERIFIED: Apache-2.0** (LICENSE trên GitHub codelocal-cloud/codelocal); npm registry ghi UNLICENSED là lệch packaging (package repo trỏ 0xmarkhydra/codelocal) — ghi nhận, không chặn.
- browser-use (117k★) = cắt; desktop-commander = cắt (opencode đã có shell; Remote Desktop Commander plugin TỐN TẠI trên ChatGPT nhưng không cần).

## D7. Model routing (dùng Claude đúng lúc — quota free)
| Việc | Model |
|---|---|
| Context hub, quyết định thường ngày, code bulk | **ChatGPT** (quota rộng nhất) |
| Hỏi nhanh/tool-orchestration/long context | Gemini 3.5 Flash (MCP Atlas 83.6%, nhanh 4×) |
| Second opinion, góc độc lập | Grok 4.5 (rẻ) |
| Bug khó/architecture/final review | **Claude** Sonnet 5/5.5 (mạnh nhất nhưng quota ít nhất → chỉ escalate) |

## D8. V1.5 FINAL — checklist 48h (ChatGPT chốt, Claude KÝ, 2026-10-07)
1. **CodeLocal probe timebox 1 GIỜ** — duy nhất câu "Free có dùng được connector/MCP không?" → không thì STOP nhánh. Làm TRƯỚC.
2. Tạo branch `wf/*` + DECISIONS.md + checkpoint Git ban đầu.
3. Dry-run/mock pipeline: TASK → ASK → RESPONSE → PARSE → DECISION → LOG (0 quota).
4. Parser chịu lỗi + retry + timeout + chunk; hash do opencode tính.
5. Git gate: test + secret scan + allowlist + diff limit + checkpoint.
6. Adapter Playwright mỏng cho ChatGPT, 1 site/1 flow.
7. 1 task thật: opencode tự relay, zero copy thủ công.
8. Gate số: Claude_calls=0, ghi tổng token relay, không sửa main.
9. DECISIONS.md ghi lý do chọn + điều kiện bỏ công cụ.
10. PASS → mới mở Claude escalation ở V2.

**Điều kiện ký của Claude (hard stop):** nếu bước 6 chưa chạy ổn sau **8 giờ** → dừng, ghi DECISIONS.md, fallback **file inbox/outbox** (human dán tay); hash + parser vẫn dùng được, phần đã làm không mất.

**Gate cuối (đo bằng số):** 1 task thật, zero copy thủ công, Claude_calls ≤ 1 (V2), tổng token relay được ghi lại.

**CẮT khỏi V1.5:** browser-use, desktop-commander, CodeLocal execute (chỉ probe), autonomous loop, Gemini/Grok integration, session_state.json, ask_all, fork nguyên khối mcp-web-llm, nối Claude tuần đầu.

## D9. V2 test results + execution mode + dieu kien bo (2026-10-07)
- **V2-TC2 (T101) PASS:** ChatGPT doc git local qua CodeLocal plugin, HEAD 4566e88 khop doc lap. Huong READ doc lap end-to-end.
- **V2-TC3 (T102) PASS sau 6 SEQ:** write wf/t102-write-proof.txt='4566e88' + verify SHA-256 doc lap (c1b38adf...). Huong WRITE doc lap end-to-end.
- **Execution mode = quyen USER, chon 1 lan/workspace (user chon `live` = Live Project):** gateway tra CODELOCAL_EXECUTION_MODE_SELECTION_REQUIRED truoc mutation dau; default la `safe` (isolated checkout). Cai dat: workspace(action=execution, executionMode=live, workspaceKey=7d88aaa8...::ai-workflow-ac2fe45f3e). Layer nay KHAC approval-mode (agent/prompt) trong ~/.codelocal/approval-mode.json.
- **Dieu kien bo (schema mismatch gateway/plugin):** gateway nextAction yeu cau workspace(action=execution) nhung OpenAI manifest/plugin schema v15 khong co (Refresh khong doi gi, npm 1.5.87 da latest). Goi trim-enum van di qua. Neu mismatch lap >2 lan/tuan HOAC 1 lan mat du lieu -> pin phien ban plugin, hoac bo gateway nay (Claude goi y T103).
- **V2-TC1 (T103) PASS:** escalation opencode->Claude tron ven, parse 4/4, claude_calls=1. Gop y cua Claude (ghi nhan, chua harden): (a) opencode phai SO KHOP reply-side HASH, khong tin echo cua model; (b) VERDICT chi la khuyen nghi, PASS that do gate code quyet (implement hien tai da nhu vay); (c) HASH/SEQ do script tinh la nguon duy nhat.
- **Gate V2:** T100 relay PASS (zero copy), T101 read PASS, T102 write PASS, T103 claude_calls=1 <= 1. Con lai: harden reply-side HASH check + nang gate tu VERDICT-thanh-ky-len-thanh-so.

## D10. CodeLocal vo hieu hoa nut Think tren cung tab (2026-10-07)
- **Hien tuong:** tab1 (thread architect cu da ket noi CodeLocal plugin) - nut Think co mat nhung khong toggle duoc qua automation (click/key/React handler deu chay nhung aria-pressed luon false); tab0 (thread moi, sach CodeLocal) toggle binh thuong ngay lan click dau. Nghi ban: trang thai plugin/session tren tab do trien nut Think.
- **Giai quyet:** architect chuyen sang thread moi https://chatgpt.com/c/6ac64508-3590-83ec-805b-bfff5af66840 (T111 bootstrap PASS, Think ON). Thread cu 6ac5cc72 = archive. Context khong mat vi he thong record luon o local (CONTEXT.md, DECISIONS.md, LOG.md, wf/*).
- **Quy tac cho sau:** giu tab architect SACH CodeLocal; chi tab executor/riser gan plugin. Neu Think lai tat -> suspect CodeLocal truoc.
