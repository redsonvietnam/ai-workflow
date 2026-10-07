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
- **KHÔNG fork nguyên khối** `mcp-web-llm` (dự án lạ, license chưa verify) — đọc code làm reference (selector/CDP re-login/session recovery), **tự viết adapter mỏng ~150 dòng** trên Playwright có sẵn của opencode. Fork = backup, chỉ nếu: pin commit hash + audit license/deps + profile trình duyệt RIÊNG (CDP chạm cookie).
- browser-use (117k★) = cắt (dao mổ chặt cây); Playwright MCP = nền chuẩn sẵn có; desktop-commander = cắt (opencode đã có shell; ChatGPT connector còn đòi Developer mode).
- CodeLocal: reference đã đọc — Project Brain (durable rules/decisions/experience), cloud chỉ giữ knowledge sanitize, npm có @playwright/cli, **npm registry ghi UNLICENSED vs Apache-2.0 GitHub → phải verify**. Trạng thái: PROBE.

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
