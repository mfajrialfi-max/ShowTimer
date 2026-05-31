$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PublicPanitiaUrlFile = Join-Path $Root 'artifacts\public-panitia-url.txt'
$PublicStageUrlFile = Join-Path $Root 'artifacts\public-stage-url.txt'

if (Test-Path $PublicPanitiaUrlFile) {
  Write-Output "Panitia: $(Get-Content -Raw $PublicPanitiaUrlFile)"
} else {
  Write-Output 'Public Panitia URL belum tersedia.'
}

if (Test-Path $PublicStageUrlFile) {
  Write-Output "Stage: $(Get-Content -Raw $PublicStageUrlFile)"
} else {
  Write-Output 'Public Stage URL belum tersedia. Jalankan scripts\start-public-panitia.ps1 dulu.'
}
