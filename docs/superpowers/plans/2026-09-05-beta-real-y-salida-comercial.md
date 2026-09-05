# Beta real de siete días y salida comercial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar de forma aislada el candidato F6 corregido, cerrar sus gates pendientes, operar un comercio real durante siete días y, si aprueba, habilitar la salida comercial sin exigir otra beta.

**Architecture:** El paquete técnico permanece en una rama local que nunca se publica completa. De él se deriva un bundle web mínimo para `/beta/`, conectado exclusivamente a Supabase QA y aislado del cliente vigente; la evidencia sensible vive fuera de Git. Los gates automatizados, SQL, navegador, concurrencia, offline y restauración preceden al piloto; la aprobación del piloto dispara un plan de corte productivo separado y bloquea un segundo comercio activo hasta sustituir la barrera global F4.3.

**Tech Stack:** HTML/CSS/JavaScript sin build step, Node.js `node:test`, Service Worker/Cache Storage, Supabase Auth/Postgres/Edge Functions, PostgreSQL 15+, PowerShell, Git/GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-05-beta-real-y-salida-comercial-design.md`

## Global Constraints

- La fuente congelada es `MiComercio-F6-PAQUETE-RC1-REV2`, build `6.0.0-f6-rc1`; todo cambio se realiza en una copia nueva `MiComercio-F6-PAQUETE-RC2`.
- El build exigido para el piloto después del arreglo de PIN es `6.0.0-f6-rc2`; la base sigue siendo `5.0.0-f5-rc2`.
- El proyecto de piloto es Supabase QA `qrvdfqpxutymmlcplsal`; producción no recibe escrituras antes de aprobar el piloto.
- La licencia y el lease nominal duran exactamente `604800` segundos; extensiones y compensaciones comparten un máximo adicional de `604800` segundos y rechazan solicitudes completas que excedan el remanente.
- El piloto usa un solo comercio real. No se activa un segundo comercio mientras F4.3 conserve `LOCK TABLE` sobre relaciones compartidas.
- Cada turno se cierra por separado. El total diario es informativo y nunca reemplaza un cierre.
- El sistema es no fiscal y el comercio mantiene su circuito fiscal legal en paralelo.
- El repositorio GitHub continúa público; sólo se publican `beta/index.html`, `beta/sw.js` y la corrección de propiedad de caché en `clientes/sw.js`.
- `CNAME`, `index.html` y `clientes/index.html` no cambian.
- El paquete técnico, SQL, Edge Functions, respaldos, datos comerciales, evidencias privadas, credenciales y tokens nunca se empujan al repositorio público.
- Los archivos de `sources/` son referencia de sólo lectura.
- Toda prueba SQL usa transacciones descartables salvo una migración QA expresamente identificada.
- Ninguna salida de consola, evidencia o commit contiene contraseñas, JWT, service-role keys, peppers ni enlaces de invitación.

## File Map

### Paquete privado RC2

- `MiComercio-F6-PAQUETE-RC2/entregables/MiComercio-F6-PILOTO.html`: cliente F6 corregido y fuente única del bundle público.
- `MiComercio-F6-PAQUETE-RC2/entregables/BUILD-IDENTITY-F6.json`: identidad RC2, build base y cantidades normativas.
- `MiComercio-F6-PAQUETE-RC2/entregables/PILOTO-F6-7-DIAS.md`: bitácora operativa sin datos sensibles.
- `MiComercio-F6-PAQUETE-RC2/entregables/QA-F6-EVIDENCIA.md`: evidencia técnica redactada.
- `MiComercio-F6-PAQUETE-RC2/public/beta/index.html`: copia exacta del cliente que se puede publicar.
- `MiComercio-F6-PAQUETE-RC2/public/beta/sw.js`: service worker propiedad exclusiva de `/beta/`.
- `MiComercio-F6-PAQUETE-RC2/public/clientes/sw.js`: parche mínimo que limita la limpieza al prefijo de caché de `/clientes/`.
- `MiComercio-F6-PAQUETE-RC2/tests/f6-device-pin.test.cjs`: cinco regresiones de protección local.
- `MiComercio-F6-PAQUETE-RC2/tests/beta-publication.test.cjs`: seis regresiones de publicación, caché y secretos.
- `MiComercio-F6-PAQUETE-RC2/supabase/f6/07_pilot_rc2.sql`: migración aditiva que exige RC2 y deja los comercios nuevos en `v4_only` sin legado.
- `MiComercio-F6-PAQUETE-RC2/supabase/baseline/00_f2_f4_production_schema.sql`: baseline de esquema anterior a F5, sin datos.
- `MiComercio-F6-PAQUETE-RC2/supabase/baseline/BASELINE-IDENTITY.json`: hash y fingerprint del baseline.
- `MiComercio-F6-PAQUETE-RC2/scripts/regenerate-manifest.ps1`: regeneración determinista de `SHA256SUMS-F6.txt` con LF.
- `MiComercio-F6-PAQUETE-RC2/scripts/rebuild-clean.ps1`: reconstrucción F2–F6 y ejecución de las 14 suites.
- `MiComercio-F6-PAQUETE-RC2/scripts/run-concurrency.mjs`: carreras reales de invitación y licencia.
- `MiComercio-F6-PAQUETE-RC2/scripts/capture-pilot-snapshot.ps1`: captura diaria redactada y checksum.
- `MiComercio-F6-PAQUETE-RC2/ops/public-release-files.json`: allowlist exacta de archivos publicables.
- `MiComercio-F6-PAQUETE-RC2/ops/PUBLICACION-BETA.md`: runbook de publicación y rollback.
- `MiComercio-F6-PAQUETE-RC2/ops/RESPALDO-Y-RESTAURACION.md`: runbook de dump, restore y comparación.

### Rama pública

- `beta/index.html`: cliente piloto.
- `beta/sw.js`: caché offline de la beta.
- `clientes/sw.js`: conserva el comportamiento existente pero deja de borrar cachés ajenas.

### Evidencia fuera de Git

Todas las ejecuciones usan `MICOMERCIO_PILOT_PRIVATE_DIR`, una ruta obligatoria fuera del repositorio. Allí se guardan dumps, hashes, IDs completos, bitácoras diarias y capturas. Los documentos versionados sólo contienen resultados redactados y conteos.

---

### Task 1: Crear RC2 y cerrar el acceso privilegiado sin PIN

**Files:**
- Create: `MiComercio-F6-PAQUETE-RC2/` como copia byte a byte de `MiComercio-F6-PAQUETE-RC1-REV2/`
- Rename: `MiComercio-F6-PAQUETE-RC2/entregables/MiComercio-F6-PRUEBA.html` → `MiComercio-F6-PAQUETE-RC2/entregables/MiComercio-F6-PILOTO.html`
- Create: `MiComercio-F6-PAQUETE-RC2/tests/f6-device-pin.test.cjs`
- Create: `MiComercio-F6-PAQUETE-RC2/scripts/regenerate-manifest.ps1`
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/MiComercio-F6-PILOTO.html:2558-2590,2793-2940,2450-2470`

