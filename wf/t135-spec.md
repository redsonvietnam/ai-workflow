# T135 SPEC — Discovery push repo D:\ai-workflow lên GitHub (frozen)

Nguồn: architect SEQ1 (wf/t135-raw.md). Trạng thái: FROZEN qua `prereg freeze` — hash do opencode tính, không model. Sửa sau freeze = PREREG_MISMATCH (exit 5); muốn đổi phải freeze lại với ghi chú.

## Scope

Discovery + plan đưa repo local D:\ai-workflow lên GitHub sạch sẽ, chuẩn git. **KHÔNG push trong task này** — push là human gate cuối.

## 6 mục discovery

1. **Audit clean:** `git status`, `git ls-files`, `git log --all --oneline`; tìm file junk/noise và secret pattern trong toàn history. History GIỮ NGUYÊN nếu không có secret (không squash/rewrite — mọi commit đã qua git-gate). Output: danh sách file lạ + kết luận lịch sử.
2. **.gitignore:** đề xuất rule cho `.playwright-mcp/`, temp/scratch opencode, `*.log`, cache/runtime artifacts — chỉ commit rule phù hợp repo. Output: nội dung `.gitignore` + commit đề xuất (qua git-gate).
3. **GitHub repo:** đề xuất tên `redsonvietnam/ai-workflow` + visibility **private** + lý do (tên khớp vai trò workflow/control-plane; private vì chứa state/log nội bộ).
4. **Push sequence:** chuỗi lệnh chính xác với account đang đăng nhập (`gh repo create ... --private` hoặc tạo repo rồi `git remote add origin ...` → kiểm tra remote/branch → `git push -u origin main`); **tuyệt đối không force**. Output: chuỗi PowerShell 5.1 copy-paste.
5. **Clone/continuity (máy khác):** `state.json` + `wf/` đã tracked → tiến trình tiếp tục được; file không bao giờ commit (secrets/log/temp/profile artifacts); trên máy mới: tạo nhánh `wf/*` → git-gate → ff-merge main; working tree "chưa commit" phải inspect/diff trước, KHÔNG tự xoá/clean. Output: quy trình clone→branch→gate→merge.
6. **Rủi ro + rollback:** human gate trước push; lỗi sau push → sửa bằng commit mới; không force-push.

## Acceptance (executor tự chấm trước khi nộp)

- [ ] Plan trả lời đủ 6 mục, lệnh copy-paste được trên PowerShell 5.1.
- [ ] Có checklist "trước khi push" (dry-run: `git status` sạch, `git ls-files` không file lạ, `git log --oneline` không có secret pattern).
- [ ] Không thực sự push trong discovery.
- [ ] Plan ghi vào `wf/t135-push-plan.md` (executor viết qua CodeLocal; CodeLocal fail 2 lần → fallback local).

## Facts nền (opencode verify, control plane)

- Không có remote; gh CLI đã đăng nhập `redsonvietnam` (scopes: gist, read:org, repo).
- Không có `.gitignore`; 118 file tracked; working tree sạch; history T100–T130 qua git-gate.
