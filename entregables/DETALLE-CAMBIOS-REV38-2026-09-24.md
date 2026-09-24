# MiComercio — correcciones de la auditoría funcional REV37

**Entrega:** REV38, 24/09/2026. El paquete contiene el sistema, las pruebas, el verificador de integridad y dos migraciones: respaldos por comercio y cierre de permisos heredados. Esta revisión incorpora el anexo de Supabase presente en la copia de la auditoría de Descargas.

## Cambios realizados

| Hallazgo | Resolución |
|---|---|
| 1. Arranque sin conexión | F4.3 carga la base local cuando falla la red o el servicio responde temporalmente 502/503/504. Conserva el bloqueo de un dispositivo `prepared` y usa la carga local V4 si el último estado era `v4_only`. Los rechazos de autorización siguen propagándose. Si otro error impide abrir, aparece una pantalla con **Reintentar**. |
| 2. Restauración con sincronización | La restauración local queda bloqueada en cuentas sincronizadas, también sin conexión. Se deshabilitaron los controles correspondientes en Configuración; descargar copias sigue disponible. La recuperación de un comercio sincronizado debe hacerse con una herramienta del servidor. |
| 3. Fondos en Caja | La tarjeta se llama **Fondos sugeridos para el próximo turno** y aclara que no modifica el fondo ni el arqueo del turno abierto. El aviso de guardado tiene el mismo alcance. |
| 4. Cigarrillos apagados | Toda sesión nueva comienza con fondo de cigarrillos cero cuando la caja separada está apagada. La apertura explícita también lo fija en cero y el arqueo deja de decir que incluye un fondo inexistente. |
| 5. Activar turnos con caja abierta | Configuración impide activar turnos hasta cerrar la caja abierta. Si la configuración cambió desde otro dispositivo, Vender dirige al cierre en lugar de reutilizar la sesión anterior. |
| 6. Respaldo en la nube | La tabla desplegada `backups_kiosco` está vinculada al **usuario**, por clave foránea y RLS; cambiarle sólo el ID en el cliente habría fallado. Se preparó `REV38-RESPALDOS-COMERCIO.sql`, que crea `backups_comercio_v4` con acceso exclusivo para dueño y administrador activos. El cliente REV38 usa esa tabla cuando conoce el comercio y mantiene la ruta antigua para cuentas anteriores a V4. La copia local en IndexedDB sigue funcionando. **La migración aún no se aplicó al servidor.** |
| 7. Producto sin precio | El editor rechaza el precio vacío o inválido. Para guardar un producto gratuito, hay que escribir 0 y confirmarlo con un segundo clic. |
| 8. Combo con producto borrado | Se impide eliminar un producto usado por un combo y se sugiere editar el combo o archivar el producto. Un combo ya incompleto tampoco se agrega al ticket. |
| 9. Decimales | El CSV de Resumen redondea cantidades a tres decimales e importes a centavos. El neto de la última línea del ticket también se guarda a centavos. |
| 10. PIN | Tras cinco intentos erróneos, el dispositivo introduce una espera que crece desde 30 segundos hasta 15 minutos. El contador persiste entre recargas y se limpia al desbloquear o cambiar el PIN. Sigue siendo una barrera local de interfaz, no autoridad del servidor. |
| 11. Landing móvil | Se compactó el encabezado. A 360 y 390 px, **Ingresar** y **Pedir una demo** quedan dentro del ancho visible. También se corrigió el nombre de marca en el enlace de WhatsApp. |
| 12. Caché | El service worker sólo guarda respuestas HTTP correctas, tanto locales como externas. |
| 13. Persistencia y empaquetado | La proyección F5 usa ahora la función real de persistencia local. La fecha técnica del respaldo dejó de generar operaciones de configuración o exigir permiso para editar maestros. Se normalizaron a LF el manifiesto y la prueba indicada por la auditoría. HTML, identidad, caché, pruebas y manifiesto quedaron en REV38. |
| 14. Cupo de IA por RPC antigua | Confirmé en el esquema público que `consumir_cupo_factura_ai_v4` puede ejecutarse con el rol `authenticated` y llama a un helper que sólo valida membresía y licencia. Ambas funciones escriben en la misma tabla de cupo que usa el lector actual. Preparé `REV38-CUPO-IA-Y-PERMISOS.sql` para revocar `EXECUTE` a clientes en la RPC y su helper; el lector actual usa `f6_service_reservar_lectura_factura` con `service_role` y no depende de ellas. **La migración aún no se aplicó al servidor.** |

