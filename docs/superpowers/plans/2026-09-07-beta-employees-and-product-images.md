# Beta Employees and Product Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar en la beta completa la gestión real de empleados y la carga de imágenes de productos con la autoridad F5/F6 actual.

**Architecture:** El baseline F5 permanecerá byte por byte intacto: `f5-members` conservará las operaciones Auth existentes y la UI usará `f5_actualizar_miembro` para permisos y estado. Storage autorizará objetos bajo `<comercio_id>/<producto_id>.jpg` mediante membresía activa, permiso `productos_editar` y licencia operable. El cliente completo conservará todas sus funciones y agregará una tarjeta de empleados sin depender de la antigua “Vista empleado”.

**Tech Stack:** HTML/CSS/JavaScript sin framework, Node.js `node:test`, Supabase Auth, Edge Functions Deno, PostgreSQL 15+, Storage RLS.

**Spec:** `docs/superpowers/specs/2026-09-07-beta-employees-and-product-images-design.md`

## Global Constraints

- El lector de facturas con IA queda fuera de este incremento.
- La beta publicada conserva todas las funciones del sistema completo; no se sustituye por una demo reducida.
- El proyecto beta/QA es `qrvdfqpxutymmlcplsal`; producción queda fuera de alcance.
- No se expone `service_role`, correo técnico interno, contraseñas ni otro secreto en el navegador o repositorio.
- La autoridad procede de `comercio_miembros`, permisos F5 y la licencia efectiva F6; no se consulta `clientes_licencia`, PIN ni estado visual.
- Las contraseñas admitidas tienen de 8 a 128 caracteres y se eliminan de la pantalla después de enviar el pedido.
- La ruta canónica de una imagen es `<comercio_id>/<producto_id>.jpg`.
- Dueño y administrador reciben `productos_editar` por rol; un empleado lo recibe sólo si figura en sus permisos efectivos.
- La suspensión no revoca retroactivamente leases offline ya emitidos; se conservan las reglas históricas F5.
- La rama de fuentes `qa/f6-rc1-rev2` y la rama publicada `beta/f6-rc2-public` deben quedar trazables y la implementación funcional del HTML debe coincidir.

---

### Task 1: Congelar F5 y definir el contrato cliente de empleados

**Files:**
- Modify: `.worktrees/f6-rc2-publication/beta/index.html`
- Create: `.worktrees/f6-rc2-publication/tests/beta-employees-images.test.cjs`

**Interfaces:**
- Consumes: `f5MembersRequest` para listar/crear/restablecer y RPC `f5_actualizar_miembro(uuid,uuid,text,jsonb,boolean)` para permisos/estado.
- Produces: `f5PermisosEmpleadoIniciales()`, `f5PayloadCrearEmpleado(form)` y `f5ArgsActualizarEmpleado(member,permissions,activo)`.

- [ ] **Step 1: Verify the frozen baseline before changes**

Run `node --test tests/f6-baseline.test.cjs` inside the F6 package. Expected: PASS and byte equality with the nested F5 rev10 package.

- [ ] **Step 2: Write failing client contract tests**

Extract the delimited employee core from the real beta HTML and use literal expectations:

```js
assert.deepEqual(f5ArgsActualizarEmpleado(
  { user_id:'11111111-1111-4111-8111-111111111111' },
  { ventas_registrar:true },
  false,
), {
  p_comercio_id:'33333333-3333-4333-8333-333333333333',
  p_target_user_id:'11111111-1111-4111-8111-111111111111',
  p_rol:'empleado',
  p_permisos:{ ventas_registrar:true },
  p_activo:false,
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `node --test tests/beta-employees-images.test.cjs`

Expected: FAIL because the delimited core/functions do not exist.

- [ ] **Step 4: Implement minimal pure helpers**

Build the ten-permission default, strict trimmed create payload, and RPC args with `p_rol:'empleado'` and `p_comercio_id:f3Estado.comercioId`. The helper must copy permission objects and never retain passwords outside the immediate create payload.

- [ ] **Step 5: Run focused tests and F5 baseline**

Run the client test, then rerun `node --test tests/f6-baseline.test.cjs` in the package.

Expected: helpers pass and F5 remains byte-identical.

---

### Task 2: Gestión real de empleados en la aplicación completa

**Files:**
- Modify: `.worktrees/f6-rc2-publication/beta/index.html`
- Create: `.worktrees/f6-rc2-publication/tests/beta-employees-images.test.cjs`
- Later mirror: `MiComercio-F6-PAQUETE-RC1-REV2/entregables/MiComercio-F6-PRUEBA.html`

**Interfaces:**
- Consumes: `f5MembersRequest`, `f5ListarMiembrosTodos`, `F5_VIEW_PERMISSIONS`, `f5MembresiaActual`, `sb.rpc` and the pure helpers from Task 1.
- Produces: the “Empleados” card in Configuración and server-confirmed create/update/suspend/reset flows.

- [ ] **Step 1: Write failing client tests**

Extract the delimited employee core from the real HTML and execute it in a VM. Assert these literal outcomes:

```js
assert.deepEqual(f5PermisosEmpleadoIniciales(), {
  ventas_registrar: true,
  productos_editar: false,
  reposicion_ver: false,
  vencimientos_ver: false,
  combos_editar: false,
  promociones_editar: false,
  fiado_operar: false,
  caja_operar: false,
  movimientos_ver: false,
  resumen_ver: false,
});
assert.equal(f5PayloadCrearEmpleado({ nombre:' Ana ', usuario:' CAJA_1 ', clave:'12345678' }, permisos).nombre, 'Ana');
```

Also render Configuración in the test DOM and assert that a real employee form and roster are reachable for dueño/admin, while an empleado cannot see the card.

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/beta-employees-images.test.cjs`

