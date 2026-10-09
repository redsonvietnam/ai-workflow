# T134 — Ràng buộc PCM chọn lọc (neo hash nguồn)

Task: T134 · Spec frozen `f739504d7117377fe0b647ceec8c6995e1b7fa056683a98fdb3f8f8ddd98ca37` (architect SEQ1 HASH 5ea366acf45d174b).

Phạm vi: **CHỈ** trích ràng buộc mà T131 (stale-check/apply) và T133 (dispute/BLOCKED/DEAD_LETTER) thật sự cần — 4 nhóm. KHÔNG audit 42 test PCM (REJECT theo T130).

## 1. Nguồn neo (pinned — không dùng "main")

| # | Nguồn | Đường dẫn neo | SHA-256 (tính lại) |
|---|---|---|---|
| S1 | Skill local `pcm-pwf` | `<user-home>\.config\opencode\skills\pcm-pwf\SKILL.md` (2490 bytes) | `ff086e0c39ae26645e875b1460f626503e39b78ccb4bc4f97b7cf0679a1aa442` |
| S2 | pcm `docs/PCM.md` | commit `ee20500ab4b4334b45e4c3fbbe6a38a75fb35597` (11141 bytes) | `13a1043c14522f80ec9b73ff6e84eec3b96ecea35aa79f0fcd831f00374be01e` |
| S3 | pcm `docs/PWF.md` | commit `ee20500ab4b4334b45e4c3fbbe6a38a75fb35597` (7543 bytes) | `43223791867c5e798b2dabc05a0afc66cd22fa1c685b11193c895e21db0da7f4` |
| S4 | pcm `docs/CONFORMANCE.md` | commit `ee20500ab4b4334b45e4c3fbbe6a38a75fb35597` (3630 bytes) | `256b15fcc8e0e034fab34cd2e63385879b55b16abcca5ee90b97b849fcfe3fa7` |

```t134-sources
[
  {"id": "S1", "kind": "file", "path": "<user-home>\\.config\\opencode\\skills\\pcm-pwf\\SKILL.md", "sha256": "ff086e0c39ae26645e875b1460f626503e39b78ccb4bc4f97b7cf0679a1aa442"},
  {"id": "S2", "kind": "url", "url": "https://raw.githubusercontent.com/redsonvietnam/pcm/ee20500ab4b4334b45e4c3fbbe6a38a75fb35597/docs/PCM.md", "sha256": "13a1043c14522f80ec9b73ff6e84eec3b96ecea35aa79f0fcd831f00374be01e"},
  {"id": "S3", "kind": "url", "url": "https://raw.githubusercontent.com/redsonvietnam/pcm/ee20500ab4b4334b45e4c3fbbe6a38a75fb35597/docs/PWF.md", "sha256": "43223791867c5e798b2dabc05a0afc66cd22fa1c685b11193c895e21db0da7f4"},
  {"id": "S4", "kind": "url", "url": "https://raw.githubusercontent.com/redsonvietnam/pcm/ee20500ab4b4334b45e4c3fbbe6a38a75fb35597/docs/CONFORMANCE.md", "sha256": "256b15fcc8e0e034fab34cd2e63385879b55b16abcca5ee90b97b849fcfe3fa7"}
]
```

## 2. Ràng buộc chọn lọc

### Nhóm A — Canonical state / stale assumption

**A1 · `PCM-7.3`** — nguồn S2 · `docs/PCM.md@ee20500a` · `13a1043c…01e`
> Proposed changes are always provisional. They become canonical only through GATE approval. No amount of implementation, time passing, or actor effort converts proposed state to canonical state without explicit AUTHORITY action.

- **T131:** spec sau `prereg freeze` = proposed; apply **không** tự ghi khi hash lệch — chỉ GATE (git-gate + revalidate) đưa vào canonical.
- **T133:** trạng thái dispute/task chỉ đổi qua transition explicit, không "im lặng thành canonical".

**A2 · `PCM-7.4`** — nguồn S2 · `docs/PCM.md@ee20500a` · `13a1043c…01e`
> Working state, memory, or session context is never canonical. Canonical state exists only in persistent, authoritative storage that survives session boundaries.

- **T131:** lời AI trong chat (context) không đủ — verifier đọc file/git thật.
- **T133:** quyết định dựa `state.json`, không tin recollection của actor.

**A3 · `PWF-8.2`** — nguồn S3 · `docs/PWF.md@ee20500a` · `43223791…7f4`
> Drift detection and reconciliation mechanisms are adapter-specific. The semantic requirement is that stale claims can be invalidated by actual state.

- **T131:** claim "file còn nguyên" bị invalidate bằng recompute sha256 → `STALE_REJECT` exit 8.
- **T133:** claim state cũ bị invalidate bằng `loadState()` thật trước mỗi lệnh dispute.

**A4 · `SKILL-6`** — nguồn S1 · `SKILL.md` · `ff086e0c…442`
> Before claiming completion:
> - Verify canonical state is current
> - Verify no stale assumptions

- **T131:** git-gate revalidate HEAD/index ngay trước commit; apply revalidate trước khi rename.
- **T133:** verify task state hiện tại trước khi ghi `DEAD_LETTER`.

### Nhóm B — Provenance / evidence

