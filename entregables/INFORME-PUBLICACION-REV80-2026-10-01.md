# Publicación de REV80 — 01/10/2026

El usuario aprobó la revisión de REV80 y pidió comprobar y republicar. Se publicó el paquete aprobado, sin incorporar las tres observaciones menores como cambios nuevos.

## Resultado

- Beta: https://micomercio.ar/beta/.
- Commit de la integración: `175b82ec7a5deebc6371fd464f18eef36c3ee0d4`, sobre `fbace229ab092a727f3824e113c42b5cd7ea2a5e`.
- GitHub Pages terminó con éxito: https://github.com/gallovalentinn-droid/Sistema-para-comercios/actions/runs/36878998137.
- HTML y caché declaran REV80. Sus bytes públicos coinciden con el manifiesto de la entrega aprobada.
- Lector Supabase `leer-factura`: versión 19, activa, JWT habilitado. Los tres archivos recuperados del despliegue coinciden con `supabase/functions/`. Incluye `saldoAnterior` y `pagosACuenta`.
- REV71 ya estaba aplicada. Se verificaron tabla, restricciones, trigger, políticas por comercio, permiso y licencia, RLS y ausencia de lectura anónima/TRUNCATE autenticado. No se reaplicó esa migración.
- Respaldo nuevo: `private.rev80_predeploy_snapshot`, 28 tablas operativas, 16.078 filas, más metadatos de publicación. No incluye Auth ni configuración. RLS habilitada, sin permisos de lectura para anon/authenticated. Los datos del respaldo permanecen en la base privada.

## Evidencia

**Código/local:** 414/414 pruebas después de integrar en la copia canónica; integridad de 25 archivos. Se verificaron además los hashes del contenido preparado en Git antes de publicar. Al integrar inicialmente faltó copiar el evaluador auxiliar de las pruebas; se incorporó y se repitió la suite completa antes del commit y despliegue.

**Entorno público:** lectura HTTP sin caché y navegador nuevo sin sesión a 1366 y 390 px. Se comprobó que el código servido bloquea tres contradicciones de talle y acepta sus tres controles; muestra aviso para SALDO A FAVOR conservando $9.500; calcula los dos turnos de stock y los cuatro importes de cigarrillos de $250. El acceso público y las pantallas de revisión abren sin errores de página.

Los datos de esas comprobaciones se introdujeron exclusivamente en la memoria de un navegador aislado, sin confirmar compras ni escribir operaciones comerciales. No se envió WhatsApp ni se invocó Gemini. Los casos protegidos de empleados se verificaron localmente y el HTML público es idéntico al probado; no se afirma haber repetido el flujo autenticado con un empleado real en producción.

La función publicada responde OPTIONS 204 con el dominio autorizado y POST sin sesión con 401.

| Archivo público | SHA-256 |
|---|---|
| beta/index.html | d7f668e4aa31a89db4ce5b5e879002ca9fdf0233b1d996c84f2e71fb3309673f |
| beta/sw.js | 52932d1f5090d254e797c25b0aec6e798e166d56a6b0cd23e1067eeb09813c8f |

La evidencia adicional queda localmente en `entregables/publicacion-REV80-2026-10-01/`: verificador reproducible, JSON y capturas sintéticas. No se incorporaron las capturas al sitio.

## Pendiente

Piloto con nuevas facturas reales contra Gemini y dos dispositivos físicos. Observaciones menores de la revisión aprobada: pañales sin talle con varias presentaciones, XXXG/marcas sin palabra pañal y productos con la palabra crédito. Permanecen los problemas heredados ya documentados, fuera de esta publicación.
