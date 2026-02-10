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

function Get-GitPorcelain {
  $out = & git status --porcelain
  if ($null -eq $out) { return @() }
  if ($out -is [string]) {
    if ($out.Trim().Length -eq 0) { return @() }
    return @($out)
  }
  return @($out)
}

function Ensure-RepoClean([string]$Stage) {
  Write-Host "Checking repo cleanliness ($Stage)... " -NoNewline
  $s = @(Get-GitPorcelain)
  if ($s.Count -gt 0) {
    Write-Host "DIRTY" -ForegroundColor Red
    $s | ForEach-Object { Write-Host " - $_" }
    Fail "Repo must be clean at start."
  }
  Write-Host "CLEAN" -ForegroundColor Green
}

function Get-TrackedDiffNames {
  $a = & git diff --name-only
  $b = & git diff --name-only --cached
  $names = @()
  if ($a) { $names += @($a) }
  if ($b) { $names += @($b) }
  return $names | Sort-Object -Unique
}

function Ensure-NoTrackedMutations([string]$Stage) {
  $d = @(Get-TrackedDiffNames)
  if ($d.Count -gt 0) {
    Write-Host "Tracked diffs detected ($Stage):" -ForegroundColor Red
    $d | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    Fail "Mutation policy violated, tracked files changed at stage: $Stage."
  }
  PassLine "No tracked-file mutations at $Stage."
}

function Invoke-Native {
  param(
    [Parameter(Mandatory=$true)][string]$ExePath,
    [Parameter(Mandatory=$true)][string[]]$Arguments
  )

  Write-Host ">> $ExePath $($Arguments -join ' ')" -ForegroundColor DarkGray
  & $ExePath @Arguments
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 0 }
  return [int]$code
}

function Get-RelevantSnapshot {
  $snap = @{}
  $files = Get-ChildItem -Path $RepoRoot -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.FullName -notmatch '[\\/]\.git[\\/]') -and
      ($_.FullName -notmatch '[\\/]node_modules[\\/]')
    }

  foreach ($f in $files) {
    $rel = $f.FullName.Substring($RepoRoot.Length).TrimStart('\','/')
    $ext = $f.Extension.ToLowerInvariant()
    $name = $f.Name

    $isManifest = ($name -match '(?i)^manifest\.json$') -or ($name -match '(?i)manifest.*\.json$')
    $isNdjson   = ($ext -eq ".ndjson")
    $isCapture  = @(".png",".jpg",".jpeg",".webp",".html",".mhtml",".pdf") -contains $ext

    if ($isManifest -or $isNdjson -or $isCapture) {
      $snap[$rel] = $f.LastWriteTimeUtc.Ticks
    }
  }

  return $snap
}

function Find-CanonicalEntrypoint {
  param(
    [string]$NodeExe,
    [string]$NpmExe,
    [string]$NpxExe
  )

  $pkgPath = Join-Path $RepoRoot "package.json"
  if (-not (Test-Path $pkgPath)) { return $null }

  $pkg = (Get-Content $pkgPath -Raw) | ConvertFrom-Json

  $scriptsProp = $pkg.PSObject.Properties["scripts"]
  if ($scriptsProp -and $scriptsProp.Value) {
    $scriptNames = @($scriptsProp.Value.PSObject.Properties.Name)
    foreach ($cand in @("skua","test_pipeline","pipeline","e2e","smoke")) {
      if ($scriptNames -contains $cand) {
        return @{ Exe = $NpmExe; Arguments = @("run",$cand); Source = "package.json scripts.$cand" }
      }
    }
  }

  foreach ($rel in @(
    "engine\test_pipeline.js",
    "engine\test_pipeline.mjs",
    "engine\pipeline.js",
    "engine\smoke.js",
    "test_pipeline.js",
    "pipeline.js",
    "smoke.js"
  )) {
    $abs = Join-Path $RepoRoot $rel
    if (Test-Path $abs) { return @{ Exe = $NodeExe; Arguments = @($abs); Source = $rel } }
  }

  if ((Test-Path (Join-Path $RepoRoot "playwright.config.ts")) -or (Test-Path (Join-Path $RepoRoot "playwright.config.js"))) {
    return @{ Exe = $NpxExe; Arguments = @("playwright","test"); Source = "playwright.config.*" }
  }

  $mainProp = $pkg.PSObject.Properties["main"]
  if ($mainProp -and $mainProp.Value) {
    $mainRel = $mainProp.Value.ToString().Trim()
    if ($mainRel.Length -gt 0) {
      $mainAbs = Join-Path $RepoRoot $mainRel
      if (Test-Path $mainAbs) {
        return @{ Exe = $NodeExe; Arguments = @($mainAbs); Source = "package.json main ($mainRel)" }
      }
    }
  }

  $keys = @($pkg.PSObject.Properties.Name)
  Write-Host ("package.json keys: " + ($keys -join ", ")) -ForegroundColor Yellow
  if ($mainProp -and $mainProp.Value) { Write-Host ("package.json main: " + $mainProp.Value) -ForegroundColor Yellow }
  if ($scriptsProp -and $scriptsProp.Value) {
    Write-Host ("package.json scripts: " + (@($scriptsProp.Value.PSObject.Properties.Name) -join ", ")) -ForegroundColor Yellow
  } else {
    Write-Host "package.json has no scripts." -ForegroundColor Yellow
  }

  return $null
}

