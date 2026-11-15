# Genera la clave del cifrado MP exclusivamente en memoria y la lleva al portapapeles.
# Pegar directamente en Supabase Secrets como MP_TOKEN_ENCRYPTION_KEY. Nunca en chats.
$ErrorActionPreference='Stop'
$taskMpBytes=New-Object byte[] 32
$taskMpRng=[System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $taskMpRng.GetBytes($taskMpBytes)
  Set-Clipboard -Value ([Convert]::ToBase64String($taskMpBytes))
  Write-Output 'Clave de cifrado copiada al portapapeles. Pegala en el Secret MP_TOKEN_ENCRYPTION_KEY y luego limpiá el portapapeles.'
} finally {
  [Array]::Clear($taskMpBytes,0,$taskMpBytes.Length)
  $taskMpRng.Dispose()
}
