$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
node tools/verificar-integridad.cjs
