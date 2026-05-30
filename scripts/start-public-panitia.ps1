param(
  [switch]$Restart
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$Artifacts = Join-Path $Root 'artifacts'
$ServerLog = Join-Path $Artifacts 'server.log'
$ServerErr = Join-Path $Artifacts 'server.err.log'
$ServerPid = Join-Path $Artifacts 'server.pid'
$TunnelLog = Join-Path $Artifacts 'cloudflared.log'
$TunnelErr = Join-Path $Artifacts 'cloudflared.err.log'
$TunnelPid = Join-Path $Artifacts 'cloudflared.pid'
$PublicUrlFile = Join-Path $Artifacts 'public-url.txt'
$PublicPanitiaUrlFile = Join-Path $Artifacts 'public-panitia-url.txt'

New-Item -ItemType Directory -Force -Path $Artifacts | Out-Null

function Stop-FromPidFile {
  param(
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    return
  }

  $processId = Get-Content -Raw $Path -ErrorAction SilentlyContinue
  $processId = [int]($processId.Trim())
  if ($processId -gt 0) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }

  Remove-Item -Force $Path -ErrorAction SilentlyContinue
}

function Stop-MatchingProcess {
  param(
    [string]$ProcessName,
    [string]$CommandContains
  )

  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -ieq $ProcessName -and
      $_.CommandLine -like "*$CommandContains*"
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

function Get-TunnelUrlFromLogs {
  $logText = ''
  if (Test-Path $TunnelLog) {
    $logText += Get-Content -Raw $TunnelLog
  }
  if (Test-Path $TunnelErr) {
    $logText += Get-Content -Raw $TunnelErr
  }

  $match = [regex]::Match($logText, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
  if ($match.Success) {
    return $match.Value
  }

  return $null
}

function Wait-TunnelUrl {
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    $url = Get-TunnelUrlFromLogs
    if ($url) {
      $url | Set-Content -NoNewline -Path $PublicUrlFile
      "$url/panitia/main" | Set-Content -NoNewline -Path $PublicPanitiaUrlFile
      return $url
    }
    Start-Sleep -Seconds 1
  }

  throw 'Cloudflare tunnel URL was not found within 60 seconds.'
}

if ($Restart) {
  Stop-FromPidFile $TunnelPid
  Stop-FromPidFile $ServerPid
  Stop-MatchingProcess -ProcessName 'cloudflared.exe' -CommandContains 'tunnel --url http://127.0.0.1:3000'
  Stop-MatchingProcess -ProcessName 'cloudflared.exe' -CommandContains 'tunnel --url http://localhost:3000'
  Stop-MatchingProcess -ProcessName 'node.exe' -CommandContains 'server.js'
  Start-Sleep -Seconds 1
}

if (-not (Test-ShowTimerServer)) {
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
}

$existingTunnel = $null
if (Test-Path $TunnelPid) {
  $existingTunnelId = [int]((Get-Content -Raw $TunnelPid).Trim())
  $existingTunnel = Get-Process -Id $existingTunnelId -ErrorAction SilentlyContinue
}

if (-not $existingTunnel) {
  Remove-Item -Force $TunnelLog, $TunnelErr, $PublicUrlFile, $PublicPanitiaUrlFile -ErrorAction SilentlyContinue
  $tunnel = Start-Process -FilePath 'cloudflared' `
    -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:3000') `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $TunnelLog `
    -RedirectStandardError $TunnelErr `
    -PassThru
  $tunnel.Id | Set-Content -NoNewline -Path $TunnelPid
}

$url = Wait-TunnelUrl
Write-Output "ShowTimer public Panitia URL: $url/panitia/main"
