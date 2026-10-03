# Publishes new usage data. Task Scheduler runs this every 5 minutes (install-auto-update.ps1).
# Commits only data/ and only when the collector found new usage; logs changes and errors.
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot "auto-update.log"
function Log($msg) { Add-Content -Path $log -Value "$(Get-Date -Format s) $msg" }

$out = node scripts/collect.mjs 2>&1
if (-not $?) { Log "collect failed: $out"; exit 1 }

git add data
git diff --cached --quiet -- data
if (-not $?) {
  git commit -q -m "Auto-update usage data" -- data
  Log "committed: $out"
}

# Push whenever local commits are ahead of GitHub, which also retries after being offline.
$ahead = git rev-list --count "@{u}..HEAD" 2>$null
if ($ahead -and [int]$ahead -gt 0) {
  $pushOut = git push -q 2>&1
  if ($?) { Log "pushed $ahead commit(s)" } else { Log "push failed: $pushOut" }
}