Expected: FAIL because the employee core/card does not exist.

- [ ] **Step 3: Add pure employee helpers**

Define the exact ten canonical permissions in the same order as `F5_VIEW_PERMISSIONS`. The create payload must be:

```js
{ accion:'crear', nombre, usuario, clave, permisos }
```

The update payload must always omit credentials and role. No helper stores a password.

- [ ] **Step 4: Add the Configuración card**

Add a “Empleados” navigation entry and card for dueño/admin with:

- commerce code;
- name, username and password inputs;
- ten understandable permission switches;
- create button;
- roster with role/status;
- edit permissions, suspend/reactivate and reset-password actions for employee rows.

Keep “Bloqueo de mostrador” as a separate local-device feature. Remove the false onboarding promise by making the real card its target.

- [ ] **Step 5: Wire requests and error states**

Use `f5MembersRequest` for `crear`, `restablecer_clave`, `listar` and `codigo_comercio`. Use `sb.rpc('f5_actualizar_miembro', f5ArgsActualizarEmpleado(...))` for permissions and state. Always reload the roster from the server after success. Clear password fields in `finally`. Map stable errors to short messages and retain the server state after failures.

- [ ] **Step 6: Run focused tests and syntax check**

Run: `node --test tests/beta-employees-images.test.cjs tests/sidebar-layout.test.cjs`

Run a Node VM parse of the embedded script.

Expected: PASS and syntax exit 0.

- [ ] **Step 7: Commit**

Commit the beta HTML and tests with `feat: add real employee management to beta`.

---

### Task 3: Autoridad Storage para imágenes por comercio

**Files:**
- Create through the Supabase CLI naming command, then retain canonical SQL as: `MiComercio-F6-PAQUETE-RC1-REV2/supabase/f6/07_product_images.sql`
- Create: `MiComercio-F6-PAQUETE-RC1-REV2/supabase/tests/f6_product_images.test.sql`
- Modify: `.worktrees/f6-rc2-publication/beta/index.html`
- Modify: `.worktrees/f6-rc2-publication/tests/beta-employees-images.test.cjs`

**Interfaces:**
- Consumes: `storage.objects`, `public.comercio_miembros`, `private.f5_permisos_efectivos(uuid)` semantics and `private.licencia_activa(uuid)`.
- Produces: policies `producto imagen comercio select|insert|update|delete` and client helper `f5RutaImagenProducto(comercioId,productoId)`.

- [ ] **Step 1: Confirm CLI command and create migration name**

Run `supabase --version`, `supabase migration new --help`, then create `f6_product_images`. If the CLI is unavailable, keep the package's numbered SQL source and apply that exact content through Supabase migration tooling without inventing a second source.

- [ ] **Step 2: Write failing SQL and client tests**

The SQL test must run inside a rollback transaction and cover owner, admin, allowed employee, denied employee, suspended member, inactive license and other commerce. The client test must expect exactly:

```js
assert.equal(
  f5RutaImagenProducto('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'),
  '33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.jpg',
);
```

- [ ] **Step 3: Verify RED**

Run the client test and a structural SQL preflight against the current policies.

Expected: client helper missing; current policies reference `clientes_licencia` and omit SELECT.

- [ ] **Step 4: Implement policies**

Drop only the three named legacy `product-images` policies. Create four policies `TO authenticated`. Each `USING`/`WITH CHECK` predicate must require:

```sql
bucket_id='product-images'
and exists (
  select 1
  from public.comercio_miembros cm
  where cm.comercio_id::text=(storage.foldername(name))[1]
    and cm.user_id=(select auth.uid())
    and cm.activo
    and 'productos_editar'=any(private.f5_permisos_efectivos(cm.comercio_id))
    and private.licencia_activa(cm.comercio_id)
)
```

UPDATE must have both `USING` and `WITH CHECK`; upsert receives SELECT, INSERT and UPDATE. DELETE receives `USING`. Do not change bucket public status.

- [ ] **Step 5: Implement the client path**

Validate non-empty commerce and product UUIDs in `f5RutaImagenProducto`. Use it from `subirFotoProducto`; never use `sesion.user.id` as the folder. Preserve JPEG optimization, 8 MB input limit and local offline preview.

- [ ] **Step 6: Run focused tests and SQL transaction**

Run the Node test. Apply the SQL to a disposable transaction/baseline and run `f6_product_images.test.sql`, ending with rollback.

