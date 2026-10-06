# Publicación de REV84 r3 — 05/10/2026

Pedido autorizado: «migra todos los cambios y publica». La beta https://micomercio.ar/beta/ tiene REV84, edición 2026-10-05-r3, con su caché rev84-r3. Se integró la rama codex/lector-rev84 en main mediante avance directo, sin reemplazar la historia. Fuente de aplicación: 15b9f926f97af662c14ce2d15c395183ae96d6aa; base anterior eb468b0d1b1b25845002872cc5eb2faf21135475.

## Migraciones y despliegue

Aplicadas las dos migraciones pendientes, conservando las históricas:

- 20261006024823 rev84_lector_memoria: modo_stock y pack_detectado en factura_alias_producto.
- 20261006024829 rev84_lector_cupo: reservas temporales, intentos y cinco RPC de servicio.

leer-factura quedó ACTIVE, versión 24, con JWT habilitado. Sus seis archivos se recuperaron del servidor y coinciden exactamente con la fuente aprobada. Se conservaron copias anteriores de función, HTML, SW y manifiesto; no había lecturas recientes antes de cambiar. Las definiciones y permisos de las cuatro RPC anteriores permanecen iguales. Las nuevas RPC solo permiten ejecución por servicio; la tabla privada tiene RLS y no permite lectura/escritura/secuencia a clientes anónimos o autenticados.

Horas de Argentina (UTC−3): función activa 23:49:01; main enviado 23:49:08; web/SW/manifiesto idénticos comprobados 23:50:17. La publicación se realizó inmediatamente por el pedido explícito, reemplazando la ventana tentativa del documento local. No fue necesario revertir: la web compatible estuvo disponible en menos de cinco minutos. [GitHub Pages 37405988996](https://github.com/gallovalentinn-droid/Sistema-para-comercios/actions/runs/37405988996) terminó correctamente.

## Verificación

En código: revisión independiente cerrada y versiones alineadas. Localmente: 507/507 pruebas repetidas antes de publicar, 33 archivos críticos y comprobación de secretos privados aprobada. La preparación anterior también verificó SQL local real, concurrencia, idempotencia y reversión; no se ejecutó la fixture SQL en producción.

En el entorno público: HTML, SW y manifiesto descargados sin caché coinciden por SHA-256 con la fuente. Se repitieron doce casos r3 y seis pruebas de costos por ancho, a 1366 y 390 píxeles. También pasaron auditoría anterior, revisión, reintento, aviso de subida, diagnóstico y proveedores en ambos anchos. Las pruebas usan la web pública con sesión y respuestas sintéticas; bloquean escrituras externas y no llaman a proveedores reales. Validan selección de productos, packs, promoción de filas cero/financieras, decisiones inválidas tras cambio y packs excesivos, además de importes y avisos.

La RPC pública de capacidades devolvió el contrato f6-reader-quota-rev84 mediante una consulta de solo lectura, sin reservar. OPTIONS del lector devuelve 204; POST sin JWT devuelve 401. Evidencia en VERIFICACION.json, web-hashes.json y los registros de navegador de esta carpeta.

Revisión de seguridad antes/después: ninguna advertencia nueva. Aparece una observación informativa por RLS sin políticas en la tabla privada de intentos; es deliberado, porque el acceso cliente está revocado y las funciones de servicio son la vía de acceso. [Documentación de esta observación](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Las ocho advertencias de funciones SECURITY DEFINER accesibles a usuarios y la protección de contraseñas filtradas deshabilitada ya existían; esta publicación no cambió esos componentes. [Funciones con autoridad elevada](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Alcance pendiente y entrega

No se hicieron lecturas pagas, compras ni cambios de stock. Sigue pendiente la lectura autenticada real de REV84, la comparativa PNG/JPEG y el diagnóstico temporal del gateway, con sus autorizaciones independientes. El retest público con respuestas simuladas no demuestra precisión de IA ni el comportamiento del gateway con una lectura real. La publicación está terminada; esas validaciones se mantienen explícitamente pendientes.

ZIP r3 conservado intacto: MiComercio-Sistema-Completo-REV84-2026-10-05-r3.zip, SHA-256 f733dcfe40d59463564e603e7792239801ce97ac4958614535b29d764428bf0a. Contiene la preparación local y su evidencia original, anterior a este informe público. La reversión conserva las columnas y registros, puede reducir conservadoramente el cupo disponible y no devuelve cupos automáticamente.
