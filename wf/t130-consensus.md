# T130 — Consensus: đánh giá 3 repo upstream (workflow-lab, ai-coding-core, pcm)

Ngày: 2026-10-07. Quy trình: opencode đọc repo qua raw.githubusercontent + GitHub API (GitHub MCP không có trong session, KHÔNG clone) → ChatGPT-architect PASS (SEQ1) → Claude REVISE (SEQ2, lượt Claude duy nhất của T130) → Grok PASS + 2 bổ sung (SEQ3) → architect chốt PASS (SEQ4).

## Nguồn đọc

1. **workflow-lab** (1 commit, 2026-10-03): `AI_COLLABORATION_PROTOCOL_V1.md` (12 mục) + `DECISIONS/decisions.yaml` + `REVIEWS/{chatgpt,claude}/{pass1,pass2}.md`. Lõi: phân vai Human/Architect/Critic/Executor/Verifier; state FRAME→PREREG→EXECUTE→VERIFY→REVIEW→DECIDE→{CLOSE|AMEND}; blind-first (2 AI chấm độc lập trước khi trao đổi); DELTA-only; disagreement→experiment (factual/spec/interpretation/preference, max 2 vòng → BLOCKED); 3 human gate; stop rules; "LLM không viết report".
2. **ai-coding-core** (1 commit, 2026-09-22): TypeScript event-sourced task engine (TASK→EVENT, lease, proposal/gate, sqlite, tests) + `docs/orchestrator-adapter-contract.md` LOCKED v1.1: expected_state {head_sha + worktree_fingerprint + changed_paths} revalidate trước APPLY, stale → reject, không auto-rebase; probe ACP: opencode permission deny/ask KHÔNG enforce (auto-approve).
3. **pcm** (28 commits, 14 nhánh, 2026-09): PCM/PWF canonical (PCM-GATE-01): WORKSTREAM/TASK/HANDOFF/GATE, 6 invariants, 42 conformance test, "COMPLETED ≠ approval"; CLOSEOUT: "READY FOR EXTERNAL VALIDATION" (chưa chạy project thật ngoài chính nó); skill pcm-pwf đã cài sẵn trong opencode.

## Task bắt buộc (thứ tự T131 → T134)

| Task | Nội dung | Điều kiện / acceptance |
|------|----------|------------------------|
| T131 | Stale-check trước APPLY (revalidate sha256 các file đụng tới) | (i) tái hiện được lỗi stale-hash của CodeLocal trong test; (ii) revalidate NGUYÊN TỬ với apply (file-lock/atomic rename — Grok bổ sung race window). Acceptance: sửa file giữa check và apply → apply bị từ chối. Ưu tiên #1, bổ trợ T125/T127. |
| T132 | Blind-first exchange cho dispute | CHỈ cặp ChatGPT+Grok (Claude không nằm trong cặp — phá T122 budget). Acceptance: thu đủ 2 reply độc lập trước khi trao đổi cross-critique. |
| T133 | Phân loại disagreement + BLOCKED | factual/spec/interpretation/preference; max 2 vòng → BLOCKED/DEAD_LETTER (trùng max_attempts, gần không tốn thêm). Acceptance: dispute quá 2 vòng ra DEAD_LETTER/BLOCKED. |
| T134 | Trích chọn lọc ràng buộc PCM | Chỉ ràng buộc cần cho T131/T133, BẮT BUỘC neo hash nguồn (Grok: không audit 42 test trọn). Acceptance: hash nguồn khớp khi recompute. |

Roadmap: T125→T127 (xong) → **1 task thật qua cả 3 cơ chế → audit** → T131 → T132 → T133 → T134 → mới đánh giá mở T128/T129.

## D13 (1 quyết định)

Không coi quyền deny/ask của opencode qua ACP là firewall; enforcement phải nằm ở git branch `wf/*` + pre-commit hook.

## REJECT chốt

PCM ceremony đầy đủ (WORKSTREAM/authority gate/change control), worker-scope worktree isolation, MutateProposal full schema, audit 42 test trọn, blind-first có Claude trong cặp.

## Giữ nguyên

T128/T129 hoãn theo điều kiện D12; lease reference từ `ai-coding-core` (`src/domain/lease.ts`, `lease-proposal.test.ts`) gộp vào điều kiện mở T129 (không task mới).

## Rủi ro đã đưa vào điều kiện

- Race revalidate/apply nếu không atomic (→ điều kiện T131).
- T134 sót ràng buộc PCM nếu không neo hash (→ điều kiện T134).

## Evidence

wf/t130-envelope.txt (HASH 53ad9bafa62f171c SEQ 1), wf/t130-envelope-claude.txt (1225ca2e953e31cb SEQ 2), wf/t130-envelope-grok.txt (c909fbd4ea8deaff SEQ 3), wf/t130-envelope-round3.txt (61da3ffcfe7c247c SEQ 4); wf/t130-raw.md, wf/t130-claude-raw.md, wf/t130-grok-raw.md, wf/t130-round3-raw.md; DECISIONS.md D11–D12.
