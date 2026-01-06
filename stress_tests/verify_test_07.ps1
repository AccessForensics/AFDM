# verify_test_07.ps1
# PASS condition: find the most recent run whose run_metadata.flow_id == "test_07_goal_text_forbidden"
# then assert status=error and error contains "goal_text"

$expectedFlowId = "test_07_goal_text_forbidden"

$runMetaFiles = Get-ChildItem .\runs -Directory | ForEach-Object {
  $p = Join-Path $_.FullName "Deliverable_Packet\03_Verification\run_metadata.json"
  if (Test-Path $p) { Get-Item $p }
} | Sort-Object LastWriteTime -Descending

$match = $null
foreach ($f in $runMetaFiles) {
  $m = Get-Content $f.FullName -Raw | ConvertFrom-Json
  if ($m.flow_id -eq $expectedFlowId) { $match = @{ meta=$m; path=$f.FullName }; break }
}

if ($null -eq $match) {
  Write-Host "`n? TEST 07 FAILED" -ForegroundColor Red
  Write-Host "No run_metadata.json found for flow_id=$expectedFlowId" -ForegroundColor Yellow
  exit 1
}

$meta = $match.meta

if ($meta.status -eq "error" -and $meta.error -match "goal_text") {
  Write-Host "`n? TEST 07 PASSED" -ForegroundColor Green
  Write-Host "Reason (from sealed metadata):" -ForegroundColor Cyan
  Write-Host $meta.error
  exit 0
}

Write-Host "`n? TEST 07 FAILED" -ForegroundColor Red
Write-Host "Unexpected sealed status or error:" -ForegroundColor Yellow
Write-Host ("status: " + $meta.status)
Write-Host ("error: " + $meta.error)
exit 1
