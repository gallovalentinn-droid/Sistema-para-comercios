# Anular un cobro de fiado

Pedido: agregar anulación de cobros, disponible para todos los usuarios. Se interpreta dentro del permiso existente de acceso a Fiado, sin dar acceso a otras secciones. Confirmado por el usuario: «todos».

Acceso directo en la cuenta del cliente, motivo de 3–500 caracteres y confirmación explícita. Reutilizar la compensación auditada del laboratorio: conservar pago y aplicaciones originales, reponer deuda con vencimientos originales, compensar el medio de pago en el turno abierto, registrar actor y evitar duplicados. No borrar pagos ni reescribir arqueos anteriores. Solo online, autoridad vigente. La edición de importe/medio conserva su permiso de dueño.

1. Reproducir falta de botón y rechazo de empleado con pruebas.
2. Integrar el acceso directo y capacidades de anulación por `fiado_operar`.
3. Preparar SQL publicable desde el artefacto local, con ACL y comprobación de comercio, actor, dispositivo, sesión, licencia, atomicidad y replay.
4. Probar con PostgreSQL Docker y navegador; revisión independiente y suite completa.
5. Publicar servidor y REV108 alineando HTML, SW y manifiesto; comprobar fuente pública y recorrido sintético, sin anular cobros reales del usuario.

En shadow se parchea únicamente el snapshot legacy del dueño bajo bloqueo, manteniendo CAS cuando llama el dueño. Un empleado recibe solo filas canónicas afectadas. En V4-only no se escribe el snapshot histórico. Rollback impide la operación. Un pago sin respaldo canónico/aplicaciones completas se rechaza para no inventar deuda ni vencimientos.