**Interfaces:**
- Consumes: sesión Supabase vigente, `f3RolServidorAdmin()`, `deviceId`, `hashPin(pin)` y `verificarHashPbkdf2(pin, stored)`.
- Produces: `f6DevicePinKey(userId, deviceId): string`, `f6LeerDevicePin(): string`, `f6GuardarDevicePin(hash): void`, `f6EstadoProteccionDispositivo(input): 'sin_aplicar'|'requiere_alta'|'requiere_pin'`, `f6AsegurarProteccionDispositivo(): Promise<void>`.

- [ ] **Step 1: Crear la copia de trabajo sin alterar RC1-REV2**

Run:

```powershell
Copy-Item -Recurse -LiteralPath .\MiComercio-F6-PAQUETE-RC1-REV2 -Destination .\MiComercio-F6-PAQUETE-RC2
Move-Item -LiteralPath .\MiComercio-F6-PAQUETE-RC2\entregables\MiComercio-F6-PRUEBA.html -Destination .\MiComercio-F6-PAQUETE-RC2\entregables\MiComercio-F6-PILOTO.html
```

Expected: el SHA-256 del HTML renombrado todavía es `409afeba3ff6f8c0259f42eaf415614e179d2eb245b7b32c06f27c2ddecb610a`; RC1-REV2 permanece limpio en `git status`.

- [ ] **Step 2: Escribir cinco pruebas rojas para la protección del dispositivo**

El test extrae el bloque delimitado `F6_DEVICE_PIN_CORE_START/END` y ejecuta estas reglas:

```js
test('dueño nuevo sin hash exige alta local', () => {
  assert.equal(f6EstadoProteccionDispositivo({authenticated:true, privileged:true, stored:''}), 'requiere_alta');
});
test('admin con hash local exige PIN', () => {
  assert.equal(f6EstadoProteccionDispositivo({authenticated:true, privileged:true, stored:'pbkdf2$150000$a$b'}), 'requiere_pin');
});
test('empleado no recibe privilegios mediante PIN', () => {
  assert.equal(f6EstadoProteccionDispositivo({authenticated:true, privileged:false, stored:''}), 'sin_aplicar');
});
test('la clave local separa usuario y dispositivo', () => {
  assert.notEqual(f6DevicePinKey('user-a','device-1'), f6DevicePinKey('user-a','device-2'));
});
test('verificar sin hash falla cerrado', async () => {
  assert.equal(await verificarPin('1234'), false);
});
```

- [ ] **Step 3: Ejecutar la suite y comprobar el fallo correcto**

Run:

```powershell
Set-Location .\MiComercio-F6-PAQUETE-RC2
node --test tests\f6-device-pin.test.cjs
```

Expected: FAIL porque falta el bloque `F6_DEVICE_PIN_CORE_START`.

- [ ] **Step 4: Implementar almacenamiento local por usuario y dispositivo**

Agregar al HTML:

```js
/* F6_DEVICE_PIN_CORE_START */
function f6DevicePinKey(userId, currentDeviceId){
  return `micomercio:device-pin:${String(userId||'anon')}:${String(currentDeviceId||'WEB')}`;
}
function f6LeerDevicePin(){
  try{return localStorage.getItem(f6DevicePinKey(sesion&&sesion.user&&sesion.user.id,deviceId))||'';}catch(_e){return '';}
}
function f6GuardarDevicePin(value){
  localStorage.setItem(f6DevicePinKey(sesion.user.id,deviceId),String(value));
}
function f6EstadoProteccionDispositivo({authenticated,privileged,stored}){
  if(!authenticated||!privileged)return 'sin_aplicar';
  return String(stored||'').trim()?'requiere_pin':'requiere_alta';
}
/* F6_DEVICE_PIN_CORE_END */
```

`verificarPin(pin)` debe leer primero `f6LeerDevicePin()`, conservar sólo la migración de hashes legacy después de una coincidencia real y terminar con `return false` cuando no exista material verificable.

- [ ] **Step 5: Bloquear siempre las vistas privilegiadas al restaurar una sesión**

`mostrarApp()` llama a `f6AsegurarProteccionDispositivo()` después de `f3Inicializar()` y antes del `render()` final. Para dueño o administrador:

- con hash local, solicita el PIN;
- sin hash local, solicita contraseña actual y PIN nuevo dos veces;
- la contraseña se revalida con `sb.auth.signInWithPassword({email: sesion.user.email, password})`;
- sólo después de reautenticar guarda `await hashPin(pinNuevo)` en la clave local y libera `interfazProtegida`;
- cancelar mantiene `interfazProtegida=true` y permite únicamente la vista operativa ya permitida por el modelo de roles;
- un empleado nunca gana vistas de dueño por conocer un PIN.

El texto de recuperación debe indicar: “Para crear o cambiar el PIN de este dispositivo, confirmá la contraseña de tu cuenta”. No debe prometer que el PIN puede verse desde otro dispositivo.

- [ ] **Step 6: Ejecutar pruebas relacionadas**

Run:

```powershell
node --test tests\f6-device-pin.test.cjs tests\f5-config-proyeccion.test.cjs tests\f5-client.test.cjs tests\f6-onboarding-client.test.cjs
```

Expected: las cinco pruebas nuevas y todas las regresiones indicadas pasan; `pinHash` y `pinDuenio` siguen fuera del payload V4.

- [ ] **Step 7: Crear el regenerador determinista del manifiesto**

El script debe enumerar todos los archivos salvo `SHA256SUMS-F6.txt`, ordenar por ruta relativa con `/`, calcular SHA-256 y escribir UTF-8 sin BOM y con LF. Debe fallar si la raíz resuelta no termina en `MiComercio-F6-PAQUETE-RC2`.

- [ ] **Step 8: Commit**

```powershell
git add MiComercio-F6-PAQUETE-RC2
git commit -m "fix: require local protection on privileged devices"
```

---

### Task 2: Identificar RC2 y hacer `v4_only` nativo para comercios nuevos

