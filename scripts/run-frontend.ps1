$connection = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $connection) {
  $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
  if ($null -ne $process -and $process.ProcessName -eq "node") {
    Stop-Process -Id $process.Id -Force
  } else {
    $owner = if ($null -ne $process) { $process.ProcessName } else { $connection.OwningProcess }
    Write-Error ("Port 3001 is already in use by process " + $owner)
    exit 1
  }
}

Push-Location (Join-Path $PSScriptRoot "..\web")
try {
  $env:DEV_PROXY_SERVER = "http://localhost:5230"
  pnpm dev --force
} finally {
  Pop-Location
}