Expected: all role and license cases pass.

- [ ] **Step 7: Commit**

Commit with `fix: authorize product images through commerce membership`.

---

### Task 4: Deploy safely to the QA/beta Supabase project

**Files:**
- No new source files; consumes the reviewed files from Tasks 1 and 3.

**Interfaces:**
- Consumes: migration `07_product_images.sql`; the existing F5 functions remain deployed unchanged.
- Produces: QA migration history entry for Storage policies.

- [ ] **Step 1: Run preflight queries**

Confirm the bucket is empty or list exact existing paths, current policy names, active function version, and that the pilot license is operable. Stop if any object now requires migration.

- [ ] **Step 2: Run database advisors before DDL**

Read security and performance advisors. Distinguish pre-existing findings from new blockers.

- [ ] **Step 3: Apply the exact migration**

Use the Supabase migration API with project `qrvdfqpxutymmlcplsal`. Do not use production.

- [ ] **Step 4: Verify policies after migration**

Query `pg_policies` and assert four policies, no `clientes_licencia`, and SELECT/INSERT/UPDATE/DELETE present.

- [ ] **Step 5: Verify deployed F5 remains unchanged**

List functions and confirm the `f5-members` deployed version/source hash did not change during this increment.

- [ ] **Step 6: Verify authorization**

Exercise an authenticated roster read and an authorized `f5_actualizar_miembro` call only on a test fixture that can be restored. Do not create a permanent employee merely to test without a user-approved identity; use the final browser flow for the owner to create the desired employee.

---

### Task 5: Synchronize the complete artifact and package gates

**Files:**
- Modify: `MiComercio-F6-PAQUETE-RC1-REV2/entregables/MiComercio-F6-PRUEBA.html`
- Modify: `MiComercio-F6-PAQUETE-RC1-REV2/tests/*` only as required to include the new suites
- Modify: `MiComercio-F6-PAQUETE-RC1-REV2/verificar.sh`
- Modify: `MiComercio-F6-PAQUETE-RC1-REV2/verificar.ps1`
- Modify: `MiComercio-F6-PAQUETE-RC1-REV2/SHA256SUMS-F6.txt`
- Modify: package evidence/readme files with measured results only

**Interfaces:**
- Consumes: tested beta HTML and all tested Supabase sources.
- Produces: self-verifying package whose expected test and migration counts are measured constants matching the actual inventory.

- [ ] **Step 1: Promote the tested complete HTML**

Copy the full tested beta application into the F6 artifact. Do not reconstruct a reduced page. Preserve the prior onboarding, support, sidebar and role-label fixes already present in the beta.

- [ ] **Step 2: Mirror source and tests**

Ensure package/workspace copies of changed Supabase files and tests are byte-identical. Add the new SQL suite and migration to the verifier inventory.

- [ ] **Step 3: Update measured counts**

Run the complete Node suite, obtain the real pass count, and set that same single constant in both verifiers. Count SQL suites and F6 migrations from disk and update both constants only after the files are final.

- [ ] **Step 4: Regenerate manifest from disk**

Hash every package file except `SHA256SUMS-F6.txt`, sort paths consistently, write LF, and verify exact set equality.

- [ ] **Step 5: Run cold verification**

Extract/copy the package to a new temporary directory and run `verificar.ps1` on Windows plus the available shell verifier. Expected: hashes exact, coverage exact, syntax OK, all Node tests pass, migration count exact and zero secret findings.

- [ ] **Step 6: Commit sources and package**

Commit with `build: package beta employee and image support` and push the QA source branch after verification.

---

### Task 6: Publish and verify the full beta

**Files:**
- Modify: `.worktrees/f6-rc2-publication/beta/index.html`
- Modify: `.worktrees/f6-rc2-publication/tests/beta-employees-images.test.cjs`

**Interfaces:**
- Consumes: verified full artifact from Task 5.
- Produces: GitHub Pages beta at `https://micomercio.ar/beta/` with every pre-existing function plus employees and product images.

- [ ] **Step 1: Re-run publication branch tests**

Run all tests under publication `tests/` and parse the embedded script.

- [ ] **Step 2: Review the diff**

Confirm no removed navigation entries, no removed feature sections, no secret material, and only intended employee/image changes plus recorded prior fixes.

- [ ] **Step 3: Commit and push publication**

Commit with `feat: enable employees and product images in beta`, then push the existing beta branch and update `main` only through the already-approved publication flow.

- [ ] **Step 4: Verify the deployed page**

Wait for GitHub Pages, open `/beta/`, confirm the build loads, and test owner navigation. Use a harmless image object and remove it or replace it with the user's real product image after confirmation.

- [ ] **Step 5: Validate a real employee flow**

From the owner account, create the employee identity chosen for the pilot, sign in through the employee login, verify allowed/denied sections, test image upload only when `productos_editar` is enabled, then return to the owner session.

- [ ] **Step 6: Final evidence**

Record commit hashes, deployed function version, migration name, policy inventory, test totals and any remaining limitation. The only intentionally pending feature must be the reader of invoices with AI.
