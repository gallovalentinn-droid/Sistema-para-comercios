# Inicia la vista de esta integración sin borrar datos ni reiniciar Docker.
$ErrorActionPreference='Stop'
$taskAppDir=Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$env:MC_LOCAL_CONFIG=Join-Path $env:USERPROFILE '.codex/.chatgpt-projects/g-p-6a8b192b818c8191ad9447dd21800d7c/github/Sistema-para-comercios/.worktrees/entorno-docker/entorno-local/generado/local.json'
$env:MC_WEB_PORT='55382'
$taskExisting=Get-NetTCPConnection -State Listen -LocalPort 55382 -ErrorAction SilentlyContinue
if($taskExisting){Write-Host 'La vista ya está abierta: http://127.0.0.1:55382/beta/';exit 0}
if(-not(Test-Path -LiteralPath $env:MC_LOCAL_CONFIG)){throw 'Falta iniciar el laboratorio Docker existente.'}
$taskPrivate=Join-Path $taskAppDir '.mercadopago-local'
New-Item -ItemType Directory -Force -Path $taskPrivate | Out-Null
$taskNode=(Get-Command node).Source
Start-Process -FilePath $taskNode -ArgumentList @(('"'+(Join-Path $PSScriptRoot 'server.cjs')+'"')) -WorkingDirectory $taskAppDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskPrivate 'servidor.log') -RedirectStandardError (Join-Path $taskPrivate 'servidor-error.log')
Write-Host 'Vista local: http://127.0.0.1:55382/beta/'
