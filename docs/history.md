# HISTORY — Workflow Đa AI Free-Tier

File này ghi lại lịch sử task/commit có căn cứ, tách từ CONTEXT.md để CONTEXT.md giữ ≤40 dòng vận hành.

**Phân loại bằng chứng:**
- **VERIFIED** — có commit hash và/hoặc test output xác nhận.
- **EXECUTOR-REPORTED** — báo cáo executor, chưa có bằng chứng tương ứng trong file này.

---

## 2026-10-07 — Pilot & V1.5

- Pilot "Đạo & AI": shuttle 2 vòng ChatGPT↔Claude — RELAY method OK. [EXECUTOR-REPORTED]
- V1.5 checklist 1-7 DONE. T101 read PASS (head 4566e88), T102 write PASS (sha c1b38adf), T103 escalation Claude PASS (claude_calls=1). [EXECUTOR-REPORTED từ LOG.md]
- T104/T105 harden pipeline: verifyReply, decideVerdict, byte accounting, 9 fixtures PASS (main b96e8c8). [EXECUTOR-REPORTED]
- T121 schema gate, T122 escalation budget, T123 hash-chain (main 1ca1284). [EXECUTOR-REPORTED]
- T125 prereg freeze, T126 verifier, T127 bundle (main 3798b16). [EXECUTOR-REPORTED]
- T135 push GitHub: PRIVATE, main, ls-remote == local 551cad1. [EXECUTOR-REPORTED]
- T131 stale-check: apply exit 8, test 4/4 PASS ×2 (main 51686ed). [EXECUTOR-REPORTED]
- T132 blind-first ChatGPT×Grok: cả 2 PREFER:d độc lập, PASS (6227010). [EXECUTOR-REPORTED]
- T133 dispute: 9/9 PASS ×2 (95cf152+134dd75). [EXECUTOR-REPORTED]
- T134 PCM constraints: 8/8 PASS ×2, bundle anchor 450ef9b4. [EXECUTOR-REPORTED]

## 2026-10-08 — BAMSO

- T137 fix flaky KioskQueuePeek: test-only patch, 4/4 PASS, 625 tests GREEN (fcdf562 pushed). [EXECUTOR-REPORTED]
- T138/T139 BAMSO: dọn dở trước khi user rời máy (eeb9f59+39dcb24+180cf4a pushed). [EXECUTOR-REPORTED]
- T140 skip fix: full e2e PASS, 625/625, lint 0, build OK (d1a2777, 48f7751, 16e7ad0 pushed). [EXECUTOR-REPORTED]

## 2026-10-08/09 — T145-T148 (branch wf/t143-secret-gate)

- **T145 SEAL LOG.md:** commit 69fd170 pushed. test-seal 12/12 ×2, verifychain ok:true 17/23. [EXECUTOR-REPORTED]
- **T146 executor inbox/outbox:** commit 73930dd pushed. plan-extract/plan-prepare, test-plan 12/12. [EXECUTOR-REPORTED]
- **T147 CI free-tier:** commit 6712e4f pushed. matrix ubuntu+windows, gitleaks, autocrlf=false. [EXECUTOR-REPORTED]
- **T148 scrub PII + re-anchor T134:** commit 87c8818 pushed. 15 files, anchor 3f8ebe64, test-t134 7/7. [EXECUTOR-REPORTED]

---

## Nguồn
- CONTEXT.md (rút gọn 2026-10-09)
- LOG.md (event log có hash-chain)
- git log trên nhánh wf/t143-secret-gate
