# MiComercio REV67 — sin PIN del dispositivo ni bloqueo de mostrador

Fecha: 29/09/2026.
Base: REV66 (lista de Productos como antes), que va incluida en este paquete. Si todavía no publicaste REV66, alcanza con publicar REV67.

## Por qué

Cada vez que el dueño o un administrador abría la app, se pedía el PIN del dispositivo, y en un equipo nuevo había que crearlo confirmando la contraseña de la cuenta. Resultaba molesto y no aportaba en el uso diario. El dueño pidió quitarlo por completo, incluido el botón «Bloquear», que dependía de ese PIN.

## Qué cambia

1. **Sin PIN al abrir.** El dueño y los administradores entran directo a todas las secciones, sin ventana de PIN ni de «Proteger este dispositivo».
2. **Sin botón «Bloquear».** Desaparece de la barra lateral. Queda la etiqueta del rol (por ejemplo, «Dueño»).
3. **Configuración:**
   - se quita «PIN de este dispositivo» y el botón «Cambiar PIN de este dispositivo»;
   - se quita la sección «Bloqueo de mostrador», que solo servía mientras la pantalla estaba bloqueada.
4. **Limpieza:** al abrir la app se borra el PIN que hubiera quedado guardado en ese equipo.

**Sin cambios:**

- Las cuentas de **empleado** siguen viendo solo las secciones que el dueño les habilita en el servidor. Eso no dependía del PIN.
- Ventas, caja, stock, sincronización y datos. No hay migraciones SQL.

## Importante

Sin «Bloquear», **cualquiera que use la computadora con la cuenta del dueño ve todo**: el efectivo esperado de la caja, la ganancia, la configuración y los empleados. Si alguien atiende el mostrador y no debe ver eso, tiene que ingresar con su propia cuenta de empleado (Configuración → Empleados).

## Archivos

- `beta/index.html`:
  - `f6AsegurarProteccionDispositivo` ya no pide ni crea PIN y borra el PIN guardado;
  - se quitaron el botón y la función de bloqueo, el bloque de PIN y la sección «Bloqueo de mostrador» de Configuración;
  - `packageRevision:67`.
- `beta/sw.js`: caché `micomercio-beta-6.0.0-f6-rc2-rev67`.
- `integrity-manifest.json`: revisión 67 y hashes nuevos.
- `tests/beta-sin-pin-rev67.test.cjs` (nueva). Se actualizaron dos pruebas de Configuración que exigían la sección de bloqueo y las pruebas de identidad.
- `entregables/pruebas-navegador-REV67/`: prueba de navegador y captura.

## Verificación

- **Pruebas automáticas:** 274 de 274 aprobadas.
- **Integridad:** correcta en 20 archivos, sin secretos. Sintaxis correcta y ESLint sin identificadores indefinidos.
- **Navegador (Chromium, sin red externa):**
  - `pruebas-navegador-REV67/sin-pin.cjs` corre el arranque real con un PIN viejo guardado en el equipo y comprueba:
    - no se abre ninguna ventana;
    - el dueño ve las 12 secciones;
    - el PIN guardado se borra;
    - no hay «Bloquear»;
    - Configuración no muestra ni el PIN ni «Bloqueo de mostrador».
  - La misma prueba contra REV66 queda esperando el PIN, que es el comportamiento anterior.
  - Siguen pasando los recorridos de REV62 a REV66.
- **Límite:** las pruebas usan datos ficticios y no se conectan al servidor. Después de publicar, conviene abrir la app en el mostrador y comprobar que entra sin pedir PIN.
