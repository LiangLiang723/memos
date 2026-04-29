$connection = Get-NetTCPConnection -LocalPort 5230 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $connection) {
  $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
  if ($null -ne $process -and $process.ProcessName -eq "memos") {
    Stop-Process -Id $process.Id -Force
  } else {
    $owner = if ($null -ne $process) { $process.ProcessName } else { $connection.OwningProcess }
    Write-Error ("Port 5230 is already in use by process " + $owner)
    exit 1
  }
}

$dataDir = Join-Path $PSScriptRoot "..\.memos-dev"
if (-not (Test-Path $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir | Out-Null
}

& "D:\Programs\Scoop\User\apps\go\current\bin\go.exe" run ./cmd/memos --port 5230 --data $dataDir
