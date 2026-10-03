[CmdletBinding()]
param(
  [string]$Destination = 'C:\Users\Usuario\Documents\Codex\2026-10-03\com\outputs\rpg-central'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $projectRoot 'app'
$destinationRoot = (Resolve-Path -LiteralPath $Destination).Path
$utf8 = [System.Text.UTF8Encoding]::new($false)

function Write-Utf8File([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, $utf8)
}

function Copy-FlatFiles([string]$SourceDirectory) {
  Get-ChildItem -LiteralPath $SourceDirectory -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $destinationRoot $_.Name) -Force
  }
}

Copy-Item -LiteralPath (Join-Path $appRoot 'index.html') -Destination (Join-Path $destinationRoot 'index.html') -Force

$mesaHtml = [System.IO.File]::ReadAllText((Join-Path $appRoot 'mesa.html'))
$mesaHtml = $mesaHtml.Replace('href="styles/', 'href="').Replace('src="scripts/', 'src="')
Write-Utf8File (Join-Path $destinationRoot 'mesa.html') $mesaHtml

Copy-FlatFiles (Join-Path $appRoot 'styles')
Copy-FlatFiles (Join-Path $appRoot 'scripts')

$diceScript = Join-Path $destinationRoot 'dice3d.js'
$diceContent = [System.IO.File]::ReadAllText($diceScript).Replace("../vendor/", "./vendor/")
Write-Utf8File $diceScript $diceContent

foreach ($directory in @('vendor', 'public')) {
  $source = Join-Path $appRoot $directory
  $target = Join-Path $destinationRoot $directory
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force
}

Write-Output "Publicado em $destinationRoot"
