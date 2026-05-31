$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$Artifacts = Join-Path $Root 'artifacts'
$ServerLog = Join-Path $Artifacts 'server.log'
$ServerErr = Join-Path $Artifacts 'server.err.log'
$ServerPid = Join-Path $Artifacts 'server.pid'
$TunnelPid = Join-Path $Artifacts 'cloudflared.pid'
$PublicPanitiaUrlFile = Join-Path $Artifacts 'public-panitia-url.txt'
$PublicStageUrlFile = Join-Path $Artifacts 'public-stage-url.txt'

New-Item -ItemType Directory -Force -Path $Artifacts | Out-Null

function Get-TunnelProcess {
  if (Test-Path $TunnelPid) {
    $existingTunnelId = [int]((Get-Content -Raw $TunnelPid).Trim())
    $process = Get-Process -Id $existingTunnelId -ErrorAction SilentlyContinue
    if ($process) {
      return $process
    }
  }

  return Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -ieq 'cloudflared.exe' -and
      ($_.CommandLine -like '*tunnel --url http://127.0.0.1:3000*' -or
       $_.CommandLine -like '*tunnel --url http://localhost:3000*')
    } |
    Select-Object -First 1
}

function Stop-ShowTimerServer {
  if (Test-Path $ServerPid) {
    $serverId = [int]((Get-Content -Raw $ServerPid).Trim())
    Stop-Process -Id $serverId -Force -ErrorAction SilentlyContinue
    Remove-Item -Force $ServerPid -ErrorAction SilentlyContinue
  }

  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -ieq 'node.exe' -and $_.CommandLine -like '*server.js*'
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Test-ShowTimerServer {
  try {
    $health = Invoke-RestMethod 'http://127.0.0.1:3000/api/health' -TimeoutSec 2
    return [bool]$health.ok
  } catch {
    return $false
  }
}

function Wait-ShowTimerServer {
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    if (Test-ShowTimerServer) {
      return
    }
    Start-Sleep -Milliseconds 700
  }

  throw 'ShowTimer server did not start within 30 seconds.'
}

$tunnel = Get-TunnelProcess
if (-not $tunnel) {
  throw 'Cloudflare tunnel sedang tidak aktif. Jalankan scripts\start-public-panitia.ps1 untuk mengaktifkan lagi; Quick Tunnel dapat membuat link baru.'
}

Stop-ShowTimerServer
Remove-Item -Force $ServerLog, $ServerErr -ErrorAction SilentlyContinue

$server = Start-Process -FilePath 'node' `
  -ArgumentList 'server.js' `
  -WorkingDirectory $Root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $ServerLog `
  -RedirectStandardError $ServerErr `
  -PassThru
$server.Id | Set-Content -NoNewline -Path $ServerPid

Wait-ShowTimerServer

if (Test-Path $PublicPanitiaUrlFile) {
  $panitiaUrl = Get-Content -Raw $PublicPanitiaUrlFile
  Write-Output "Server refreshed. Public Panitia URL unchanged: $panitiaUrl"
  if (Test-Path $PublicStageUrlFile) {
    $stageUrl = Get-Content -Raw $PublicStageUrlFile
    Write-Output "Public Stage URL unchanged: $stageUrl"
  }
} else {
  Write-Output 'Server refreshed. Public URL file was not found, but the existing tunnel was not restarted.'
}
