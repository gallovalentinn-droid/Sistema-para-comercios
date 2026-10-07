# MiComercio — correcciones de la auditoría funcional REV38

**Entrega:** REV39, 24/09/2026. Base: paquete REV38 auditado (SHA-256 `b9bb44a9df0a55d7e48ad7496a3f95dbd25cae8ca0789f09faf0405ed4468114`). Se revisaron los cuatro hallazgos N1–N4 de la auditoría adjunta. El ZIP REV39 contiene el sistema completo, las pruebas, el manifiesto y las dos migraciones preparadas en REV38.

## Cambios

| Hallazgo | Corrección y motivo |
|---|---|
| N1. Arranque con red colgada | Las solicitudes Supabase iniciadas mientras se abre el comercio comparten un plazo de 8 segundos. Se cancelan al vencerlo, de modo que las rutas de recuperación local reciben un error en vez de esperar indefinidamente. La pantalla muestra **Abriendo el comercio…** desde el inicio y un aviso dentro de la aplicación mientras carga. Se desactivaron los reintentos automáticos de PostgREST en este cliente para evitar que prolonguen el arranque; las operaciones de sincronización conservan sus propios mecanismos de reintento. Después de abrir, `fetch` vuelve a su comportamiento normal, sin ese plazo. Un fallo al recuperar la sesión muestra el ingreso en lugar de dejar la pantalla de carga indefinidamente. |
| N2. Caja de cigarrillos con turno abierto | Configuración impide cambiar la separación de cigarrillos mientras la sesión de caja local está abierta. El arqueo de ese turno conserva el criterio con que se registraron sus ventas. Tras cerrar, el cambio vuelve a estar disponible. |
| N3. Importación sin precio | Una fila que crearía un producto nuevo necesita precio explícito; si está vacío, aparece **Precio: completalo o escribí 0 si es gratuito** y la fila no se importa. La celda vacía de un producto existente sigue significando **conservar el precio actual**. Un 0 escrito se acepta. |
| N4. Error de autorización al abrir | Los errores de sesión vencida o sin permiso muestran una explicación de acceso y el botón **Volver a ingresar**. Los errores de red conservan **Reintentar**. Ningún mensaje muestra el contenido técnico del error. |

La identidad `packageRevision:39`, el caché `micomercio-beta-6.0.0-f6-rc2-rev39`, las pruebas y el manifiesto quedaron alineados. No se cambió la landing ni `/clientes/` en esta revisión.

## Verificación

**Verificado en código:** las cuatro causas descritas por la auditoría estaban presentes en REV38. El arranque esperaba respuestas de la red sin límite; el cambio de caja de cigarrillos carecía de la guarda que ya existía para turnos; la importación convertía un precio vacío nuevo en 0; y la pantalla de error atribuía cualquier rechazo a la conexión. Se verificó que el límite de red sólo rige durante la apertura y que un error de autorización no se trata como falta de conexión.

**Verificado localmente:** 146/146 pruebas del repositorio aprobadas, incluidos cinco casos nuevos que fallaron antes de las correcciones. El verificador de integridad comprobó los 14 archivos incluidos en el manifiesto. En Chromium con red externa bloqueada y la biblioteca real de Supabase, con una conexión colgada, Vender ya estaba abierto y el producto local recuperado al observarlo a los 10,1 segundos; con respuestas de red fallidas inmediatas, ya estaba abierto al observarlo a los 5,1 segundos. Con un turno abierto, activar la caja separada de cigarrillos dejó el arqueo en $11.000 y mostró el bloqueo. La vista previa de importación marcó una fila nueva sin precio como no importable; sólo se creó la fila con precio escrito. Un rechazo `JWT expired` mostró **Volver a ingresar**. Se repitieron las pruebas de importación, respaldo y restauración relacionadas, sin errores de JavaScript.

**Entorno público:** REV39 no se publicó ni se probó en `https://micomercio.ar/beta/`. Las dos migraciones de REV38 siguen sin aplicarse en Supabase: `backups_comercio_v4` no está disponible y la RPC antigua aún conserva el permiso que permite consumir cupo de IA. El cambio de Auth para proteger contra contraseñas filtradas también sigue pendiente en el panel. Por eso esta entrega es un paquete listo para desplegar y probar, **no una confirmación de corrección en producción**.

## Orden de despliegue y límites

1. Aplicar `REV38-RESPALDOS-COMERCIO.sql` y `REV38-CUPO-IA-Y-PERMISOS.sql`; comprobar los permisos resultantes y la RLS de respaldos con dueño, administrador y empleado.
2. Publicar REV39 y renovar el caché del navegador. Repetir en la beta pública el arranque con red deficiente, el cambio de caja, la importación y la reautenticación.
3. Completar el piloto real antes de declarar el sistema apto para comercializar.

Esta revisión no cambia la validación de cierres del lado del servidor, el criterio de consumo del cupo de IA, la política de copias de empleados ni la biblioteca SheetJS 0.18.5. Son pendientes ya descritos en las auditorías y requieren pruebas propias. La guarda de la caja de cigarrillos cubre el cambio desde este cliente; una configuración modificada desde otro dispositivo durante el turno requiere validación adicional en el servidor para garantizar el mismo comportamiento entre equipos.