### Avisos adicionales del anexo

- El mismo SQL revoca `EXECUTE` público en la función de disparador `registrar_usuario_micomercio()` y `TRUNCATE` en tres tablas heredadas para clientes autenticados. Verifiqué los permisos actuales en el catálogo; no cambié la función ni las tablas ni sus datos.
- La protección de Auth contra contraseñas filtradas sigue pendiente de activar en el panel de Supabase. Es una configuración del proyecto, fuera del ZIP.
- El anexo confirma que el cierre de caja en el servidor acepta los importes enviados por el dispositivo. REV38 impide activar turnos con caja abierta en el cliente; **todavía falta una validación de coherencia del lado del servidor** antes del piloto. No se incluyó una nueva función de cierre sin probar su compatibilidad con los dos flujos de caja existentes.

## Verificación

**Verificado en código:** se revisaron las rutas afectadas y la definición desplegada de `backups_kiosco`: su clave foránea apunta a `auth.users`, su RLS usa `auth.uid()` y había **0 copias** al consultar. La migración nueva exige membresía activa de dueño o administrador mediante `private.tiene_rol`, función ya presente en el proyecto. Consultas de solo lectura confirmaron los `EXECUTE` de la RPC de IA antigua, la función de disparador y los tres `TRUNCATE`; ningún otro procedimiento del catálogo referencia la RPC de IA antigua por nombre en su fuente.

**Verificado localmente:** `node --test tests/*.test.cjs` terminó con **141/141** pruebas aprobadas; `node tools/verificar-integridad.cjs` comprobó **14 archivos** sin diferencias ni secretos privados detectados; `git diff --check` no reportó problemas. En Chromium con red externa bloqueada, el arranque con la biblioteca real de Supabase abrió la aplicación y recuperó el producto local. La restauración sincronizada no abrió el diálogo, conservó dos productos, una venta y el stock, y no creó operaciones nuevas. El arqueo con caja de cigarrillos apagada mostró $10.000 de fondo, sin sumar los $5.000 antiguos. También se repitieron caja, promociones, importación y exportación CSV/Excel, permisos, inyección de HTML y el recorrido de 198 botones en escritorio y celular. La landing midió 360/390 px de ancho sin desplazamiento horizontal; el botón de demo terminó en los píxeles 348/378, respectivamente.

**Entorno público:** sólo se consultó de forma **lectura** el esquema, los permisos y el conteo de respaldos de Supabase. La beta REV38 y las dos migraciones **no fueron publicadas ni probadas contra el backend real**. La prueba offline de Chromium usó una sesión sintética sin licencia ni lease válidos; confirmó carga local y ausencia de pantalla vacía, pero no autorizó ventas. Antes de publicar REV38, aplicar `REV38-RESPALDOS-COMERCIO.sql` y `REV38-CUPO-IA-Y-PERMISOS.sql`, comprobar RLS con dueño, administrador y empleado, confirmar que la RPC heredada ya no acepta `authenticated`, y repetir los escenarios afectados en `https://micomercio.ar/beta/` con credenciales de prueba y caché renovada.

## Observaciones que no cambié

- Las columnas históricas de cigarrillos en cero son un detalle visual; ocultarlas podría ocultar cierres antiguos con importes reales.
- El corte del día preexistente sigue aplicado en informes. Reexponer su edición requiere una decisión de producto, dado que REV37 lo quitó del alta.
- La auditoría señala vulnerabilidades conocidas en la copia incluida de SheetJS 0.18.5. No sustituí la biblioteca en esta tanda: importar y exportar Excel sigue funcionando, y el cambio de proveedor requiere una prueba propia antes del piloto comercial.