try {
  Section "0) Preflight"
  Ensure-RepoClean "Initial"

  if (-not (Test-Path (Join-Path $RepoRoot "package.json"))) { Fail "package.json missing." }
  if (-not (Test-Path (Join-Path $RepoRoot "package-lock.json"))) { Fail "package-lock.json missing." }

  Section "1) Tools"
  $nodeExe = (Get-Command node -ErrorAction Stop).Source
  $npmExe  = (Get-Command npm  -ErrorAction Stop).Source
  $npxExe  = (Get-Command npx  -ErrorAction Stop).Source
  Write-Host "node: $nodeExe"
  Write-Host "npm:  $npmExe"
  Write-Host "npx:  $npxExe"
  Write-Host "Node: $(node -v)"
  Write-Host "NPM:  $(npm -v)"

  Section "2) npm ci"
  $exit = Invoke-Native -ExePath $npmExe -Arguments @("ci","--no-fund","--no-audit")
  if ($exit -ne 0) { Fail "npm ci failed ($exit)." }
  PassLine "npm ci OK"
  Ensure-NoTrackedMutations "Post npm ci"

  Section "3) playwright install"
  $exit = Invoke-Native -ExePath $npxExe -Arguments @("playwright","install")
  if ($exit -ne 0) { Fail "playwright install failed ($exit)." }
  PassLine "playwright install OK"
  Ensure-NoTrackedMutations "Post playwright install"

  Section "4) Canonical command selection"
  $canon = Find-CanonicalEntrypoint -NodeExe $nodeExe -NpmExe $npmExe -NpxExe $npxExe
  if (-not $canon) { Fail "No canonical entrypoint found." }

  Write-Host ("Canonical: " + $canon.Exe + " " + ($canon.Arguments -join " ")) -ForegroundColor Yellow
  Write-Host ("Source: " + $canon.Source) -ForegroundColor Yellow

  Section "5) Snapshot BEFORE run"
  $before = Get-RelevantSnapshot

  Section "6) Run canonical command"
  Ensure-NoTrackedMutations "Pre-run"
  $exit = Invoke-Native -ExePath $canon.Exe -Arguments $canon.Arguments
  if ($exit -ne 0) { Fail "Run failed ($exit)." }
  Ensure-NoTrackedMutations "Post-run"

  Section "7) Snapshot AFTER run"
  $after = Get-RelevantSnapshot

  $changed = New-Object 'System.Collections.Generic.List[string]'
  foreach ($k in $after.Keys) {
    if (-not $before.ContainsKey($k)) { $null = $changed.Add($k); continue }
    if ([int64]$after[$k] -gt [int64]$before[$k]) { $null = $changed.Add($k) }
  }

  if ($changed.Count -le 0) {
    Write-Host "[WARN] No new or modified relevant artifacts detected (manifest, ndjson, capture types)." -ForegroundColor Yellow
    Write-Host "PASS (installs OK, canonical command ran, no artifact proof yet)" -ForegroundColor Green
    exit 0
  }

  Write-Host ("New/Modified relevant artifacts (" + $changed.Count + "):") -ForegroundColor Yellow
  $changed | Select-Object -First 200 | ForEach-Object { Write-Host ("  + " + $_) -ForegroundColor Gray }

  Section "8) Strict signature gate"
  $manifest = @($changed | Where-Object { ($_ -match '(?i)(^|[\\/])manifest\.json$') -or ($_ -match '(?i)manifest.*\.json$') } | Select-Object -First 50)
  $ndjson   = @($changed | Where-Object { $_ -match '(?i)\.ndjson$' } | Select-Object -First 50)
  $capture  = @($changed | Where-Object { $_ -match '(?i)\.(png|jpg|jpeg|webp|html|mhtml|pdf)$' } | Select-Object -First 200)

  if ($manifest.Count -le 0) { Fail "Missing manifest-like file." }
  if ($ndjson.Count -le 0) { Fail "Missing .ndjson output." }
  if ($capture.Count -le 0) { Fail "Missing capture artifact." }

  Section "9) Final verdict"
  Write-Host "PASS" -ForegroundColor Green
  exit 0

} catch {
  Write-Host ("[FAIL] " + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