**Files:**
- Create: `MiComercio-F6-PAQUETE-RC2/supabase/f6/07_pilot_rc2.sql`
- Modify: `MiComercio-F6-PAQUETE-RC2/supabase/tests/f6_invitations.test.sql`
- Modify: `MiComercio-F6-PAQUETE-RC2/supabase/tests/f6_pilot_gate.test.sql`
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/MiComercio-F6-PILOTO.html`
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/BUILD-IDENTITY-F6.json`
- Modify: `MiComercio-F6-PAQUETE-RC2/tests/f6-package-identity.test.cjs`
- Modify: `MiComercio-F6-PAQUETE-RC2/verificar.ps1`
- Modify: `MiComercio-F6-PAQUETE-RC2/verificar.sh`

**Interfaces:**
- Consumes: `_f6_provisionar_comercio(uuid,uuid,uuid)` y `f6_pilot_gate(uuid,text,boolean,boolean)` existentes.
- Produces: build `6.0.0-f6-rc2`; todo comercio creado por F6 nace con `migraciones_f4.estado='v4_only'`; el gate rechaza RC1.

- [ ] **Step 1: Agregar pruebas SQL rojas**

En `f6_invitations.test.sql`, después de consumir una invitación, exigir:

```sql
if (select estado from public.migraciones_f4 where comercio_id=v_comercio_id) <> 'v4_only' then
  raise exception 'F6_NEW_COMMERCE_NOT_V4_ONLY';
end if;
```

En `f6_pilot_gate.test.sql`, reemplazar el build válido por `6.0.0-f6-rc2` y agregar una llamada con RC1 que devuelva `ready=false`.

- [ ] **Step 2: Ejecutar las suites contra las migraciones 01–06**

Expected: invitaciones falla con `F6_NEW_COMMERCE_NOT_V4_ONLY` y el gate falla porque todavía espera RC1.

- [ ] **Step 3: Escribir la migración aditiva `07_pilot_rc2.sql`**

La migración vuelve a definir `_f6_provisionar_comercio` conservando todas sus validaciones y, dentro de la misma transacción que crea comercio, licencia y onboarding, agrega:

```sql
insert into public.migraciones_f4(
  comercio_id,estado,f43_version,f43_cutover_at,f43_cutover_by,
  f43_legacy_user_id,f43_legacy_revision,f43_legacy_sha256,f43_rollback_until
) values (
  v_comercio_id,'v4_only','4.3.0-qa3',statement_timestamp(),p_owner_user_id,
  p_owner_user_id,0,encode(extensions.digest(convert_to('{}','UTF8'),'sha256'),'hex'),
  statement_timestamp()
);
```

El `rollback_until` igual al instante de creación expresa que un comercio nacido en V4 no tiene legado al cual volver. Un reintento idempotente no crea una segunda fila.

La misma migración vuelve a definir `f6_pilot_gate` con `v_expected_build := '6.0.0-f6-rc2'`, preserva firma y privilegios, y no modifica las migraciones 01–06 ya aplicadas.

- [ ] **Step 4: Cambiar la identidad del cliente**

Actualizar `MICOMERCIO_BUILD.build`, el JSON y el test de identidad a `6.0.0-f6-rc2`. Mantener `base_build='5.0.0-f5-rc2'`, contratos `f5-projection-v1`, `10-canonical+6-legacy-only` y `f6-license-v1`.

El conteo temporal queda en 107 pruebas locales y 14 suites SQL. Los verificadores deben esperar siete migraciones F6.

- [ ] **Step 5: Ejecutar en una transacción descartable**

Aplicar F6 01–07 y ejecutar las suites de invitaciones y pilot gate. Expected: ambas PASS y `ROLLBACK` deja cero fixtures.

- [ ] **Step 6: Aplicar `07_pilot_rc2.sql` en QA**

Antes: ejecutar las 14 suites contra el esquema persistente. Aplicar una migración con nombre `f6_rc2_07_pilot_identity_and_native_v4_qa`. Después: repetir las 14 suites y comprobar que las funciones públicas conservan sus grants exactos.

- [ ] **Step 7: Regenerar manifiesto y verificar el paquete**

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\regenerate-manifest.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\verificar.ps1
```

Expected: cobertura exacta, siete migraciones F6, 14 suites SQL, 107/107 pruebas y cero secretos.

- [ ] **Step 8: Commit**

```powershell
git add MiComercio-F6-PAQUETE-RC2
git commit -m "feat: identify F6 RC2 and provision new commerce in V4"
```

---

### Task 3: Construir el bundle público y aislar los cachés

**Files:**
- Create: `MiComercio-F6-PAQUETE-RC2/public/beta/index.html`
- Create: `MiComercio-F6-PAQUETE-RC2/public/beta/sw.js`
- Create: `MiComercio-F6-PAQUETE-RC2/public/clientes/sw.js`
- Create: `MiComercio-F6-PAQUETE-RC2/ops/public-release-files.json`
- Create: `MiComercio-F6-PAQUETE-RC2/ops/PUBLICACION-BETA.md`
- Create: `MiComercio-F6-PAQUETE-RC2/tests/beta-publication.test.cjs`
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/BUILD-IDENTITY-F6.json`
- Modify: `MiComercio-F6-PAQUETE-RC2/verificar.ps1`
- Modify: `MiComercio-F6-PAQUETE-RC2/verificar.sh`

**Interfaces:**
- Consumes: `MiComercio-F6-PILOTO.html` RC2 y `clientes/sw.js` de `origin/main`.
- Produces: allowlist pública exacta y dos service workers que sólo eliminan cachés de su propio producto/ruta.

- [ ] **Step 1: Escribir seis pruebas rojas de publicación**

```js
test('el HTML público coincide byte a byte con el piloto RC2', () => { /* SHA-256 iguales */ });
test('el HTML público apunta sólo a QA y expone build RC2', () => { /* QA presente; producción ausente */ });
test('la beta registra sw.js relativo y no toma scope raíz', () => { /* register("sw.js") */ });
test('el SW beta usa micomercio-beta-6.0.0-f6-rc2', () => { /* cache exacta */ });
test('cada SW borra únicamente cachés con su prefijo', () => { /* no filter(k => k !== CACHE) global */ });
test('la allowlist contiene sólo tres rutas y ninguna evidencia', () => { /* deepEqual exacto */ });
```

Run: `node --test tests\beta-publication.test.cjs`  
Expected: FAIL porque todavía no existe `public/beta/index.html`.

- [ ] **Step 2: Copiar el HTML público byte a byte**

`public/beta/index.html` debe ser idéntico a `entregables/MiComercio-F6-PILOTO.html`; no se mantiene una segunda versión editable.

- [ ] **Step 3: Crear el service worker beta con propiedad de prefijo**

Usar:

