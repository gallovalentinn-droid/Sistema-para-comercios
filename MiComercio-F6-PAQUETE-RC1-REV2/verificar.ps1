# Verificación reproducible del candidato F6 en Windows PowerShell 5+.
# Uso: powershell -ExecutionPolicy Bypass -File .\verificar.ps1

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$Manifiesto        = 'SHA256SUMS-F6.txt'
$PruebasEsperadas  = 110
$SuitesSqlEsperadas = 15

Write-Host '== 1. Integridad y cobertura =='

$fallos   = [System.Collections.Generic.List[string]]::new()
$listados = [System.Collections.Generic.List[string]]::new()

foreach ($linea in Get-Content -LiteralPath $Manifiesto) {
  if ([string]::IsNullOrWhiteSpace($linea)) { continue }
  if ($linea -notmatch '^([0-9a-f]{64})  (.+)$') {
    $fallos.Add("Línea inválida: $linea")
    continue
  }
  $esperado = $Matches[1]
  $relativa = $Matches[2]
  $ruta = $relativa.Replace('/', [IO.Path]::DirectorySeparatorChar)
  $listados.Add($relativa)

  if (-not (Test-Path -LiteralPath $ruta -PathType Leaf)) {
    $fallos.Add("Falta: $relativa")
    continue
  }
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $ruta).Hash.ToLowerInvariant()
  if ($actual -ne $esperado) { $fallos.Add("Hash distinto: $relativa") }
}

if ($fallos.Count -gt 0) { throw ($fallos -join [Environment]::NewLine) }
Write-Host "   hashes: $($listados.Count) archivos verificados"

$raiz = (Get-Location).Path
$enDisco = @(
  Get-ChildItem -LiteralPath $raiz -File -Recurse |
    Where-Object { $_.Name -ne $Manifiesto } |
    ForEach-Object {
      $_.FullName.Substring($raiz.Length + 1).Replace([IO.Path]::DirectorySeparatorChar, '/')
    }
)
$sinListar = @($enDisco | Where-Object { $listados -notcontains $_ })
$ausentes  = @($listados | Where-Object { $enDisco -notcontains $_ })
if ($sinListar.Count -gt 0 -or $ausentes.Count -gt 0) {
  $mensaje = @('ERROR: el manifiesto no describe exactamente el paquete.')
  if ($sinListar.Count -gt 0) {
    $mensaje += '-- en disco y sin listar:'
    $mensaje += ($sinListar | ForEach-Object { "     $_" })
  }
  if ($ausentes.Count -gt 0) {
    $mensaje += '-- listados y ausentes:'
    $mensaje += ($ausentes | ForEach-Object { "     $_" })
  }
  throw ($mensaje -join [Environment]::NewLine)
}
Write-Host '   cobertura: el manifiesto describe todo el paquete'

Write-Host "`n== 2. Sintaxis de los clientes =="
foreach ($htmlPath in @('entregables/MiComercio-F6-PRUEBA.html', 'entregables/MiComercio-Soporte-F6.html')) {
  $html = [IO.File]::ReadAllText((Join-Path (Get-Location) $htmlPath))
  $abre = '<script>'
  $inicio = $html.IndexOf($abre, [StringComparison]::Ordinal)
  $fin = $html.LastIndexOf('</script>', [StringComparison]::Ordinal)
  if ($inicio -lt 0 -or $fin -le $inicio) { throw "No se encontró el script embebido: $htmlPath" }
  $javascript = $html.Substring($inicio + $abre.Length, $fin - $inicio - $abre.Length)
  $tempJs = Join-Path ([IO.Path]::GetTempPath()) ("micomercio-f6-" + [Guid]::NewGuid().ToString('N') + '.js')
  try {
    [IO.File]::WriteAllText($tempJs, $javascript, [Text.UTF8Encoding]::new($false))
    & node --check $tempJs
    if ($LASTEXITCODE -ne 0) { throw "Falló la sintaxis: $htmlPath" }
  } finally {
    if (Test-Path -LiteralPath $tempJs) { Remove-Item -LiteralPath $tempJs -Force }
  }
  Write-Host "   sintaxis OK: $htmlPath"
}

Write-Host "`n== 3. Inventario SQL =="
$suitesSql = @(
  Get-ChildItem -LiteralPath 'supabase/tests' -File |
    Where-Object { $_.Name -match '\.test\.sql$' }
)
if ($suitesSql.Count -ne $SuitesSqlEsperadas) {
  throw "Se esperaban $SuitesSqlEsperadas suites SQL y se encontraron $($suitesSql.Count)."
}
$migracionesF6 = @(Get-ChildItem -LiteralPath 'supabase/f6' -File -Filter '*.sql')
if ($migracionesF6.Count -ne 8) { throw "Se esperaban 8 migraciones F6 y se encontraron $($migracionesF6.Count)." }
Write-Host "   inventario: $($suitesSql.Count) suites SQL y $($migracionesF6.Count) migraciones F6"
Write-Host '   ejecución SQL: externa; ver entregables/SQL-REPRODUCIBILIDAD-F6.md'

Write-Host "`n== 4. Pruebas locales e identidad =="
$suites = @(
  Get-ChildItem -LiteralPath 'tests' -File |
    Where-Object { $_.Name -match '\.test\.(cjs|mjs)$' } |
    Sort-Object Name |
    Select-Object -ExpandProperty FullName
)
if ($suites.Count -eq 0) { throw 'No se encontró ninguna suite local.' }

$salida = & node --test @suites 2>&1
$texto = $salida -join [Environment]::NewLine
$codigo = $LASTEXITCODE
$pass = if ($texto -match '(?m)^(?:#|\u2139)\s+pass\s+(\d+)\s*$') { [int]$Matches[1] } else { -1 }
$fail = if ($texto -match '(?m)^(?:#|\u2139)\s+fail\s+(\d+)\s*$') { [int]$Matches[1] } else { -1 }
if ($codigo -ne 0 -or $fail -ne 0) {
  $texto -split "`n" | Where-Object { $_ -like 'not ok*' } | ForEach-Object { Write-Host $_ }
  throw "Fallaron las pruebas locales (fail=$fail, exit=$codigo)."
}
if ($pass -ne $PruebasEsperadas) {
  throw "Se esperaban $PruebasEsperadas pruebas y se ejecutaron $pass."
}
Write-Host "   pruebas: $pass/$PruebasEsperadas aprobadas en $($suites.Count) suites"

Write-Host "`n== 5. Búsqueda de secretos =="
$patronSecreto = '(?i)(sb_secret_[A-Za-z0-9_-]{20,}|postgres(?:ql)?://[^:\s]+:[^@\s]+@|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})'
$hallazgos = [System.Collections.Generic.List[string]]::new()
Get-ChildItem -LiteralPath $raiz -File -Recurse |
  Where-Object { $_.Name -notin @($Manifiesto, 'verificar.ps1', 'verificar.sh') } |
  ForEach-Object {
    $coincidencias = Select-String -LiteralPath $_.FullName -Pattern $patronSecreto -AllMatches -ErrorAction SilentlyContinue
    foreach ($coincidencia in $coincidencias) {
      $rel = $_.FullName.Substring($raiz.Length + 1)
      $hallazgos.Add("${rel}:$($coincidencia.LineNumber)")
    }
  }
if ($hallazgos.Count -gt 0) { throw ("Posibles secretos detectados:`n" + ($hallazgos -join "`n")) }
Write-Host '   secretos de alto riesgo: cero coincidencias'

Write-Host "`n== Verificación completa: $pass/$PruebasEsperadas =="
