param(
  [Parameter(Mandatory=$true)][string]$Message,
  [int]$MaxLines = 1000
)
$ErrorActionPreference = 'Stop'

$branch = (git branch --show-current)
if ($branch -notmatch '^wf/') { throw "GATE FAIL: branch '$branch' phải bắt đầu bằng wf/" }

$files = @(git diff --cached --name-only)
if ($files.Count -eq 0) { throw 'GATE FAIL: nothing staged' }

$allowed = '^(CONTEXT|DECISIONS|LOG)\.md$|^\.git(ignore|attributes)$|^wf/'
foreach ($f in $files) {
  if ($f -notmatch $allowed) { throw "GATE FAIL: file không nằm trong allowlist: $f" }
}

$lines = 0
git diff --cached --numstat | ForEach-Object {
  $p = $_ -split "`t"
  $lines += [int]$p[0] + [int]$p[1]
}
if ($lines -gt $MaxLines) { throw "GATE FAIL: diff $lines dòng > limit $MaxLines" }

$secrets = git diff --cached | Select-String -Pattern '(?i)(api[_-]?key|secret|passwd|password|token|cookie)\s*[:=]\s*["''][^"'']{8,}'
if ($secrets) { throw "GATE FAIL: phát hiện secret khả nghi:`n$($secrets | Select-Object -First 3)" }

git -c user.name='opencode' -c user.email='opencode@local' commit -m $Message
Write-Host "GATE PASS: committed on $branch ($($files.Count) files, $lines lines)"
