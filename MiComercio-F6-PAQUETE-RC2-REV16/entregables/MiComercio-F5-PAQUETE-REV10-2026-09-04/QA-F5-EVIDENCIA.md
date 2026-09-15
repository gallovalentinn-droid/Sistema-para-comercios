# Evidencia de implementación F5 — revisión 10

Fecha de cierre: 2026-09-04  
Proyecto Supabase QA: `qrvdfqpxutymmlcplsal`  
Proyecto productivo observado: `zzpmdiivewmvhiszmdzh`  
Producción: no recibió estas migraciones ni funciones F5.

## Identidad del candidato

- Build: `5.0.0-f5-rc2`.
- Revisión de paquete: 10.
- Artefacto: `entregables/MiComercio-F5-PRUEBA.html`.
- SHA-256 del HTML: `05412b8b2edcd785716f854f88fc863c47c51a659f17394fb05bbd7a5a537d43`.
- Contrato de proyección: `f5-projection-v1`.
- Contrato de configuración: 10 claves canónicas + 6 legacy-only.
- Estado: candidato F5; queda pendiente el gate persistente en navegador `v4_only`.

`BUILD-IDENTITY-F5.json` formaliza estos datos y el propio navegador publica el mismo contrato en `window.MiComercioBuild`. Dos pruebas independientes controlan el hash externo y la identidad disponible en ejecución.

## Resultado reproducible

- HTML: 10.179 líneas lógicas; 9.814 líneas en el JavaScript embebido; sintaxis válida con el parser de Node.
- Suite local: 62/62 pruebas aprobadas en 6 suites.
- Integridad: 36 archivos controlados por SHA-256, excluyendo únicamente el propio manifiesto; comparación exacta entre el contenido del disco y lo listado.
- Verificador de Windows: ejecutado en PowerShell contra el paquete sano; mide 62 aprobadas y cero fallas, incluso con manifiesto LF-only. Rechazó manifiesto truncado, suite borrada, SQL alterado, archivo colado e identidad mentida con hashes regenerados.
- Verificador Bash: conserva las mismas aserciones y el mismo umbral; no se ejecutó en esta máquina porque no dispone de Bash.
- SQL QA: 8/8 suites aprobadas sobre el baseline real F2–F4 de QA, con el conjunto completo de migraciones F5 dentro de transacciones descartables terminadas en `ROLLBACK`. El paquete no incluye el baseline histórico y no reproduce ese resultado desde una base vacía; `SQL-REPRODUCIBILIDAD-F5.md` documenta el límite y el procedimiento.
- Producción: sin cambios.

## Funcionalidad implementada

- Autoridad única en `comercio_miembros`, diez permisos cerrados, auditoría y protección del último dueño.
- Alta, listado paginado y restablecimiento de empleados sin exponer el correo técnico.
- Configuración separada en seis claves operativas y cuatro privilegiadas; `pin_hash` y `permisos_empleado` quedan fuera de V4 y se preservan sólo para rollback legacy.
- Lease append-only de siete días exactos, chequeo periódico, familia revocable y aceptación histórica de 30 días.
- Apertura, venta, pago de fiado, egreso y cierre aptos para trabajo offline.
- Raíz provisional por dispositivo/caja, segmentos sucesivos y destino derivado por servidor.
- Cierre por segmento, llegada tardía al cierre correcto y cola de conciliación tipada.
- Objetos locales sellados con sesión antes de persistirse.
- Caja filtrada por sesión; Resumen separa sesiones y agrupa filas legacy sin atribuirlas a una sesión real.
- Movimientos en cuentas sigue siendo diario y señala sincronizaciones tardías.
- Tickets visibles con caja, secuencia y ocho caracteres del UUID.
- Manifiesto de proyección generado por servidor desde rol, permisos, versión y dispositivo.
- Pull reducido a colecciones/campos autorizados; catálogo real derivado de 22 colecciones.
- `app_schema_meta` con RLS, lectura autenticada limitada y wrapper `SECURITY INVOKER`.

## Correcciones consolidadas hasta rev10

