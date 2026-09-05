# Informe detallado del desarrollo F5 — revisión 10

## 1. Resultado

F5 convierte la identidad, los permisos y el trabajo offline en contratos controlados por el servidor. El candidato entregado es `5.0.0-f5-rc2`, revisión 10. Su HTML expone la identidad en `window.MiComercioBuild` y queda fijado por SHA-256 en `BUILD-IDENTITY-F5.json`; el paquete verifica ambos contratos, su contenido completo, la sintaxis del cliente y 62 pruebas locales.

No se presenta como aceptación final: todavía falta el recorrido persistente en navegador hasta `v4_only`. Sí está listo para iniciar el diseño e implementación de F6 sin volver a cambiar el modelo central de F5.

## 2. Identidad y autoridad

El rol efectivo sale de `comercio_miembros`, no de información editable en el navegador. Dueño y administrador derivan los diez permisos del catálogo vigente; el empleado recibe únicamente su conjunto explícito.

La administración de personas usa operaciones cerradas. Un administrador gestiona empleados, pero no puede ascenderse, modificar dueños ni dejar un comercio sin propietario. Los cambios quedan auditados e incrementan `permission_version`.

El login de empleados oculta el correo técnico y limita intentos en tres niveles: combinación IP/usuario, usuario e IP. La IP se obtiene primero de la cabecera de plataforma y sólo usa el extremo confiable de la cadena reenviada como respaldo.

## 3. Autoridad offline de siete días

Cada dispositivo recibe un lease inmutable de siete días exactos. El cliente consulta autoridad cuando hay conexión y reemplaza el lease cuando corresponde; una operación conserva el lease con el que nació.

Una operación creada durante la vigencia puede drenarse después de una revocación ordinaria, hasta el límite histórico de 30 días. Una revocación dura invalida la familia completa. Las fechas de creación técnica y de negocio permanecen separadas.

Las únicas operaciones offline son apertura de turno, venta, pago de fiado, egreso y cierre. Maestros, ajustes, configuración, personas y anulaciones siguen requiriendo conexión y autoridad vigente.

## 4. Turnos, raíces y segmentos

Una apertura offline puede crear una raíz provisional. El mismo dispositivo y caja la reutilizan y agregan segmentos para turnos posteriores; el servidor deriva el destino con datos autenticados, por lo que el cliente no puede enviar una operación a una sesión ajena.

Cada cierre corresponde a un segmento. Dos cierres de segmentos distintos dentro de una raíz son válidos, pero una sesión normal no admite dos cierres con segmento nulo. Las llegadas tardías generan el ajuste sobre el cierre exacto.

La existencia de varias raíces de dispositivos distintos produce una alerta y no bloquea. Es una decisión explícita para esta etapa.

## 5. Cambios en el cliente

Ventas, pagos, egresos, movimientos y cierres llevan raíz y segmento desde su creación local. El drenaje usa esos valores y no vuelve a consultar el turno corriente.

Caja no inventa un turno por rango de fechas: sin sesión abierta muestra el estado correspondiente. Resumen separa sesiones superpuestas. Las filas antiguas sin sesión se agrupan como legado y nunca se incorporan al arqueo de una sesión real.

Movimientos en cuentas continúa siendo una vista diaria de stock. Una anulación posterior no reescribe retroactivamente las ventas del día original: la reposición aparece el día de la anulación. Las llegadas tardías quedan identificadas.

Las causas de sólo lectura se componen y conservan su motivo: preparación F4.3, licencia no operable y lease vencido o revocado.

## 6. Configuración y rollback

El contrato V4 contiene diez claves canónicas: seis operativas y cuatro privilegiadas. `pin_hash` y `permisos_empleado` no tienen escritor autoritativo en V4 y quedan fuera de ambas RPC; sobreviven únicamente como valores legacy-only durante rollback.

Un mapa único define la subida y bajada. La proyección parcial sólo aplica campos realmente presentes, evitando que una respuesta reducida pise la configuración local con valores por defecto.

