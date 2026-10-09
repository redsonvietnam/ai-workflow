# CONTEXT — Workflow Đa AI Free-Tier

Cập nhật: 2026-10-09 (T149)

## Đội
- **opencode** (local Windows): control plane — router, executor, hash/SEQ, escalation gate, ghi state.
- **ChatGPT** (free, quota rộng): primary reasoning/execution.
- **Claude** (free, quota ít): conditional reviewer CHỈ khi escalate.
- **Human**: scope + gate + duyệt.

## Kiến trúc V1 (đã chốt — xem DECISIONS.md)
```
HUMAN → scope/gate
  └─ OpenCode CONTROL PLANE
       ├─ STATE: CONTEXT.md / DECISIONS.md / LOG.md
       ├─ GIT: branch + diff + rollback (mỗi task 1 branch)
       ├─ RELAY: WF:v1 structured envelope
       ├─ CHATGPT: primary reasoning/execution
       ├─ CLAUDE: conditional reviewer only
       └─ CODELOCAL: mutation boundary — READ (T101) + WRITE (T102) PROOF end-to-end
```

## Trạng thái hiện tại
- Branch: `wf/t143-secret-gate`. HEAD = origin = `87c8818` (T148).
- T145 SEAL LOG, T146 executor inbox/outbox, T147 CI, T148 scrub PII: **đã push**.
- **Đang làm:** T149 (rút gọn CONTEXT, docs/history.md, D14 [PROPOSED]).
- **Còn lại:** T150 (CREATED, chưa có spec), T145-B (seal LOG thật — chờ phê duyệt riêng).
- CodeLocal: DEGRADED 4 lần → fallback local. Consensus T132: ưu tiên sửa executor path.
- Lịch sử chi tiết: `docs/history.md`.

## Liên hệ nhanh
- **ChatGPT-architect** (context hub, Think ON): <chat-url>
- **Claude** (escalation thật sự cần): <chat-url>
- Gemini: dự phòng quota. Grok: <chat-url>.

## Phân vai (user chỉ đạo)
- **opencode**: điều phối/thuyển thư — sinh envelope, hash/SEQ, verify độc lập, gate commit. **Sole committer.**
- **ChatGPT-architect**: thiết kế spec (Think ON).
- **ChatGPT-executor**: nhận spec, code, self-review.
- **Claude**: chỉ khi architect UNCERTAIN/block thật sự (tiết kiệm quota).