```js
const CACHE_PREFIX='micomercio-beta-';
const CACHE='micomercio-beta-6.0.0-f6-rc2';
const BASE=['./','./index.html'];
```

En `activate`, borrar sólo `key.startsWith(CACHE_PREFIX) && key!==CACHE`. Mantener Supabase fuera del caché y conservar estrategia network-first para la página propia.

- [ ] **Step 4: Corregir la limpieza del SW vigente sin cambiar su función**

Copiar `origin/main:clientes/sw.js` a `public/clientes/sw.js`, definir `CACHE_PREFIX='kiosco-'` y reemplazar la limpieza global por:

```js
caches.keys().then(keys => Promise.all(
  keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE)
      .map(key => caches.delete(key))
))
```

Esto conserva `kiosco-v1` y evita que `/clientes/` borre la caché beta. No tocar `clientes/index.html`.

- [ ] **Step 5: Fijar la allowlist pública**

`ops/public-release-files.json` contiene exactamente:

```json
[
  "beta/index.html",
  "beta/sw.js",
  "clientes/sw.js"
]
```

El runbook exige que `git diff --name-only origin/main...HEAD` coincida exactamente con ese conjunto y que `CNAME`, `index.html` y `clientes/index.html` tengan el mismo SHA-256 que `origin/main`.

- [ ] **Step 6: Ejecutar pruebas y actualizar identidad**

Expected: `beta-publication.test.cjs` 6/6 PASS. Actualizar el conteo normativo de 107 a 113 en HTML/JSON, test de identidad y ambos verificadores.

- [ ] **Step 7: Regenerar el manifiesto y verificar en frío**

Extraer una copia del paquete a un directorio temporal nuevo y ejecutar `verificar.ps1`. Expected: 113/113, 14 suites SQL, siete migraciones F6, cobertura completa, sintaxis OK y cero secretos.

- [ ] **Step 8: Commit**

```powershell
git add MiComercio-F6-PAQUETE-RC2
git commit -m "feat: prepare isolated public beta bundle"
```

---

### Task 4: Reconstruir F2–F6 desde cero

**Files:**
- Create: `MiComercio-F6-PAQUETE-RC2/supabase/baseline/00_f2_f4_production_schema.sql`
- Create: `MiComercio-F6-PAQUETE-RC2/supabase/baseline/BASELINE-IDENTITY.json`
- Create: `MiComercio-F6-PAQUETE-RC2/scripts/rebuild-clean.ps1`
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/SQL-REPRODUCIBILIDAD-F6.md`
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/QA-F6-EVIDENCIA.md`

**Interfaces:**
- Consumes: fingerprint productivo aprobado, esquema productivo anterior a F5, F5 01–07, F6 01–07 y 14 suites SQL.
- Produces: un baseline sin datos y un comando único que termina con `14/14 PASS` desde una base vacía.

- [ ] **Step 1: Verificar que producción sigue siendo el baseline anterior a F5**

Ejecutar sólo lecturas y comparar el fingerprint actual con `MiComercio-QA-F43-bootstrap-v0.1.2/EXPECTED_PROD_FINGERPRINT.json`. Si difiere, detener esta task: no se genera baseline desde un origen desconocido.

- [ ] **Step 2: Exportar únicamente esquema**

Con `MICOMERCIO_PROD_DB_URL` provisto fuera de Git:

```powershell
supabase db dump --db-url $env:MICOMERCIO_PROD_DB_URL --schema public,private --file .\supabase\baseline\00_f2_f4_production_schema.sql
```

El archivo no incluye filas, owners, ACL dependientes del host ni secretos. Ejecutar el escáner del paquete antes de continuar.

- [ ] **Step 3: Crear la identidad del baseline**

`BASELINE-IDENTITY.json` registra el SHA-256 medido del SQL, el SHA-256 del fingerprint esperado, `source_stage: "production-pre-f5"`, `data_rows: 0` y la versión PostgreSQL observada. El regenerador inserta hashes medidos; nunca se escribe un valor inventado.

- [ ] **Step 4: Escribir el runner de reconstrucción**

`rebuild-clean.ps1` debe:

1. exigir `psql` y una URL `MICOMERCIO_REBUILD_DB_URL` que no coincida con QA ni producción;
2. comprobar que no existen tablas de negocio;
3. aplicar el baseline F2–F4;
4. aplicar F5 01–07 en orden;
5. aplicar F6 01–07 en orden;
6. ejecutar las 14 suites, cada una dentro de su propio proceso con `ON_ERROR_STOP=1`;
7. contar resultados reales y fallar si no son exactamente 14 PASS;
8. emitir un JSON redactado con versión, hashes y conteos, sin URL ni credenciales.

- [ ] **Step 5: Ejecutar primero contra una base que no tiene baseline**

Expected: FAIL antes de F5 por objetos F2–F4 ausentes. Esta corrida acredita que el test no puede dar PASS vacío.

- [ ] **Step 6: Ejecutar desde una base vacía con el baseline**

Expected: esquema base aplicado, F5/F6 aplicados y 14/14 suites PASS. Destruir únicamente la base descartable verificada; no tocar QA ni producción.

- [ ] **Step 7: Registrar evidencia reproducible**

Actualizar `SQL-REPRODUCIBILIDAD-F6.md` con el comando exacto, hashes, versión de PostgreSQL y resultado medido. Cambiar el gate de baseline a PASS sólo después de reproducirlo una segunda vez desde otro directorio limpio.

- [ ] **Step 8: Verificar paquete y commit**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\regenerate-manifest.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\verificar.ps1
git add MiComercio-F6-PAQUETE-RC2
git commit -m "test: make the F2 to F6 baseline reproducible"
```

---

### Task 5: Publicar `/beta/` sin exponer el paquete técnico

**Files:**
- Copy to public branch: `beta/index.html`
- Copy to public branch: `beta/sw.js`
- Modify on public branch: `clientes/sw.js`
- Do not copy: any other file from `MiComercio-F6-PAQUETE-RC2/`

**Interfaces:**
- Consumes: bundle público verificado, repositorio `gallovalentinn-droid/Sistema-para-comercios`, secreto QA `F6_ALLOWED_ORIGINS`.
- Produces: `https://micomercio.ar/beta/` conectado a QA, sin enlace desde la portada.

- [ ] **Step 1: Crear un worktree limpio desde `origin/main`**

Invocar primero `superpowers:using-git-worktrees`. Crear la rama `beta/f6-rc2-public` desde `origin/main`; no basarla en `qa/f6-rc1-rev2`, porque esa rama contiene el paquete interno.

- [ ] **Step 2: Copiar sólo la allowlist**

