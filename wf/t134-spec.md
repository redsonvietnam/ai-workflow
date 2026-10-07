# T134 SPEC — Trích chọn lọc ràng buộc PCM, neo hash nguồn (frozen)

Nguồn: architect SEQ1 (`wf/t134-raw.md`, HASH 5ea366acf45d174b). FROZEN qua `prereg freeze` — sửa sau freeze = PREREG_MISMATCH.

## 1) Nguồn neo hash

- Chỉ dùng commit **`ee20500ab4b4334b45e4c3fbbe6a38a75fb35597`** của `github.com/redsonvietnam/pcm` — **không bao giờ "main"**:
  - `docs/PCM.md`
  - `docs/PWF.md`
  - `docs/CONFORMANCE.md`
- Skill local: `C:\Users\Fesdinang\.config\opencode\skills\pcm-pwf\SKILL.md`
- Cả 4 nguồn ghi SHA-256 **tính lại** vào doc.

## 2) Format `wf/t134-pcm-constraints.md`

Mỗi ràng buộc 1 mục có bảng/các trường: `ID | source_file | pinned_commit/path | sha256 | excerpt (≤3 dòng nguyên văn) | mapping_T131 | mapping_T133`.

- ID ổn định (vd `PCM-7.3`, `PWF-6.3`…).
- **Chỉ giữ 4 nhóm ràng buộc T131/T133 thật sự cần**: canonical-state/stale-assumption, provenance/evidence, gate/no-self-approve, lifecycle/stop.
- Không audit 42 test PCM.

## 3) Test — `wf/test-t134.mjs`

1. Lấy đúng 4 nguồn pinned, **recompute mọi SHA-256** trong doc → khớp toàn bộ ⇒ PASS.
2. **Tamper test**: sửa 1 byte trong nguồn (bản copy tạm) ⇒ hash lệch ⇒ FAIL.
3. Không sửa pipeline, không đổi exit 0–8.

## Acceptance

- [ ] `node wf/test-t134.mjs` PASS (recompute khớp 4/4 nguồn).
- [ ] Tamper 1 byte → FAIL (giữ làm evidence).
- [ ] Mọi hash trong `wf/t134-pcm-constraints.md` recompute được từ nguồn pinned.
