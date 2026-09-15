# Verificación reproducible del paquete F5 para Windows PowerShell.
#
# Uso:  powershell -ExecutionPolicy Bypass -File .\verificar.ps1
#
# Paridad exacta con verificar.sh y mismas garantías de fallo cerrado:
# manifiesto truncado, archivo no listado, suite borrada o conteo de pruebas
# distinto del esperado abortan con error. La versión anterior salía con éxito
# e imprimía "53/53" aunque faltara una suite entera.

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$Manifiesto       = 'SHA256SUMS-F5.txt'
$PruebasEsperadas = 62   # gate: 53 rev7 + 4 config/proyección + 3 IP + 2 identidad

Write-Host '== 1. Integridad de artefactos =='

$fallos    = [System.Collections.Generic.List[string]]::new()
$listados  = [System.Collections.Generic.List[string]]::new()

foreach ($linea in Get-Content -LiteralPath $Manifiesto) {
  if ([string]::IsNullOrWhiteSpace($linea)) { continue }
  if ($linea -notmatch '^([0-9a-f]{64})  (.+)$') {
    $fallos.Add("Línea inválida: $linea"); continue
  }
  $esperado = $Matches[1]
  $relativa = $Matches[2]
  $ruta     = $relativa.Replace('/', [IO.Path]::DirectorySeparatorChar)
  $listados.Add($relativa)

  if (-not (Test-Path -LiteralPath $ruta)) { $fallos.Add("Falta: $relativa"); continue }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $ruta).Hash.ToLowerInvariant()
  if ($actual -ne $esperado) { $fallos.Add("Hash distinto: $relativa") }
}

if ($fallos.Count -gt 0) { throw ($fallos -join [Environment]::NewLine) }
Write-Host "   hashes: $($listados.Count) archivos verificados"

# El manifiesto debe describir exactamente el paquete. Sin esta comparación,
# recortarlo reduce la cobertura sin que nada avise.
$raiz    = (Get-Location).Path
$enDisco = @(
  Get-ChildItem -LiteralPath $raiz -File -Recurse |
    Where-Object { $_.Name -ne $Manifiesto } |
    ForEach-Object { $_.FullName.Substring($raiz.Length + 1).Replace([IO.Path]::DirectorySeparatorChar, '/') }
)

$sinListar = @($enDisco | Where-Object { $listados -notcontains $_ })
$ausentes  = @($listados | Where-Object { $enDisco -notcontains $_ })

if ($sinListar.Count -gt 0 -or $ausentes.Count -gt 0) {
  $msg = @('ERROR: el manifiesto no describe el paquete.')
  if ($sinListar.Count -gt 0) { $msg += '-- en disco y sin listar:'; $msg += ($sinListar | ForEach-Object { "     $_" }) }
  if ($ausentes.Count  -gt 0) { $msg += '-- listados y ausentes:';   $msg += ($ausentes  | ForEach-Object { "     $_" }) }
  throw ($msg -join [Environment]::NewLine)
}
Write-Host '   cobertura: el manifiesto describe todo el paquete'

Write-Host "`n== 2. Sintaxis del artefacto cliente =="
$htmlPath = 'entregables/MiComercio-F5-PRUEBA.html'
$html     = [IO.File]::ReadAllText((Join-Path (Get-Location) $htmlPath))
$abre     = '<script>'
$inicio   = $html.IndexOf($abre, [StringComparison]::Ordinal)
$fin      = $html.LastIndexOf('</script>', [StringComparison]::Ordinal)
if ($inicio -lt 0 -or $fin -le $inicio) { throw 'No se encontró el script embebido' }
$javascript = $html.Substring($inicio + $abre.Length, $fin - $inicio - $abre.Length)
$tempJs = Join-Path ([IO.Path]::GetTempPath()) ("micomercio-f5-" + [Guid]::NewGuid().ToString('N') + '.js')
try {
  [IO.File]::WriteAllText($tempJs, $javascript, [Text.UTF8Encoding]::new($false))
  & node --check $tempJs
  if ($LASTEXITCODE -ne 0) { throw 'Falló la validación de sintaxis' }
} finally {
  if (Test-Path -LiteralPath $tempJs) { Remove-Item -LiteralPath $tempJs -Force }
}
$lineasJs = ($javascript -split "`n").Count
Write-Host "   sintaxis OK ($lineasJs líneas de JS)"

Write-Host "`n== 3. Pruebas locales =="

$suites = @(
  Get-ChildItem -LiteralPath 'tests' -File |
    Where-Object { $_.Name -match '\.test\.(cjs|mjs)$' } |
    Sort-Object Name |
    Select-Object -ExpandProperty FullName
)
if ($suites.Count -eq 0) { throw 'No se encontró ninguna suite en tests/.' }

$salida = & node --test @suites 2>&1
$texto  = $salida -join [Environment]::NewLine
$codigo = $LASTEXITCODE

# Node usa el prefijo TAP "#" cuando la salida es un pipe y el prefijo visual
# "ℹ" cuando PowerShell conserva el reporter spec. Ambos representan el mismo
# resumen medido y deben aceptarse sin relajar el nombre del campo.
$pass = if ($texto -match '(?m)^(?:#|\u2139)\s+pass\s+(\d+)\s*$') { [int]$Matches[1] } else { -1 }
$fail = if ($texto -match '(?m)^(?:#|\u2139)\s+fail\s+(\d+)\s*$') { [int]$Matches[1] } else { -1 }

if ($codigo -ne 0 -or $fail -ne 0) {
  $texto -split "`n" | Where-Object { $_ -like 'not ok*' } | ForEach-Object { Write-Host $_ }
  throw "Fallaron las pruebas locales (fail=$fail, exit=$codigo)."
}

# El conteo es parte del gate: si baja, alguien borró cobertura.
if ($pass -ne $PruebasEsperadas) {
  throw ("Se esperaban $PruebasEsperadas pruebas y se ejecutaron $pass. " +
         'Si el cambio de cobertura es deliberado, actualizá $PruebasEsperadas.')
}
Write-Host "   pruebas: $pass/$PruebasEsperadas aprobadas en $($suites.Count) suites"

Write-Host "`n== Verificación completa: $pass/$PruebasEsperadas =="
