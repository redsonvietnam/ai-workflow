# T151 — Phase 2: CodeLocal end-to-end test

## OBJECTIVE
Test CodeLocal apply_patch trên workspace ai-workflow với task thật nhỏ, rủi ro thấp.

## SCOPE
- Sửa 1 file: `wf/t151-result.md` (tạo mới)
- CodeLocal apply_patch: tạo file `wf/t151-result.md`
- Verification: file tồn tại, nội dung đúng

## ACCEPTANCE
1. CodeLocal apply_patch thành công (exit 0)
2. File `wf/t151-result.md` tồn tại
3. Nội dung chứa "T151: CodeLocal apply_patch HEALTHY"
4. verifychain: ok:true, sealed:true

## CONSTRAINTS
- KHÔNG sửa file khác
- KHÔNG commit/push
- Nếu CodeLocal DEGRADED → fallback local, ghi nhận DEGRADED
- Nếu CodeLocal HEALTHY → ghi nhận HEALTHY

## FIXTURE
```json
{
  "workspaceId": "ai-workflow-ac2fe45f3e",
  "patch": "--- /dev/null\n+++ b/wf/t151-result.md\n@@ -0,0 +1 @@\n+T151: CodeLocal apply_patch HEALTHY\n"
}
```

## VERIFICATION
```bash
node wf/pipeline.mjs verifychain
ls wf/t151-result.md
cat wf/t151-result.md
```