- `f3TurnoLegacyLimpio()` usa `turnoActual()` y detecta una venta viva.
- Rollback reconstruye las diez canónicas y conserva seis valores legacy-only, incluido `moduloCigarros`.
- Productos conserva `stock_base` remoto antes de sumar movimientos.
- El drenaje tardío ya no reinscribe el dispositivo: valida el lease histórico capturado.
- Todas las suites locales resuelven el único HTML entregado dentro del paquete.
- Los siete días y treinta días se expresan en segundos exactos, incluso al atravesar DST.
- Las cuatro RPC públicas revocan `EXECUTE` a `PUBLIC`, `anon` y `service_role`, y lo conceden sólo a `authenticated`.
- Los registros append-only también rechazan `TRUNCATE` accidental.
- Login limita intentos por combinación IP/usuario, por usuario y por IP.
- `04_offline_streams.sql` exige PostgreSQL 15 o superior antes del DDL que depende de `NULLS NOT DISTINCT`.
- La proyección y el contrato 10/6 derivan de un único mapa; un parche parcial no rellena ausencias con valores por defecto.
- `clientIp()` prioriza `cf-connecting-ip`, toma el extremo confiable de `x-forwarded-for` como fallback y tiene tres regresiones automatizadas.
- Se eliminó de la RPC privilegiada código inalcanzable para `pin_hash` y `permisos_empleado`.
- PowerShell y Bash esperan 62 pruebas; el resultado final ya no imprime una constante desconectada de la ejecución.
- El build F5 se expone dentro del artefacto y está cubierto tanto por una prueba de ejecución como por el hash externo.

## Migraciones persistentes de QA

QA conservaba seis migraciones F5 anteriores: `f5_task6_offline_streams_qa`, `f5_task6_offline_operations_qa`, `f5_task11_security_compatibility_qa`, `f5_task11_security_hardening_qa`, `f5_task8_projection_manifest_qa` y `f5_rollback_contract_10_6_fix_qa`.

Rev10 sincronizó los objetos persistentes mediante `f5_rev10_candidate_sync_qa` (`20260904183240`) y redeplegó `f5-login` v3 y `f5-members` v4. Se comprobó en la base resultante que la RPC privilegiada ya no acepta las dos claves legacy y que la proyección contiene `whatsapp_dueno` y `dias_aviso_vence`. Producción no cambió.

## Matriz comprobada

- Lease válido, reemplazado, vencido y revocado.
- Venta, pago, egreso y cierre creados bajo lease, revocación posterior y drenaje cuatro días después.
- Llegada posterior a 30 días enviada a decisión manual.
- Dos turnos offline en una raíz, con cierres válidos por segmentos distintos.
- Segundo cierre normal con segmento nulo rechazado.
- Tres dispositivos con tres raíces: alerta no bloqueante.
- Sesiones con fechas superpuestas no se mezclan en Caja.
- Venta del día D anulada en D+1 conserva la venta en D y registra la reposición en D+1.
- Perfil sólo-ventas recibe el mínimo requerido y no recibe fiado/cierres.
- Manifiesto reducido o con versión vieja falla cerrado.
- Configuración V4 excluye autoridad legacy y rollback conserva sus centinelas.
- Cabeceras de IP manipuladas no desplazan a la cabecera confiable de plataforma.

## Pendiente de aceptación estricta

Falta crear una identidad QA mediante Supabase Auth Admin, iniciar una sesión real del cliente, generar al menos 20 comparaciones shadow y recorrer F3.4 → F4.1 → F4.2 → F4.3 hasta un comercio persistente `v4_only`. El fixture está preparado en `supabase/tests/f5_v4only_fixture.sql`.

Esta tarea no dispone de una operación Auth Admin ni de credenciales QA existentes. No se insertó manualmente un usuario persistente en `auth.users`, porque eso produciría una prueba artificial. Por eso rev10 se identifica honestamente como candidato y no como gate F5 completamente aceptado.

## Limitaciones conocidas

- La barrera F4.3 usa locks de relación sobre tablas compartidas. Está aceptada sólo para beta monocomercio; multi-tenant exige particionado, locks por fila o una barrera lógica por `comercio_id`.
- Un dispositivo nuevo que nunca recibió el blob legacy no tiene `pinHash` ni `pinDuenio`; `verificarPin()` devuelve `true` y la interfaz administrativa se desbloquea sin PIN. F5 conserva la autoridad de servidor, pero no ofrece protección local contra alguien con acceso físico a ese dispositivo. Debe resolverse antes del despliegue productivo.
- Permanecen avisos legacy de seguridad ajenos a F5; se separaron para no mezclar alcance.