Copiar los dos archivos `public/beta/*` y sustituir `clientes/sw.js` por la copia controlada. Comprobar:

```powershell
git diff --name-only origin/main...HEAD
```

Expected, sin rutas adicionales:

```text
beta/index.html
beta/sw.js
clientes/sw.js
```

- [ ] **Step 3: Ejecutar escaneo público**

Buscar service-role keys, JWT, peppers, contraseñas, correos internos, SQL, `.env`, dumps y referencias a directorios locales. Expected: cero coincidencias. Confirmar que el HTML contiene QA `qrvdfqpxutymmlcplsal` y no producción `zzpmdiivewmvhiszmdzh`.

- [ ] **Step 4: Configurar CORS QA para el origen real**

Cambiar `F6_ALLOWED_ORIGINS` a exactamente `https://micomercio.ar`; quitar `null`. Desplegar de nuevo `f6-invitations` y `f6-support` sin cambiar código y probar:

- OPTIONS desde `https://micomercio.ar` → 204 con ese mismo origen;
- origen distinto → 403 `ORIGEN_NO_PERMITIDO`;
- soporte sin JWT → 401;
- preview inexistente → respuesta genérica no enumerable.

- [ ] **Step 5: Commit y push de la rama pública**

```powershell
git add beta/index.html beta/sw.js clientes/sw.js
git commit -m "feat: publish isolated F6 beta client"
git push -u origin beta/f6-rc2-public
```

- [ ] **Step 6: Revisar y fusionar sin tocar el sitio vigente**

Revisar el diff remoto y fusionar sólo esos tres archivos a `main`. Confirmar que los hashes de `CNAME`, `index.html` y `clientes/index.html` no cambiaron.

- [ ] **Step 7: Smoke live**

Abrir `/clientes/` y `/beta/` en perfiles limpios. Expected:

- `/clientes/` sigue usando producción;
- `/beta/` usa QA y build RC2;
- ninguna está enlazada con la otra;
- ambas cargan offline después de una carga online;
- abrir una no borra la caché de la otra;
- sin sesión, `/beta/` no muestra información de comercio.

- [ ] **Step 8: Registrar rollback**

El rollback público revierte el commit de tres archivos; el rollback de CORS restaura el origen anterior sólo después de retirar `/beta/`. Guardar los hashes antes/después en la evidencia privada.

---

### Task 6: Cerrar el gate real de `v4_only`

**Files:**
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/QA-F6-EVIDENCIA.md`
- Write outside Git: `$env:MICOMERCIO_PILOT_PRIVATE_DIR/v4-only-browser.json`

**Interfaces:**
- Consumes: cadena F3.4 → F4.1 → F4.2 → F4.3, build RC2 en `/beta/`, comercio técnico `F5_PROJECTION_QA` y un perfil limpio.
- Produces: evidencia persistente de `v4_only`, recarga post-fence, proyección mínima y aislamiento del comercio de control.

- [ ] **Step 1: Preparar el comercio técnico aislado**

Crear un usuario Auth exclusivo sin otra membresía. Ejecutar la fase 1 de `f5_v4only_fixture.sql` con su UUID y confirmar comercio, caja y dispositivo únicos.

- [ ] **Step 2: Generar evidencia shadow desde navegador**

Entrar por `/beta/`, completar al menos 20 comparaciones reales de configuración, cerrar turnos abiertos y dejar outbox en cero. Capturar el hash de snapshot calculado por el cliente, no inventarlo en SQL.

- [ ] **Step 3: Ejecutar la cadena normativa**

Con el hash real, ejecutar en orden:

```text
preflight_cutover_f34
registrar_snapshot_migracion_f4
habilitar_bootstrap_candidato_f42
registrar_prueba_bootstrap_f42
registrar_preparacion_f43
activar_v4_only_f43
```

Expected: cada paso confirma antes del siguiente; `activar_v4_only_f43` devuelve `estado='v4_only'`.

- [ ] **Step 4: Recargar el navegador y probar la proyección**

Cerrar y abrir la pestaña, autenticar, completar loader post-fence y full pull. Verificar por filas/IDs que las 22 colecciones declaradas se limitan al manifiesto y que la config de dueño contiene las 10 claves canónicas sin `pin_hash` ni `permisos_empleado`.

- [ ] **Step 5: Verificar aislamiento y rollback loader sin ejecutar rollback**

Confirmar que `COV_QA_COMERCIO_01` conserva su estado previo y que el usuario técnico no ve sus datos. Ejecutar las regresiones de `baseLoad` y comprobar que la ventana de rollback queda registrada, pero no revertir el comercio que acredita el gate.

- [ ] **Step 6: Registrar evidencia mínima**

Guardar comercio/dispositivo, build observado, timestamps, hashes, conteos y resultado de cada RPC. No guardar JWT ni credenciales. Marcar el gate `v4_only` como PASS en `QA-F6-EVIDENCIA.md`.

- [ ] **Step 7: Commit documental**

```powershell
git add MiComercio-F6-PAQUETE-RC2/entregables/QA-F6-EVIDENCIA.md MiComercio-F6-PAQUETE-RC2/SHA256SUMS-F6.txt
git commit -m "test: record the real V4-only browser gate"
```

---

### Task 7: Ejecutar concurrencia real de invitación y licencia

**Files:**
- Create: `MiComercio-F6-PAQUETE-RC2/scripts/run-concurrency.mjs`
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/QA-F6-EVIDENCIA.md`
- Write outside Git: `$env:MICOMERCIO_PILOT_PRIVATE_DIR/concurrency-result.json`

**Interfaces:**
- Consumes: dos conexiones HTTP reales, token de invitación de un solo uso, sesión de soporte, licencia con saldo adicional completo.
- Produces: resultado redactado con exactamente un ganador en cada carrera y estado final leído del servidor.

- [ ] **Step 1: Implementar el runner sin logging de secretos**

El script recibe secretos sólo por variables de entorno y ejecuta cada carrera con `Promise.allSettled`. La salida permitida es:

```js
{
  invitation: { successCount, rejectedCount, comercioIds },
  license: { successCount, rejectedCount, extensionUsedSeconds },
  checkedAt: new Date().toISOString()
}
```

No serializa request headers, token, email ni cuerpos completos.

- [ ] **Step 2: Carrera de invitación**

Enviar dos consumos simultáneos del mismo token, usuario e idempotency key desde procesos HTTP independientes. Expected: una provisión efectiva, el reintento devuelve el mismo `comercio_id`, una sola membresía de dueño y una sola licencia; cero comercios duplicados.

- [ ] **Step 3: Carrera de licencia**

