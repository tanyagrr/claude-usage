# Refresh data/usage.json from local Claude Code transcripts and publish it.
# Usage: powershell -ExecutionPolicy Bypass -File update.ps1
Set-Location $PSScriptRoot
node scripts/collect.mjs
if (-not $?) { exit 1 }
git add data/usage.json
git diff --cached --quiet
if ($?) { Write-Output "No changes."; exit 0 }
git commit -m "Update usage data $(Get-Date -Format yyyy-MM-dd)"
git push