El rollback reconstruye las diez canónicas desde V4 y conserva seis valores legacy-only desde el blob congelado. Las pruebas usan centinelas distintos para detectar pérdidas o mezclas.

## 7. Minimización de datos

El servidor genera un manifiesto versionado desde rol, permisos, `permission_version`, dispositivo y contrato. Incluye colecciones, campos y alcance; el cliente no propone su propio subconjunto.

El catálogo real contiene 22 colecciones y se deriva desde la misma función que arma el manifiesto. El pull solicita únicamente lo autorizado, manteniendo el mínimo necesario para stock y funcionamiento offline.

La cobertura falla cerrado si falta o sobra una colección/campo, cambia el hash o la versión de permisos quedó vieja.

## 8. Seguridad y compatibilidad

- RPC públicas F5: ejecución sólo para `authenticated`.
- Tablas de lease, revocación y bitácoras: append-only también frente a `TRUNCATE` accidental.
- PostgreSQL: requisito explícito de versión 15 o superior antes del DDL que depende de `NULLS NOT DISTINCT`.
- `app_schema_meta`: RLS, lectura autenticada mínima y función `SECURITY INVOKER`.
- Tickets: referencia distribuida por caja, secuencia y sufijo UUID.
- Código inalcanzable de autoridad legacy eliminado de la RPC privilegiada.

## 9. Evidencia

- 62/62 pruebas locales en 6 suites.
- 8/8 suites SQL ejecutadas sobre el baseline real F2–F4 de QA, con el conjunto completo de migraciones F5 y rollback final. Este ZIP no incluye el baseline histórico y no reproduce el ensayo desde una base vacía.
- 36 archivos cubiertos exactamente por el manifiesto de integridad.
- Parser real sobre 9.814 líneas de JavaScript embebido.
- Identidad `5.0.0-f5-rc2` expuesta por el navegador y enlazada al hash real del HTML.
- Producción sin cambios.

El verificador de PowerShell fue ejecutado en Windows y rechazó cinco sabotajes: manifiesto truncado, suite borrada, SQL alterado, archivo colado e identidad mentida aun con hashes regenerados. La versión Bash contiene las mismas aserciones, pero no pudo ejecutarse en esta máquina por falta de Bash.

QA tenía seis migraciones F5 previas que quedaron superadas. Rev10 aplicó `f5_rev10_candidate_sync_qa` (`20260904183240`) con los siete SQL actuales y redeplegó `f5-login` v3 y `f5-members` v4. `SQL-REPRODUCIBILIDAD-F5.md` conserva la lista completa y las precondiciones.

## 10. Qué falta de F5

Falta una identidad real creada mediante Supabase Auth Admin y una sesión de navegador para levantar `F5_PROJECTION_QA`, producir 20 comparaciones shadow y recorrer F3.4 → F4.1 → F4.2 → F4.3 hasta `v4_only`.

Ese ensayo no se reemplazó por inserciones manuales en `auth.users`. El código, los fixtures y las pruebas transaccionales están listos; la aceptación persistente requiere esa credencial/capacidad externa.

## 11. Qué sigue

F6 debe construir el alta operativa de comercios, el asistente inicial, el ciclo de licencias, las herramientas de soporte y el primer piloto real. Después de F6 corresponde la integración y migración conjunta acordada.

Antes de programar F6.1 hay una decisión de producto que cambia su seguridad y alcance: alta interna con invitación para la beta, o autoservicio público desde el inicio.

## 12. Limitaciones aceptadas

La barrera F4.3 bloquea relaciones compartidas durante su ventana. Es aceptable para beta monocomercio, pero no para múltiples comercios concurrentes; antes de escalar debe sustituirse por particionado, locks por fila o una barrera lógica por `comercio_id`.

Los avisos legacy de seguridad que no nacieron en F5 se mantienen separados.

En concreto, un dispositivo nuevo sin blob legacy carece de `pinHash` y `pinDuenio`; `verificarPin()` devuelve `true`, por lo que la interfaz administrativa se abre sin PIN. Esto no eleva permisos de servidor, pero elimina la barrera local ante acceso físico y no debe describirse como una limitación genérica.