Sobre una licencia de prueba con saldo adicional de siete días, enviar dos extensiones simultáneas de cinco días con idempotency keys distintas. Expected: una mutación exitosa, una respuesta `F6_EXTENSION_SUPERA_SALDO`, `extension_used_seconds=432000` y ningún recorte parcial.

- [ ] **Step 4: Probar reintentos**

Repetir cada request con su misma idempotency key. Expected: mismo resultado lógico, sin consumo o eventos adicionales.

- [ ] **Step 5: Ejecutar y registrar**

Guardar sólo el JSON redactado en el directorio privado. Actualizar la evidencia versionada con conteos y timestamp, sin identificadores completos.

- [ ] **Step 6: Commit**

```powershell
git add MiComercio-F6-PAQUETE-RC2/scripts/run-concurrency.mjs MiComercio-F6-PAQUETE-RC2/entregables/QA-F6-EVIDENCIA.md MiComercio-F6-PAQUETE-RC2/SHA256SUMS-F6.txt
git commit -m "test: verify F6 concurrency against QA"
```

---

### Task 8: Recorrer F6 completo antes de usar datos reales

**Files:**
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/QA-F6-EVIDENCIA.md`
- Write outside Git: `$env:MICOMERCIO_PILOT_PRIVATE_DIR/prepilot-browser.json`

**Interfaces:**
- Consumes: `/beta/`, soporte F6, invitación, Auth, onboarding, licencia, cierres por turno, lease y outbox.
- Produces: dry run completo en un comercio descartable y `f6_pilot_gate(...).ready=true`.

- [ ] **Step 1: Emitir una invitación descartable**

Desde soporte, crear una invitación con comercio, zona horaria y corte comercial. Abrirla en perfil limpio y comprobar preview genérico.

- [ ] **Step 2: Probar corte y reanudación del onboarding**

Crear el acceso, completar dos pasos, cerrar la pestaña, volver a entrar y confirmar que reanuda en el tercer paso sin repetir escrituras.

- [ ] **Step 3: Completar onboarding**

Cargar caja y producto, omitir únicamente empleados/clientes, ejecutar la simulación sin efectos y activar la licencia. Expected: `valid_until-valid_from=604800`, una licencia y un evento de activación.

- [ ] **Step 4: Verificar dispositivo nuevo y `v4_only` nativo**

Expected: la fila `migraciones_f4` ya está en `v4_only`; el dueño debe reautenticarse y crear PIN local antes de liberar vistas privilegiadas; recargar exige el PIN local.

- [ ] **Step 5: Ejecutar dos turnos online el mismo día**

Abrir, vender, cerrar; volver a abrir, vender con otro medio de pago y cerrar. Expected: dos sesiones/cierres diferentes, Resumen lista ambos y el total diario sólo suma ventas/cantidades.

- [ ] **Step 6: Ejecutar el escenario offline**

Abrir un turno con lease válido, desconectar de forma controlada, crear una venta, un pago de fiado, un egreso y cerrar el turno. Confirmar la advertencia específica; abrir el turno siguiente con el mismo lease; reconectar y esperar drenaje completo.

Expected: outbox local cero, operaciones procesadas sin duplicados, destinos de sesión/segmento correctos y cierre provisional en `requiere_conciliacion` cuando corresponda.

- [ ] **Step 7: Ejecutar el gate del piloto**

```sql
select public.f6_pilot_gate(
  :'pilot_comercio_id',
  '6.0.0-f6-rc2',
  true,
  true
);
```

Ejecutar con `psql -v pilot_comercio_id="$env:MICOMERCIO_DRY_RUN_COMMERCE_ID"`. Expected: `ready=true` y seis checks `ok=true`. El identificador real se inyecta en la consola privada y no se copia al documento público.

- [ ] **Step 8: Eliminar sólo el fixture descartable mediante su procedimiento documentado**

Primero exportar evidencia y verificar los IDs exactos. No usar deletes amplios ni patrones; la cuenta Auth, comercio y filas relacionadas se eliminan únicamente si todos pertenecen al fixture.

- [ ] **Step 9: Commit documental**

Regenerar el manifiesto, ejecutar 113/113 y 14/14, y registrar el dry run como PASS.

---

### Task 9: Probar respaldo y restauración antes del piloto

**Files:**
- Create: `MiComercio-F6-PAQUETE-RC2/ops/RESPALDO-Y-RESTAURACION.md`
- Create: `MiComercio-F6-PAQUETE-RC2/scripts/capture-pilot-snapshot.ps1`
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/PILOTO-F6-7-DIAS.md`
- Write outside Git: `$env:MICOMERCIO_PILOT_PRIVATE_DIR/backups/`

**Interfaces:**
- Consumes: URL de base QA fuera de Git, `pg_dump`, `pg_restore`, comercio piloto y almacenamiento local exportado.
- Produces: dump cifrado/privado, SHA-256, inventario por tabla y restauración demostrada en una base descartable.

- [ ] **Step 1: Crear el inventario de recuperación**

El runbook incluye esquemas `auth`, `public` y `private`; las 22 colecciones de proyección; membresías; licencias; leases; sesiones; segmentos; cierres; excepciones; onboarding y eventos F6. Excluye rate-limit efímero y secretos administrados por la plataforma.

- [ ] **Step 2: Crear el script de snapshot redactado**

`capture-pilot-snapshot.ps1` recibe `-CommerceId` y `-EvidenceDir`, rechaza una ruta dentro del repositorio y emite sólo conteos, máximos de timestamps, estados y hashes. Nunca emite nombres de clientes, productos o payloads.

- [ ] **Step 3: Generar el dump lógico inicial**

Con `MICOMERCIO_QA_DB_URL` fuera de Git:

```powershell
pg_dump --format=custom --no-owner --no-acl --schema=auth --schema=public --schema=private --file "$env:MICOMERCIO_PILOT_PRIVATE_DIR\backups\qa-inicial.dump" $env:MICOMERCIO_QA_DB_URL
Get-FileHash "$env:MICOMERCIO_PILOT_PRIVATE_DIR\backups\qa-inicial.dump" -Algorithm SHA256
```

- [ ] **Step 4: Restaurar en una base vacía descartable**

Aplicar roles/extensiones administradas requeridas, restaurar con `pg_restore --exit-on-error --single-transaction` y ejecutar el snapshot de conteos. Expected: hash del dump estable y conteos iguales al origen para el comercio seleccionado.

- [ ] **Step 5: Probar el backup local del cliente**

Exportar desde la UI, importar en un perfil limpio desconectado de QA y comprobar productos, clientes, stock, ventas, pagos, egresos y cierres por conteos y totales. No subir el archivo a Git.

