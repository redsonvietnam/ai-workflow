# T102 — V2-TC3: Write thật qua CodeLocal (raw evidence)

Thread: <chat-url>
Workspace: <workspace-name> (<workspace-path>)
Mode đã chọn (user): Live Project (executionMode=live)

## SEQ=1 (attempt 1)
VERDICT: UNCERTAIN
Loi: CODELOCAL_EXECUTION_MODE_SELECTION_REQUIRED (write khong chay)

## SEQ=2 (retry sau workspace access mode=smart)
VERDICT: UNCERTAIN
DELTA: workspace(access, smart) khong chon execution mode; CodeLocal van yeu cau Safe Workspace|Live Project.

## SEQ=3 (probe workspace info/security)
VERDICT: UNCERTAIN
DELTA: info/security chi xac nhost-policy, policy-only, terminalChatApproval; khong expose action chon safe|live.
Audit log: tool=sandbox_info; truoc do tool=approval_mode {"mode":"smart"}.

## SEQ=4 — NGUYEN VAN gateway error (gốc rễ)
```json
{"choices":[{"description":"Work in an isolated checkout. Recommended/default.","label":"Safe Workspace","mode":"safe"},{"description":"Edit the active project checkout directly.","label":"Live Project","mode":"live"}],"code":"CODELOCAL_EXECUTION_MODE_SELECTION_REQUIRED","defaultMode":"safe","executionStarted":false,"message":"Ask the user once to choose Safe Workspace or Live Project before the first coding mutation in this workspace.","nextAction":"Call workspace(action=execution, executionMode=safe|live, workspaceKey=...) after the user chooses.","status":"selection_required","workspaceKey":"7d88aaa820804e0044412851ea20ecd4::DESKTOP-JVB3JGA::ai-workflow-ac2fe45f3e","workspaceName":"ai-workflow"}
```
Nguồn: CodeLocal gateway, surfaced qua OpenAI plugin.

## SEQ=5 (sau khi user chon Live)
VERDICT: FAIL
DELTA: Tool schema hien tai khong ho tro workspace(action=execution) hay executionMode (schema v15, 16 actions).

## SEQ=6 — cho goi trim schema (gateway nextAction la chi thi chinh xac)
VERDICT: PASS
DELTA: Da set live, write va readback thanh cong.
EVIDENCE: wf/t102-write-proof.txt; readback=4566e88; SHA-256=c1b38adf...

## Independent verify (opencode local, khong dua vao reply)
- File: D:\ai-workflow\wf\t102-write-proof.txt
- Noi dung: `4566e88`
- SHA-256: c1b38adf1d4fde5050171f932371f4bb3e62e23bbf34ea050f87a195297ebde6

## Findings
1. Execution mode = quyen user, chon 1 lan/workspace truoc mutation dau (Safe Workspace = isolated checkout, default; Live Project = checkout truc tiep).
2. Schema mismatch: gateway yeu cau workspace(action=execution) nhung OpenAI manifest/plugin schema v15 chua co (cache tu 16/09, npm 1.5.87 da latest, Refresh khong doi gi). Goi trim enum van di qua — enum validation chi la goi y model.
3. workspace(action=access, mode) enum chi co prompt|smart|full — khong phai execution mode.
4. approval-mode.json (agent/prompt) khac execution mode (safe/live) — 2 layer rieng.
