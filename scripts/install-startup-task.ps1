$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$StartScript = Join-Path $ScriptDir 'start-public-panitia.ps1'
$TaskName = 'ShowTimer Public Tunnel'
$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""

try {
  $Action = New-ScheduledTaskAction -Execute $PowerShell -Argument $Arguments
  $Trigger = New-ScheduledTaskTrigger -AtLogOn
  $Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description 'Start ShowTimer and a public Cloudflare tunnel for Panitia at Windows logon.' `
    -Force | Out-Null

  Write-Output "Installed startup task: $TaskName"
} catch {
  $StartupDir = [Environment]::GetFolderPath('Startup')
  $StartupFile = Join-Path $StartupDir 'ShowTimer Public Tunnel.vbs'
  $Command = "`"$PowerShell`" $Arguments"
  $VbsCommand = $Command.Replace('"', '""')
  $Vbs = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "$VbsCommand", 0, False
"@

  Set-Content -Path $StartupFile -Value $Vbs -Encoding ASCII
  Write-Output "Task Scheduler was unavailable, installed startup file instead: $StartupFile"
}