**B1 · `PCM-12.1`** — nguồn S2 · `docs/PCM.md@ee20500a` · `13a1043c…01e`
> Evidence produced by the actor performing the work. Valid for progress tracking but may require independent verification for GATE decisions.

- **T131:** evidence do executor tự chốt = self-reported → cần standalone verifier (T126) trước gate.
- **T133:** dispute record do actor ghi → cần fixture kiểm chứng lại (test-dispute 9/9).

**B2 · `PCM-12.2`** — nguồn S2 · `docs/PCM.md@ee20500a` · `13a1043c…01e`
> Evidence produced by a different actor than the one performing the work. Stronger basis for GATE decisions.

- **T131:** architect review SEQ (AI khác) + opencode verify độc lập = evidence mạnh cho gate.
- **T133:** cross-check giữa model trả lời và fixture chạy thật.

**B3 · `SKILL-4`** — nguồn S1 · `SKILL.md` · `ff086e0c…442`
> For each action:
> - Record what was done
> - Record evidence provenance (self-reported, independent, automatic)

- **T131:** mọi pha ghi `LOG.md` + bundle SHA256SUMS (provenance tự khai trong event).
- **T133:** `disputes[task].classes` ghi rõ class từng vòng, round, status.

**B4 · `CONF-1`** — nguồn S4 · `docs/CONFORMANCE.md@ee20500a` · `256b15fc…fa7`
> This document defines how implementations or adapters demonstrate conformance to PCM and PWF. Conformance is based on observable behavior, not internal claims.

- **T131:** "đã fix stale" phải hiện diện bằng 4 fixture chạy PASS — không phải lời khẳng định.
- **T133:** "BLOCKED hoạt động" phải hiện diện bằng 9 fixture chạy PASS; T134: recompute hash bằng test chạy thật.

### Nhóm C — Gate / không tự phê

**C1 · `PCM-7.1`** — nguồn S2 · `docs/PCM.md@ee20500a` · `13a1043c…01e`
> An actor that executes work does not thereby obtain AUTHORITY over that work's canonical outcome.

- **T131:** executor code xong ≠ được merge — git-gate + human approve (D13) là authority.
- **T133:** task không tự mở lại sau `DEAD_LETTER` (transition rỗng); dispute không tự gỡ `BLOCKED`.

**C2 · `PCM-7.2`** — nguồn S2 · `docs/PCM.md@ee20500a` · `13a1043c…01e`
> Completing a task does not constitute approval of its outcome. AUTHORITY approval is a separate action from execution.

- **T131/T133:** tests PASS (COMPLETED) ≠ canonical — vẫn phải gate commit.
- Tương tự `PWF-4.2` (S3): "Task COMPLETED does NOT imply: GATE approval / Canonical-state promotion / Implementation approval."

**C3 · `SKILL-7`** — nguồn S1 · `SKILL.md` · `ff086e0c…442`
> When GATE is required:
> - Stop execution
> - Do not proceed without AUTHORITY action
> - Do not self-approve

- **T131:** git-gate fail → stop, không commit lén.
- **T133:** `BLOCKED`/`DEAD_LETTER` là terminal chờ human, không tự tiếp tục vòng 3.

**C4 · `SKILL-8`** — nguồn S1 · `SKILL.md` · `ff086e0c…442`
> Never:
> - Mark own work as canonical without external AUTHORITY
> - Assume authority from execution capability
> - Treat task completion as approval
> - Bypass Gate verification

- **T131/T133:** executor/CodeLocal không tự commit; opencode chỉ commit khi gate PASS.

### Nhóm D — Lifecycle / stop condition

**D1 · `PWF-4.2`** — nguồn S3 · `docs/PWF.md@ee20500a` · `43223791…7f4`
> Transitions between states must be explicit. State cannot change without a defined trigger.

- **T133:** `assertTransition` chặn transition sai; trigger = `round > 2` → `BLOCKED`/`DEAD_LETTER`.
- **T131:** apply = lock → revalidate → temp+rename, mỗi bước explicit (exit 8 khi trigger stale).

**D2 · `PWF-9`** — nguồn S3 · `docs/PWF.md@ee20500a` · `43223791…7f4`
> Work must stop when:
> - Authority revoked or expired
> - Success criteria unachievable

- **T133:** hết 2 vòng vẫn bất đồng → success criteria không đạt trong giới hạn → `BLOCKED` + `DEAD_LETTER`.
- **T131:** hash lệch → không đạt điều kiện apply → stop (exit 8).

**D3 · `SKILL-3`** — nguồn S1 · `SKILL.md` · `ff086e0c…442`
> Only execute tasks that are:
> - Explicitly authorized
> - Within authority scope
> - Not blocked by stop conditions

- **T133:** lệnh `round` trên dispute đã `BLOCKED` → bị từ chối exit 2 (stop condition).
- **T131:** apply chỉ chạy khi envelope/task còn trong scope allowlist `wf/` + CONTEXT/DECISIONS/LOG.md.

## 3. Cách verify lại (máy)

`node wf/test-t134.mjs` đọc khối `t134-sources` ở trên, tải lại 4 nguồn (file local + raw pinned commit), recompute SHA-256 → khớp 4/4 = **PASS**; sửa 1 byte nguồn (bản copy tạm) → hash lệch = tamper được phát hiện (FAIL đúng như dự kiến).
