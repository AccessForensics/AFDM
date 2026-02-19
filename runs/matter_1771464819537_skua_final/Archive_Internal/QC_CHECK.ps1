# ACCESS FORENSICS: QC VALIDATION BOOTSTRAP
# Purpose: Verify integrity of shipped ZIP without mutating evidence.

function Validate-Evidence {
    $zip = Get-ChildItem .. -Filter "*.zip" | Select-Object -First 1
    $sidecar = Get-ChildItem .. -Filter "*.sha256" | Select-Object -First 1
    
    if (!$zip -or !$sidecar) { Write-Error "Evidence pair missing."; return }
    
    $actualHash = (Get-FileHash -Algorithm SHA256 $zip.FullName).Hash.ToLower()
    $expectedHash = ((Get-Content $sidecar.FullName -Raw).Trim() -split "\s+")[0].ToLower()
    
    Write-Host "----------------------------------------------------"
    Write-Host "FILE:     $($zip.Name)"
    Write-Host "ACTUAL:   $actualHash"
    Write-Host "EXPECTED: $expectedHash"
    
    if ($actualHash -eq $expectedHash) {
        Write-Host "STATUS:   [PASS] INTEGRITY VERIFIED" -ForegroundColor Green
    } else {
        Write-Host "STATUS:   [FAIL] TAMPER ALERT" -ForegroundColor Red
    }
    Write-Host "----------------------------------------------------"
    Write-Host "QC NOTE: To inspect contents without mutation, use 'Expand-Archive' 
    to a temp directory. NEVER edit files inside the production ZIP."
}

Validate-Evidence
pause
