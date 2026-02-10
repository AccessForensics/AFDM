Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$RepoRoot = "C:\Users\mskir\Desktop\accessforensics-main"
Set-Location -Path $RepoRoot

function Section([string]$Title) {
  Write-Host ""
  Write-Host "========================================================" -ForegroundColor Cyan
  Write-Host $Title -ForegroundColor Cyan
  Write-Host "========================================================" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

function PassLine([string]$Message) {
  Write-Host "[PASS] $Message" -ForegroundColor Green
}

function Ensure-RepoClean([string]$Stage) {
  Write-Host "Checking repo cleanliness ($Stage)... " -NoNewline
  $s = @(git status --porcelain)
  if ($s.Count -gt 0) {
    Write-Host "DIRTY" -ForegroundColor Red
    $s | ForEach-Object { Write-Host $_ }
    Fail "Repo must be clean at start."
  }
  Write-Host "CLEAN" -ForegroundColor Green
}

function Ensure-NoTrackedMutations([string]$Stage) {
  $d = @((git diff --name-only) + (git diff --name-only --cached)) | Where-Object { $_ } | Sort-Object -Unique
  if ($d.Count -gt 0) {
    Write-Host "Tracked diffs detected ($Stage):" -ForegroundColor Red
    $d | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    Fail "Tracked files mutated at stage: $Stage."
  }
  PassLine "No tracked-file mutations at $Stage."
}

function Invoke-Native([string]$ExePath, [string[]]$Arguments) {
  & $ExePath @Arguments
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 0 }
  return [int]$code
}

Section "0) Preflight"
Ensure-RepoClean "Initial"
if (-not (Test-Path ".\package.json")) { Fail "package.json missing." }
if (-not (Test-Path ".\package-lock.json")) { Fail "package-lock.json missing." }

Section "1) Tools"
$nodeExe = (Get-Command node).Source
$npmExe  = (Get-Command npm).Source
$npxExe  = (Get-Command npx).Source
Write-Host "node: $nodeExe"
Write-Host "npm:  $npmExe"
Write-Host "npx:  $npxExe"

Section "2) npm ci"
$exit = Invoke-Native $npmExe @("ci","--no-fund","--no-audit")
if ($exit -ne 0) { Fail "npm ci failed ($exit)." }
Ensure-NoTrackedMutations "Post npm ci"

Section "3) playwright install"
$exit = Invoke-Native $npxExe @("playwright","install")
if ($exit -ne 0) { Fail "playwright install failed ($exit)." }
Ensure-NoTrackedMutations "Post playwright install"

Section "4) Run baseline engine (current main entry)"
$exit = Invoke-Native $nodeExe @(".\engine\ect.js")
if ($exit -ne 0) { Fail "engine ect.js failed ($exit)." }

Section "FINAL"
Write-Host "PASS (baseline installs + engine entry ran)" -ForegroundColor Green
exit 0
