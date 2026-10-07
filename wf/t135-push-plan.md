# T135 — Push-plan: đưa D:\ai-workflow lên GitHub sạch, chuẩn git

Nguồn: spec frozen `wf/t135-spec.md` (sha256 `134182c29a273c10e679dd6055be53051f96b0e5044aab701c008fabad33f676`) + discovery của executor SEQ2 (`wf/t135-exec-raw.md`) + kiểm chứng bổ sung của opencode (fallback local do CodeLocal write fail 3 lần).
Trạng thái: **CHƯA PUSH** — push là human gate cuối (user duyệt tên repo/visibility trước).

## 1) Audit "clean"

- `git status`: working tree **dirty/untracked = 7 entry**, toàn bộ là artifact T135 mới của phiên này (`wf/t135-*.md/.txt/.json`, `wf/prereg-manifest.json`, `wf/state.json` modified) — sẽ được commit sau khi plan này chốt.
- `git ls-files` (118 file): **không có file junk nào bị track** — không có `.playwright-mcp/`, `*.log`, `*.tmp`, `node_modules`, scratch.
- Secret trong history:
  - Quét high-signal (`ghp_…`, `github_pat_…`, `AKIA…`, `sk-…`): **0 hit** trong toàn bộ 29 commit.
  - Quét từ khóa (`password|secret|api_key`): hit ở 6 commit nhưng **chỉ là văn bản docs/code** (consensus, quyết định, fixture pipeline) — không có credential thật.
- Kết luận lịch sử: **giữ nguyên 29 commit** (mỗi commit 1 logic, đã qua git-gate) — không squash/rewrite. Threshold: chỉ rewrite nếu phát hiện secret thật → không phát hiện.

## 2) .gitignore (đề xuất, chưa commit)

```gitignore
# opencode/Playwright local artifacts
.playwright-mcp/
*.log
.scratch/
node_modules/
```

- **Phát hiện quan trọng:** `.gitignore` ở root **CHƯA nằm trong allowlist git-gate** (`^(CONTEXT|DECISIONS|LOG)\.md$|^wf/`) → để commit được cần bổ sung `^\.gitignore$` vào `wf/git-gate.ps1` (1 dòng, sửa qua gate tương ứng) — hoặc chấp nhận commit `.gitignore` bằng commit tay riêng biệt có ghi chú trong LOG. Đề xuất: thêm vào allowlist, commit cùng lượt với plan này.

## 3) GitHub repo

- Tên: **`redsonvietnam/ai-workflow`** — khớp ngữ cảnh workflow/control-plane.
- Visibility: **private** — repo chứa `state.json`, envelope/consensus/log nội bộ, không dành cho công khai.
- Account đã đăng nhập `gh`: `redsonvietnam` (scopes `gist, read:org, repo`; protocol https).

## 4) Push sequence (PowerShell 5.1, copy-paste) — CHƯA CHẠY

```powershell
# Từ D:\ai-workflow, nhánh main, tree sạch sau khi commit plan này:
gh repo create ai-workflow --private --source=. --remote=origin --push
git remote -v                     # xác nhận origin = https://github.com/redsonvietnam/ai-workflow.git
git ls-remote origin main         # xác nhận main đã lên (so sánh aa36b45... hoặc commit mới hơn)
```

- Lệnh `gh repo create ... --source=. --push` tạo repo + set remote + push **một lần** (không cần `git remote add` tay).
- Alternative nếu đã có remote: `git remote add origin https://github.com/redsonvietnam/ai-workflow.git; git push -u origin main`.
- **Tuyệt đối không force push** (không `--force`, không `-f`).

## 5) Quy ước sau khi clone máy khác

```powershell
git clone https://github.com/redsonvietnam/ai-workflow.git
cd ai-workflow
# kiểm tra state: 3 file md + wf/ phải có, git log khớp origin
node wf/pipeline.mjs verifychain   # xác nhận hash-chain còn nguyên vẹn sau clone
```

- `state.json` + `wf/` **đã tracked** → pipeline tiếp tục đúng SEQ/task; không cần khôi phục gì thêm.
- **Không bao giờ commit:** credential (`.env`, key, token), `*.log`, `.playwright-mcp/`, file profile tạm — đã cover bằng `.gitignore` đề xuất ở mục 2.
- Trên máy mới: tạo nhánh `wf/<task>` → làm việc → `powershell -File wf/git-gate.ps1` (allowlist tự chặn file ngoài danh sách, scan secret, ff-merge `main`, xóa nhánh) — như nhánh `wf/*` trên máy này.
- Working tree "chưa commit" sau khi user chuyển máy (3 file md + wf/ chưa commit mentioned): **inspect trước** — `git status` → `git diff` từng file → quyết định commit (qua gate) hoặc stash; **không bao giờ `git clean -fd` / `git checkout .` mù quáng**.
- Yêu cầu máy mới: `git` + `node` ≥18 + (tùy) `gh` CLI đã đăng nhập để tiếp tục thao tác GitHub.

## 6) Rủi ro + rollback

| Rủi ro | Xử lý |
|---|---|
| Push nhầm visibility | Chỉnh sau: `gh repo edit redsonvietnam/ai-workflow --visibility private` — không cần force. |
| Lỗi sau khi push | Sửa bằng **commit mới** → push lại; không rewrite history đã push. |
| Repo tạo sai tên | `gh repo delete redsonvietnam/ai-workflow` (chỉ repo private rỗng/sai, cần xác nhận) rồi tạo lại. |
| Secret lọt (phát hiện muộn) | Rotate credential NGAY + liên hệ GitHub support xóa history; pre-push checklist là chốt chặn chính. |
| Chưa có backup | Push chính là backup đầu tiên; trước push, có thể `git bundle create ../ai-workflow.bundle --all` làm backup local. |

**Không force push trong mọi trường hợp.**

## Checklist "trước khi push" (dry-run) — tự chấm trước human gate

- [x] `git status` — chỉ còn artifact T135 dự kiến commit; sau commit phải **sạch (0 entry)**.
- [x] `git ls-files` — 118 file, không file lạ/junk.
- [x] Secret scan high-signal trong history — **0 hit**; word-scan chỉ là docs.
- [x] Nhánh hiện tại = `main`, HEAD = `aa36b45` (hoặc commit mới hơn sau khi commit plan).
- [x] Spec frozen còn nguyên vẹn — `node wf/pipeline.mjs prereg check` → PASS.
- [ ] Xác nhận HEAD đúng commit dự kiến (so `git rev-parse HEAD` với hash ghi trong LOG/CONTEXT trước khi push).
- [ ] Không còn untracked ngoài danh sách chủ ý (`git status --porcelain` chỉ chứa artifact T135/`.gitignore` dự kiến commit).
- [x] Chạy `node wf/pipeline.mjs verifychain` → exit 0 (đã chạy tại audit: checked 6, broken 0).
- [ ] Human gate: user xác nhận tên `redsonvietnam/ai-workflow` + **private** → mới chạy mục 4.
- [ ] Sau push: `git ls-remote origin main` khớp HEAD local.
