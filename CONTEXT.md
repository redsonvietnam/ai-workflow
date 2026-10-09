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
- **Đang làm:** T150 (CREATED — cleanup state, spec wf/t150-spec.md).
- **Còn lại:** T145-B (seal LOG thật — chờ phê duyệt riêng).
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

## Workflow Phase 0–3 (T151–T157)
- Phase 0–3: được báo cáo hoàn thành; workflow được báo cáo đã merge vào `main` tại `5db2acf` (chưa xác minh Git độc lập trong task này).
- CodeLocal `apply_patch`: PASS 5/5 ca liên tiếp T151–T155, gồm tạo file, sửa file có sẵn, tạo file trong thư mục con và tên file Unicode; nội dung đều được read-back xác minh.
- Payload logging: **CHƯA PASS** — T152 chạy CLI exit 0 nhưng không ghi payload mới; cần gọi/xác minh `logPayload()` thực tế.
- Path traversal detection: **CHƯA XÁC MINH** — T156 bị chặn ở lớp kiểm tra an toàn trước khi nhận được kết quả từ CodeLocal; chưa chứng minh bộ xác thực đường dẫn tự từ chối.
- Gate: tiếp tục CodeLocal cho các thao tác file thông thường; không tuyên bố logging/path traversal đã hoạt động cho đến khi có bằng chứng trực tiếp.
