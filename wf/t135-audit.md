# T135 AUDIT — Task thật đầu tiên qua đủ 3 cơ chế (prereg / verifier / bundle)

Ngày: 2026-10-07. Task: discovery push `D:\ai-workflow` lên GitHub sạch, chuẩn git.
Điều kiện mở T131 (consensus T124/T130) = "1 task thật qua cả 3 cơ chế → audit" → đây là audit đó.

## Luồng đã chạy

| SEQ | Vai | Việc | Kết quả |
|---|---|---|---|
| 1 | Architect (tab0) | Spec + acceptance 6 mục | PASS (`wf/t135-raw.md`, HASH 80e8c18880a5b65d) |
| — | opencode | `prereg freeze wf/t135-spec.md` (134182c2…) TRƯỚC executor | PASS exit 0 |
| 2 | Executor (tab3, CodeLocal) | Discovery theo spec, ghi `wf/t135-push-plan.md` | **UNCERTAIN** — CodeLocal write blocked ×3 |
| — | opencode (fallback local) | Scan bổ sung + viết plan đủ 6 mục | Hoàn thành |
| — | Verifier độc lập | `standalone` → `gate` | Lần 1 FAIL (bug) → sửa → PASS exit 0 |
| — | opencode | `bundle T135` + `bundle-check` | PASS exit 0 |
| 3 | Architect (tab0) | Review plan + chấm 3 cơ chế | PASS (`wf/t135-rev-raw.md`, HASH b71ebc3664981a54) |

## Chấm từng cơ chế (theo review SEQ3 của architect)

1. **Prereg freeze — PASSED.** Spec hash `134182c2…` freeze trước executor; `prereg check` PASS trước và sau execution. Nếu executor/architect sửa spec sau freeze → exit 5 PREREG_MISMATCH. Trong run này không có ai sửa spec → cơ chế chặn đứng, chưa bị thách thức thực sự (chỉ PASS tương đối).
2. **Verifier độc lập — PASSED (với warning coverage).** Bug THẬT đầu tiên của T126 lộ ra khi chạy thật: `verify-standalone.mjs` parse `INPUT` từng dòng (`[^\n]*`) trong khi `makeEnvelope` render `INPUT` đa dòng → HASH_MISMATCH sai lệch. Đã sửa (INPUT/ASK đọc block đến `\nASK:`/`\nOUTPUT:`) + 3 test: envelope T135 PASS, regression T130 PASS, tamper đổi HASH → FAIL đúng. **Đây là warning về coverage (fixture trước đây chưa có INPUT đa dòng), không phải degraded mechanism** — đúng nhận định architect.
3. **Evidence bundle — PASSED (sau bổ sung).** Lần 1 PASS (9 file, anchor `3c3049cb…`) nhưng architect chấm PARTIAL vì thiếu verifychain cuối → đã chạy `verifychain` (checked 6, broken 0, exit 0), cập nhật checklist plan, viết audit này rồi **re-bundle** toàn bộ evidence (anchor cuối ghi ở mục LOG).
4. **Executor path — DEGRADED (không thuộc 3 cơ chế).** CodeLocal write bị chặn 3 lần → fallback local theo quy tắc ≥2 lần. Ghi nhận là điểm yếu của đường thực thi, cần nguyên nhân (permission/profile CodeLocal) trước khi giao việc lớn cho executor.

## Phát hiện cần xử lý (ngoài 3 cơ chế)

- **`.gitignore` không nằm trong allowlist git-gate** (`^(CONTEXT|DECISIONS|LOG)\.md$|^wf/`): architect đồng ý bổ sung `^\.gitignore$` và commit riêng trước khi push — thực hiện ở bước mở repo (human gate).
- **Typo `--remote=`** trong câu hỏi envelope SEQ3 (đã seal hash) — plan file đúng sẵn `--remote=origin`; không sửa plan mệnh lệnh, chỉ ghi nhận.
- **Checklist pre-push bổ sung 2 ô** theo review: HEAD đúng commit dự kiến; không untracked ngoài danh sách chủ ý.

## Trạng thái cuối

- Chưa push, chưa tạo remote, chưa commit — push là human gate (user duyệt tên `redsonvietnam/ai-workflow` + private).
- Prereg PASS / standalone PASS / gate exit 0 / bundle-check exit 0 / verifychain exit 0.
- Spec frozen giữ nguyên từ đầu đến cuối (sha256 `134182c29a273c10e679dd6055be53051f96b0e5044aab701c008fabad33f676`).
