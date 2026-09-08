# Bitácora del piloto F6 de siete días

Estado: `no_iniciado`  
Build exigido: `6.0.0-f6-rc2`
Duración: siete días corridos desde la activación, exactamente 604800 segundos  
Alcance: un comercio QA; producción excluida

Este documento es una plantilla operativa. Ningún campo vacío cuenta como evidencia aprobada.

## Gates antes de comenzar

| Gate | Resultado | Evidencia |
|---|---|---|
| Build observado coincide con RC2 | pendiente | |
| Comercio QA en `v4_only` | pendiente | |
| Baseline F2–F5 reproducible | pendiente | |
| `verificarPin()` resuelto en dispositivo nuevo | pendiente | |
| 16 suites SQL acumuladas PASS | aprobado | 16/16 en QA el 2026-09-08 |
| 118 pruebas locales PASS | aprobado | 118/118 en el paquete RC2 revisión 5 |
| Respaldo inicial creado y recuperable | pendiente | |

Si un gate permanece pendiente o falla, el piloto no empieza.

## Día 0 — alta y activación

- Fecha/hora:
- Comercio QA:
- Build observado:
- Invitación emitida y consumida una sola vez:
- Corte y reanudación del onboarding probados:
- Caja activa:
- Producto activo:
- Simulación final sin efectos comprobada:
- `valid_from`:
- `valid_until`:
- Diferencia medida en segundos:
- Respaldo y hash:
- Incidentes:

## Días 1 a 6 — operación

Completar una fila por día. Cada cierre se registra por turno; el total diario nunca reemplaza los cierres individuales.

| Día | Turnos abiertos | Turnos cerrados individualmente | Ventas | Outbox pendiente al cierre | Conciliaciones | Cortes/offline | Incidentes |
|---:|---:|---:|---:|---:|---:|---|---|
| 1 | | | | | | | |
| 2 | | | | | | | |
| 3 | | | | | | | |
| 4 | | | | | | | |
| 5 | | | | | | | |
| 6 | | | | | | | |

## Escenario obligatorio de dos turnos en un día

- Fecha:
- Primer turno — sesión/segmento:
- Primer cierre — referencia y diferencia:
- Segundo turno — sesión/segmento:
- Segundo cierre — referencia y diferencia:
- Lease conservado entre ambos:
- El segundo turno abrió sin mezclar arqueo del primero:
- Total diario sólo informativo y sin sumar diferencias:
- Evidencia de filas/IDs:

## Escenario offline obligatorio

- Inicio del corte:
- Cierre de turno realizado offline:
- Advertencia previa mostrada:
- Segundo turno abierto con el mismo lease válido:
- Operaciones creadas:
- Reconexión:
- Orden de drenaje verificado:
- Sesión/segmento de cada operación verificado:
- Conciliaciones resultantes:
- Evidencia de filas/IDs:

## Pausa, reactivación y saldo adicional

- Pausa sin detener reloj:
- Reactivación sin compensación:
- Pausa compensada — segundos exactos:
- `extension_used_seconds` antes/después:
- Solicitud superior al remanente:
- Rechazo total sin mutación comprobado:
- Motivo y evento de soporte:

## Día 7 — cierre

- Fecha/hora de vencimiento efectiva:
- Todos los turnos cerrados individualmente:
- Outbox completamente drenada:
- Conciliaciones listadas y explicadas:
- Diagnóstico exportado:
- Respaldo final y prueba de recuperación:
- Cero operaciones válidas sin destino:
- 118/118 pruebas locales repetidas:
- 16/16 suites SQL repetidas:
- Incidentes críticos:

## Criterios de salida

Para aprobar se exige simultáneamente:

- cero pérdida de datos o dinero;
- cero diferencias económicas sin explicación o flujo de conciliación;
- cero fallas críticas de seguridad, autoridad o aislamiento;
- todos los turnos cerrados de forma independiente;
- sincronización y drenaje completos;
- respaldo recuperable;
- gates y suites completos en PASS.

## Decisión final

Resultado permitido: `aprobado`, `repetir_escenario` o `rechazado`.

- Resultado:
- Responsable:
- Fecha:
- Escenario a repetir, si corresponde:
- Riesgos aceptados:
- Próximo paso autorizado:

El resultado `aprobado` habilita a preparar un plan separado para la migración conjunta F5+F6. No autoriza por sí solo producción.
