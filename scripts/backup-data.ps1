$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $projectRoot "data"
$backupDir = Join-Path $projectRoot "backups"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$database = Join-Path $dataDir "conecta-rhid.sqlite"
$target = Join-Path $backupDir "conecta-rhid-$timestamp.sqlite"

if (!(Test-Path -LiteralPath $database)) {
  throw "Banco de dados não encontrado em $database"
}

Copy-Item -LiteralPath $database -Destination $target -Force
Write-Output "Backup criado em $target"
