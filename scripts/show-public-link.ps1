$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PublicPanitiaUrlFile = Join-Path $Root 'artifacts\public-panitia-url.txt'

if (Test-Path $PublicPanitiaUrlFile) {
  Get-Content -Raw $PublicPanitiaUrlFile
} else {
  Write-Output 'Public Panitia URL belum tersedia. Jalankan scripts\start-public-panitia.ps1 dulu.'
}