- [ ] **Step 6: Actualizar el gate**

`PILOTO-F6-7-DIAS.md` marca “Respaldo inicial creado y recuperable” como PASS e incluye sólo timestamp, SHA-256 y resultado de restauración.

- [ ] **Step 7: Commit**

```powershell
git add MiComercio-F6-PAQUETE-RC2/ops MiComercio-F6-PAQUETE-RC2/scripts/capture-pilot-snapshot.ps1 MiComercio-F6-PAQUETE-RC2/entregables/PILOTO-F6-7-DIAS.md MiComercio-F6-PAQUETE-RC2/SHA256SUMS-F6.txt
git commit -m "docs: make pilot backup and restore reproducible"
```

---

### Task 10: Incorporar el comercio real y abrir el día 0

**Files:**
- Modify privately: `$env:MICOMERCIO_PILOT_PRIVATE_DIR/PILOTO-F6-7-DIAS-REAL.md`
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/PILOTO-F6-7-DIAS.md` sólo con estado redactado

**Interfaces:**
- Consumes: todos los gates en PASS, invitación interna, dueño real, datos iniciales y respaldo recuperable.
- Produces: licencia activa de siete días, comercio operativo y línea base firmada por conteos/hashes.

- [ ] **Step 1: Ejecutar el preflight final**

Repetir 113/113, 14/14, smoke de `/clientes/`, smoke de `/beta/`, CORS, build RC2, `v4_only`, PIN, concurrencia y restore. Si uno falla, no emitir invitación real.

- [ ] **Step 2: Registrar aceptación no fiscal**

El dueño confirma antes del alta que MiComercio no reemplaza facturación/ticket fiscal y que mantendrá ese circuito en paralelo.

- [ ] **Step 3: Emitir y consumir la invitación real**

Entregar el enlace por un canal privado. No copiarlo a la bitácora. El dueño crea su acceso, reanuda el asistente si hay corte y completa los siete pasos.

- [ ] **Step 4: Configurar el dispositivo principal**

El dueño confirma su contraseña, crea el PIN local del dispositivo y verifica que un reload mantiene bloqueadas las vistas privilegiadas hasta introducirlo.

- [ ] **Step 5: Cargar la línea base comercial**

Cargar productos/rubros, stock inicial, clientes, fiado inicial y fondos de caja. Comparar conteos y totales con el inventario del comercio antes de iniciar ventas.

- [ ] **Step 6: Activar y medir la licencia**

Registrar `valid_from`, `valid_until` y diferencia calculada. Expected: exactamente `604800` segundos y estado efectivo `activa`.

- [ ] **Step 7: Crear el respaldo de día 0**

Generar dump, backup local, hashes y snapshot de conteos. Restaurar una vez antes de autorizar la primera venta real.

- [ ] **Step 8: Abrir la primera caja**

Registrar sesión, dispositivo, fondo inicial y hora. El inicio oficial del piloto es el `valid_from` del servidor, no la hora anotada manualmente.

---

### Task 11: Operar y vigilar los siete días

**Files:**
- Modify privately each day: `$env:MICOMERCIO_PILOT_PRIVATE_DIR/PILOTO-F6-7-DIAS-REAL.md`
- Append privately: `$env:MICOMERCIO_PILOT_PRIVATE_DIR/snapshots/day-N.json`

**Interfaces:**
- Consumes: comercio real activo, panel de soporte, backup y procedimiento de freeze.
- Produces: siete registros diarios, uso de todos los módulos, escenario offline y cero incidentes críticos abiertos.

- [ ] **Step 1: Ejecutar el control de apertura diario**

Verificar licencia/lease, build, última sincronización, outbox y ausencia de sesión huérfana antes de la primera venta.

- [ ] **Step 2: Usar todos los módulos durante la semana**

Registrar al menos una evidencia de productos/rubros, pedido, venta por cada medio de pago, cliente, fiado, pago, egreso, Movimientos en cuentas, empleado/permiso, caja y Resumen. La evidencia usa IDs/conteos, no contenido comercial completo.

- [ ] **Step 3: Cerrar cada turno de forma individual**

Por cada cambio de turno: cerrar la sesión actual, registrar diferencia, verificar el cierre en servidor y recién entonces abrir la siguiente. En al menos un día deben existir dos cierres independientes y un consolidado diario correcto.

- [ ] **Step 4: Ejecutar el corte offline controlado**

En un horario acordado y con respaldo reciente, realizar venta, pago de fiado, egreso, cierre, segundo turno y reconexión. No borrar storage ni recargar compulsivamente durante el drenaje.

- [ ] **Step 5: Capturar el cierre diario**

Registrar turnos, ventas/totales por medio, variación de stock, fiado/pagos, egresos, outbox, sincronización, conciliaciones, licencia/lease, acciones de soporte e incidentes. Generar respaldo y SHA-256.

- [ ] **Step 6: Aplicar la regla de detención**

Ante diferencia inexplicable, pérdida/duplicación, cierre incorrecto, operación sin destino, bypass de permiso, outbox sin drenar, backup irrecuperable o build distinto: pasar a sólo lectura, conservar estado y detener nuevas operaciones. No continuar por conveniencia.

- [ ] **Step 7: Resolver sin alterar datos comerciales desde soporte**

Soporte sólo diagnostica y usa comandos autorizados. Una corrección de datos requiere procedimiento específico, respaldo previo, evidencia de IDs y revisión separada; el panel de soporte no se amplía para editar ventas o stock.

---

### Task 12: Cerrar el piloto y emitir la decisión

**Files:**
- Modify privately: `$env:MICOMERCIO_PILOT_PRIVATE_DIR/PILOTO-F6-7-DIAS-REAL.md`
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/PILOTO-F6-7-DIAS.md`
- Modify: `MiComercio-F6-PAQUETE-RC2/entregables/QA-F6-EVIDENCIA.md`

**Interfaces:**
- Consumes: siete días de evidencia, estado servidor/cliente, respaldo final y suites frescas.
- Produces: exactamente uno de `aprobado`, `repetir_escenario` o `rechazado`.

- [ ] **Step 1: Cerrar todos los turnos**

Expected: cero sesiones abiertas; cada cierre conserva su sesión/segmento; el total diario no sustituye cierres.

- [ ] **Step 2: Drenar y conciliar**

Expected: outbox local cero, cero operaciones en `procesando`, cero operaciones válidas sin destino y toda excepción resuelta o explicada.

- [ ] **Step 3: Crear y restaurar el respaldo final**

Comparar conteos, sumas económicas y stock entre origen y restauración. Una restauración que falla impide `aprobado`.

