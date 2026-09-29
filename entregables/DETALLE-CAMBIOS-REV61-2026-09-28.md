# MiComercio REV61 — sesión por dispositivo y conteo de caja

## Cambios aplicados

- **C1, crítico:** las nueve salidas de sesión de la beta pasan por `f61CerrarAuthLocal()`, que usa `sb.auth.signOut({scope:'local'})`. El cierre de sesión en un equipo ya no solicita revocar las sesiones de los otros equipos. La salida explícita espera a que termine el guardado local antes de limpiar la vista.
- La beta escucha `SIGNED_OUT` y rechazos de sesión durante el uso. Si la sesión del equipo deja de ser válida, muestra un aviso persistente con **Volver a ingresar**, conserva los datos locales y detiene los intentos de subir la copia anterior y la outbox V4 hasta el reingreso. Un 401 de credenciales en el formulario de acceso no dispara esta alarma.
- **A1, alto:** el efectivo esperado, el desglose, la barra de pagos, los movimientos y la ganancia del turno quedan visibles solamente para dueño o administrador con la pantalla desbloqueada. El empleado y la pantalla bloqueada ven el estado del turno y las acciones. Al cerrar, se revela el esperado en **Revisar** después de ingresar el efectivo contado.
- **M1, medio:** `REV61-PERMISO-CONFIG.sql` versiona el permiso `EXECUTE` de `authenticated` para la función privada de configuración. `REV57-MODOS-CAJA-CIGARRILLOS.sql` indica que se debe aplicar la corrección a continuación. En la base pública el permiso ya estaba repuesto; no se ejecutó una migración duplicada.
- Identidad de build, caché del service worker, manifiesto de integridad y pruebas actualizados a REV61.

## Estado de los otros hallazgos del informe

- **A2:** una consulta de solo lectura a la base pública encontró una sesión abierta, tres sesiones en `requiere_conciliacion` y 15 excepciones pendientes (12 cierres provisionales y 3 conflictos de apertura). No se modificaron cierres ni excepciones: primero deben llegar las ventas locales del mostrador y compararse con el servidor para evitar perder o duplicar movimientos.
- **M2 y B1–B5:** el aviso de nuevas versiones, el entorno de pruebas separado, el consumo del cupo IA, la protección de contraseñas filtradas, la clasificación estructurada de retiros, la ubicación del panel de sincronización, los textos técnicos y la depuración de dispositivos siguen pendientes de una revisión separada. El cambio de sesión era prioritario para detener nuevos cortes.

## Verificación

- **Código:** se confirmó que el cliente usa `supabase-js` 2.112.3. La documentación oficial de Supabase indica que el alcance predeterminado de `signOut()` es `global` y que `local` conserva las otras sesiones. Las llamadas de esta beta usan ahora el alcance local.
- **Local:** 257 pruebas automáticas aprobadas, análisis sintáctico del script principal, verificación de integridad de 20 archivos y escenario de navegador en tres estados (dueño, empleado y pantalla bloqueada). Un 401 mostró el aviso sin borrar la venta local; el aviso se revisó también a 390 px sin superposición ni desborde.
- **Entorno público:** pendiente de confirmar la propagación de REV61 y de repetir el reingreso y la sincronización en el dispositivo real del mostrador. La consulta a la base pública del 28/09/2026 seguía mostrando como última venta recibida la de las 16:33, hora argentina.

## Recuperación del mostrador

En **ese mismo navegador y dispositivo**, abrir la beta actualizada y volver a ingresar con la **misma cuenta**. No borrar los datos del navegador ni usar un perfil nuevo. Una vez abierto el comercio, usar **Reintentar ahora** y comprobar que las operaciones pendientes se hayan subido antes de un nuevo cierre de caja. La publicación del código no puede transmitir ventas que solo existen en el almacenamiento de ese dispositivo.
