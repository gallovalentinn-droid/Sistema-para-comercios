# Estado inicial del sandbox — 2026-08-26

Target: `qrvdfqpxutymmlcplsal`

## Huella

Ver `SANDBOX_FINGERPRINT_BEFORE_REBUILD.json`.

## Diferencias ya observadas

### Objetos faltantes de impacto funcional
- `anular_venta_v4`
- `reversar_egreso_v4`
- `cerrar_sesion_caja_excepcion_v4`

### Relaciones que sobran y no están en producción
- `comentarios`
- `gestion`
- `gestion_log`
- `saldos`

### Señal de permisos
El sandbox reporta 114 grants de tabla para `anon/authenticated/public`
contra 80 en producción. Por lo tanto no debe considerarse equivalente
aunque varias tablas/RLS existan.

## Decisión

`PARITY=FAIL`.

No ejecutar COV-1 sobre este estado.