- [ ] **Step 4: Repetir las pruebas frescas**

Expected: 113/113 pruebas locales, 14/14 suites SQL desde base limpia, navegador online/offline, CORS y build RC2 en PASS.

- [ ] **Step 5: Evaluar criterios objetivos**

`aprobado` exige simultáneamente cero pérdida, cero diferencias sin explicación, cero fallas críticas de autoridad/aislamiento, cierres independientes, drenaje completo y restore exitoso. Si sólo falla un escenario corregible, usar `repetir_escenario`; si afecta integridad no recuperable, usar `rechazado`.

- [ ] **Step 6: Registrar la decisión**

La evidencia versionada contiene resultado, fecha, responsable, conteos y hashes redactados. Los detalles reales permanecen fuera de Git.

- [ ] **Step 7: Commit del cierre técnico**

Sólo después de un resultado medido:

```powershell
git add MiComercio-F6-PAQUETE-RC2
git commit -m "docs: record the seven-day pilot result"
```

---

### Task 13: Preparar el corte productivo y el inicio comercial si el resultado es `aprobado`

**Files:**
- Create after PASS: `docs/superpowers/specs/2026-09-05-f5-f6-production-cutover-design.md`
- Create after approval of that spec: `docs/superpowers/plans/2026-09-05-f5-f6-production-cutover.md`
- Write outside Git: `$env:MICOMERCIO_PILOT_PRIVATE_DIR/migration/`

**Interfaces:**
- Consumes: acta `aprobado`, backup QA restaurable, fingerprint de producción, build RC2 y datos reales del comercio piloto.
- Produces: corte productivo verificable, migración del comercio piloto y habilitación comercial; no exige otra beta funcional.

- [ ] **Step 1: Congelar el candidato aprobado**

Registrar commit, SHA-256 del HTML, manifiesto, migrations, Edge Functions y backups. No aceptar cambios funcionales entre el piloto y producción; cualquier cambio funcional crea un nuevo candidato y repite el escenario afectado.

- [ ] **Step 2: Diseñar la migración conjunta F5+F6**

El diseño de corte debe incluir preflight, orden completo F2–F6, mapeo de identidad Auth QA→producción, exportación/importación por `comercio_id`, conteos/hashes por tabla, ventana de sólo lectura, rollback, DNS/rutas y smoke post-corte.

Debe resolver o aceptar de forma expresa, con evidencia actualizada, los cinco avisos RLS sobre tablas privadas F5 y la falta de índice de la FK `f6_invitaciones.replaced_by`. Ningún aviso histórico se da por vigente o resuelto sin volver a consultar los asesores sobre el candidato final.

- [ ] **Step 3: Crear el plan ejecutable de producción**

Usar `superpowers:writing-plans` después de aprobar el diseño de corte. Cada escritura productiva debe tener preflight, backup, transacción o compensación, resultado esperado y rollback explícito.

- [ ] **Step 4: Iniciar comercialización**

El resultado `aprobado` habilita comunicar, ofrecer y contratar MiComercio. El material comercial lo describe como sistema operativo no fiscal y no promete alta inmediata de un segundo comercio hasta cerrar Task 14.

- [ ] **Step 5: Ejecutar el corte bajo el plan aprobado**

Migrar primero el comercio piloto, verificarlo contra QA y habilitarlo en producción. No reemplazar datos productivos existentes ni reutilizar UUID sin preflight de colisión.

---

### Task 14: Sustituir la barrera global antes del segundo comercio activo

**Files:**
- Create: `docs/superpowers/specs/2026-09-05-f43-multitenant-write-barrier-design.md`
- Create after approval: `docs/superpowers/plans/2026-09-05-f43-multitenant-write-barrier.md`

**Interfaces:**
- Consumes: todos los escritores canónicos F5/F6 y la barrera F4.3 actual.
- Produces: aislamiento por `comercio_id` demostrado con dos comercios concurrentes; elimina `LOCK TABLE` global.

- [ ] **Step 1: Mantener el gate comercial**

Hasta completar esta task, soporte impide activar un segundo comercio y registra la razón `F43_MULTI_TENANT_BARRIER_PENDING`. Vender o contratar está permitido; activar operación simultánea no.

- [ ] **Step 2: Diseñar una barrera lógica por comercio**

La opción recomendada es un lock advisory compartido/exclusivo derivado de una única función canónica de `comercio_id`: todos los escritores toman lock compartido y prepare/rollback toman lock exclusivo. El diseño debe enumerar todos los RPC escritores y demostrar que no queda DML directo fuera de la barrera.

- [ ] **Step 3: Probar dos comercios en paralelo**

El test bloquea el comercio A durante prepare y ejecuta escrituras en A y B. Expected: A espera o falla dentro del timeout de 15 segundos; B continúa sin espera material; no hay mezcla de datos.

- [ ] **Step 4: Autorizar el segundo comercio**

Sólo después de migración, pruebas concurrentes y smoke productivo se retira el gate `F43_MULTI_TENANT_BARRIER_PENDING`. Esto es escalamiento técnico posterior al PASS, no una segunda beta general.

---

## Final Verification Matrix

Antes de declarar terminado el plan deben existir resultados medidos para:

| Área | Resultado exigido |
|---|---|
| Paquete RC2 | manifiesto exacto, sintaxis OK, cero secretos |
| Pruebas locales | 113/113 PASS |
| SQL limpio | 14/14 PASS desde cero |
| Build | cliente y gate `6.0.0-f6-rc2` |
| Dispositivo nuevo | reautenticación + PIN local; sin hash falla cerrado |
| Publicación | sólo tres archivos públicos; sitio vigente intacto |
| Caché | beta y clientes sobreviven sin borrarse mutuamente |
| `v4_only` | cadena real y recarga de navegador PASS |
| F6 | invitación, onboarding, licencia, dos turnos PASS |
| Concurrencia | un resultado efectivo por carrera |
| Offline | cuatro operaciones, segundo turno y drenaje PASS |
| Respaldo | dump y backup local restaurados |
| Piloto | siete días, todos los criterios de salida PASS |
| Comercial | decisión `aprobado` registrada; sin segunda beta |
| Multi-tenant | segundo comercio bloqueado hasta reemplazar barrera global |

## Execution Boundary

Este plan no autoriza a improvisar cambios productivos. Las Tasks 1–12 preparan y ejecutan la beta en QA y la ruta pública aislada. Un PASS en Task 12 da por listo el producto y habilita comercialización; la escritura en producción sigue el diseño y plan de corte específicos de Task 13. Task 14 es condición para activar el segundo comercio, no para reconocer como aprobado al primero.
