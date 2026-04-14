param(
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 8000
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot "backend"
$outLog = Join-Path $repoRoot "backend_uvicorn.out.log"
$errLog = Join-Path $repoRoot "backend_uvicorn.err.log"

$listenerLine = netstat -ano | Select-String ":$Port\s+.*LISTENING" | Select-Object -First 1
if ($listenerLine) {
    $parts = ($listenerLine.ToString() -split "\s+") | Where-Object { $_ }
    $existingPid = [int]$parts[-1]
    $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue

    if ($existingProcess -and $existingProcess.ProcessName -like "python*") {
        Stop-Process -Id $existingPid -Force
        Start-Sleep -Seconds 1
    } else {
        throw "Port $Port is already in use by PID $existingPid. Free the port or stop that process before starting the backend."
    }
}

Remove-Item -ErrorAction SilentlyContinue $outLog, $errLog

$process = Start-Process python `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--host", $BindHost, "--port", $Port `
    -WorkingDirectory $backendDir `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru `
    -WindowStyle Hidden

Start-Sleep -Seconds 3

Write-Output "Started backend PID $($process.Id) on http://$BindHost`:$Port"
Write-Output "Logs: $outLog"
