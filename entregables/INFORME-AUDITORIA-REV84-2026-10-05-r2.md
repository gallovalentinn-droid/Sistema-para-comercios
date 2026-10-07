# Seguimiento de auditoría REV84 — segunda entrega, 05/10/2026

Esta entrega corrige el seguimiento del paquete de origen ba34fda. El ZIP auditado `MiComercio-Sistema-Completo-REV84-2026-10-05.zip`, SHA-256 `d2bbb10574948c61ff1153da0334e875c90fd1f5487bd398526e056f840f07d7`, se conserva sin reemplazar. La entrega nueva lleva el sufijo `2026-10-05-r2`.

## Verificado en código

| Hallazgo | Tratamiento |
|---|---|
| H-01 | Detector compartido reconoce X6/X40 sin sufijo; excluye pesos/volúmenes, códigos entre paréntesis y letras adosadas. Más de un número de pack queda ambiguo. La revisión exige elegir y conserva cantidad/precio impresos. |
| H-02 | Se conserva la corrección anterior: diez segundos de admisión empiezan después de recibir la foto; límite global 145 segundos. Medición del gateway pendiente. |
| H-03 | Decisión explícita del usuario: precio impreso ya incluye impuestos y el pie discrimina el neto. Se refuerza en las instrucciones compartidas: no sumar ni repartir nuevamente el IVA del pie. No se agrega un reparto automático de impuestos. |
| H-04 | Se conserva el bloqueo hasta resolver; se agrega «No cargar esta fila» visible para descartar explícitamente una fila sin producto. La opción vacía inicial ya no afirma que esté descartada. Elegir un candidato vuelve a incluirla. |
| H-05 | Aviso visible para dueño/administrador al revisar una lectura por respaldo o con registro/cierre pendiente. Solo categorías conocidas y referencia UUID; sin mensajes crudos ni claves. Permanece el diagnóstico seguro de servidor. Aviso ligado a esa revisión; no se crea una bandeja persistente nueva. |
| H-06 | X1U no exige elección equivalente; mantiene una unidad y no reutiliza una conversión vieja distinta. |
| H-07 | El registro de pruebas y hashes críticos ahora está dentro del ZIP, en la ruta citada abajo. El hash del archivo final se registra por separado. |
| N-01 | Se comprueba tiempo útil al recibir la foto y antes de reservar: mínimo 80 s restantes para principal y márgenes. Con 100/141 s de subida devuelve 408 en etapa de subida, sin reserva ni llamadas, tanto en modo nuevo como compatible REV83. |

No cambian las migraciones, el esquema de respuesta de los modelos ni el original de la foto. El prompt compartido sí cambia para explicitar la decisión de impuestos. Identidad HTML/SW y manifiesto continúan alineados en REV84, aún sin publicar.

## Verificado localmente

- Node: 499/499. Regresiones nuevas de packs sin sufijo por ambos lectores; pie informativo sin duplicar IVA; X1U; aviso administrativo y ocultación a empleados; subidas de 100/141 segundos sin reserva y comprobación después de sesión. Las correcciones funcionales se observaron fallar antes de implementarlas; el caso del pie caracteriza la regla ya existente, con instrucciones nuevas.
- Prueba de recepción: imagen sintética de 5 MB con espera real de 12 segundos aceptada; las esperas de 100/141 se simulan con reloj controlado. No se confunden con transferencias públicas.
- Integridad: 33 archivos críticos. SQL real local PostgreSQL 18.4: memoria/cupo idempotentes, permisos, concurrencia y reversión aprobados, sin cambios en sus scripts.
- Ocho recorridos de navegador del lector: auditoría nueva, revisión, reintento, subida, compatibilidad REV83, costos, diagnóstico REV82 y proveedores REV83. A 1366/390 px; costos 6/6 en cada ancho. Proveedores y red externa simulados/bloqueados, sin compras/stock públicos.
- La primera suite completa detectó seis contextos de pruebas sin el rol administrativo y una comprobación textual del candidato que ya no correspondía. Se adaptaron los arneses al nuevo contexto y la suite completa posterior pasó; no se relajó el bloqueo de carga.

El registro interno `entregables/VERIFICACION-ZIP-REV84-2026-10-05-r2.json` contiene estas pruebas y hashes críticos de fuente. `INDICE-ARCHIVOS-REV84.json` indexa todos los archivos entregados. Tras empaquetar, se coteja fuente/ZIP/extracción y se repite la suite sobre la extracción; ese resultado y el hash del ZIP final quedan en el registro externo `HASH-ZIP-REV84-2026-10-05-r2.json`. Así se evita incluir un hash autorreferente dentro del propio ZIP. Los registros externos de paquetes anteriores siguen siendo históricos y no se presentan como incluidos en aquellos ZIP.

## Verificado en el entorno público

Consulta de solo lectura del 05/10: web HTTP 200, identidad REV83; `leer-factura` ACTIVE versión 23, JWT habilitado. No se desplegaron estas correcciones, no se aplicaron migraciones y no se hicieron llamadas a OpenAI/Gemini ni escrituras de datos públicos durante este seguimiento.

La transferencia pública lenta anterior comprueba que REV83 aceptó 5 MB en 12,499 segundos, pero no cuándo arranca el handler. Sigue pendiente autorización para la función temporal de medición. Tampoco están autorizadas todavía las migraciones de memoria/cupo ni las cuatro comparativas pagas y la lectura pública. **Correcciones verificadas localmente; publicación y comprobación real siguen pendientes.**
