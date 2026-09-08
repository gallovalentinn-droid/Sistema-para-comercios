# Empleados e imágenes de productos para la beta

## 1. Objetivo

Cerrar dos funciones incompletas de la beta publicada:

1. permitir que dueño y administrador creen y administren cuentas reales de empleados;
2. permitir que los usuarios autorizados agreguen, reemplacen y eliminen imágenes de productos.

El lector de facturas con IA queda expresamente fuera de este incremento y se resolverá en una decisión posterior.

## 2. Estado de partida

- `f5-members` ya permite listar miembros, crear empleados y restablecer contraseñas, pero la interfaz no expone esas operaciones.
- `public.f5_actualizar_miembro` ya permite cambiar permisos y estado activo con auditoría e incremento de `permission_version`.
- La pantalla llamada “Vista empleado” es solamente un bloqueo visual del dispositivo. No crea una cuenta ni representa la autoridad real de F5.
- El bucket público `product-images` existe y está vacío.
- Las políticas de escritura del bucket todavía dependen de `clientes_licencia`, una autoridad legacy que el comercio piloto ya no utiliza.
- El cliente guarda imágenes bajo `<user_id>/<product_id>.jpg`; ese esquema impide que otro administrador autorizado reemplace la imagen de un producto compartido.

## 3. Decisiones de producto

### 3.1 Empleados reales

Configuración incorporará una tarjeta “Empleados” visible sólo para dueño y administrador. La tarjeta mostrará el código del comercio y la lista de miembros, y permitirá:

- crear un empleado con nombre visible, usuario interno y contraseña;
- elegir permisos mediante nombres comprensibles de las secciones;
- cambiar los permisos de un empleado;
- suspender o reactivar un empleado;
- asignar una contraseña nueva.

Un empleado nuevo comienza con `ventas_registrar=true` y los demás permisos desactivados. El dueño o administrador puede ampliar esa selección antes de confirmar el alta.

La pantalla nunca muestra el correo técnico interno creado por Auth. El empleado entra con código de comercio, usuario y contraseña mediante el acceso F5 existente.

La tarjeta legacy “Vista empleado” se conserva únicamente como “Bloqueo de mostrador” para que el dueño pueda prestar temporalmente su dispositivo. Su texto aclarará que no reemplaza una cuenta de empleado y sus controles legacy de permisos dejarán de presentarse como autoridad válida.

### 3.2 Autoridad de empleados

Se conserva el baseline F5 byte por byte. El cliente usará `f5-members` para las operaciones que requieren administración de Auth —listar, crear identidades y restablecer contraseñas— y la RPC autenticada existente `public.f5_actualizar_miembro` para permisos, suspensión y reactivación. No se modifica ni duplica ninguna regla F5.

El servidor conserva todas las decisiones de autoridad:

- sólo dueño o administrador activo puede administrar empleados;
- un administrador sólo puede modificar empleados;
- nadie puede otorgar permisos que no posea;
- suspender o cambiar permisos incrementa `permission_version`, por lo que la autoridad anterior deja de ser vigente según las reglas F5;
- el cliente no puede convertir un empleado en dueño o administrador desde esta tarjeta.

La interfaz puede ocultar botones, pero ningún permiso depende de ese ocultamiento.

La suspensión impide emitir autoridad nueva y bloquea al empleado cuando el servidor vuelve a comprobarla. No invalida retroactivamente un lease offline que ya fue emitido: ese dispositivo conserva únicamente las operaciones y el vencimiento del lease F5 existente, y el servidor mantiene las reglas acordadas de aceptación histórica al drenar.

### 3.3 Imágenes por comercio

La ruta canónica del objeto será:

`<comercio_id>/<producto_id>.jpg`

No se requiere migrar objetos existentes porque el bucket está vacío al comenzar este cambio.

Las políticas de `storage.objects` para `product-images` autorizarán `SELECT`, `INSERT`, `UPDATE` y `DELETE` sólo cuando se cumplan simultáneamente estas condiciones:

- hay una sesión autenticada;
- el primer segmento de la ruta coincide con un comercio donde la persona tiene membresía activa;
- la membresía efectiva contiene `productos_editar` —dueño y administrador lo reciben por rol—;
- la licencia efectiva del comercio permite operar.

El bucket continuará siendo público para lectura por URL porque las fotos de catálogo no se consideran información privada. La escritura nunca se habilita por conocer la URL.

El cliente construirá la ruta con `f3Estado.comercioId`, no con datos editables del formulario. Un empleado con `productos_editar` podrá cargar imágenes; uno sin ese permiso verá Productos oculto y también será rechazado por Storage si intenta llamar a la API directamente.

### 3.4 Experiencia de uso

- La creación del empleado tendrá validaciones claras para nombre, usuario y contraseña mínima de ocho caracteres.
- Las contraseñas nunca se guardan ni se vuelven a mostrar.
- Al suspender se pedirá confirmación indicando que el empleado perderá acceso.
- La carga de imágenes conservará la optimización local actual y el límite de 8 MB.
- Los errores distinguirán falta de permiso, licencia no operable, sesión vencida y fallo de red.
- En línea, la imagen remota se mostrará sólo después de que Storage confirme la carga y entregue la URL pública. Sin conexión se conserva la vista previa local existente, pero no se afirmará que la imagen ya está en la nube.

## 4. Componentes afectados

- `supabase/functions/f5-members/index.ts`: se conserva sin cambios como fachada para listar, crear y restablecer contraseñas.
- Una migración nueva de Supabase: reemplazo controlado de las políticas legacy de `product-images`.
- El HTML de la beta: panel de empleados, consumo de `f5-members`, ruta de imagen por comercio y mensajes de error.
- Pruebas Node del cliente y del contrato Edge Function.
- Pruebas SQL de las políticas de Storage con identidades y comercios diferentes.
- Artefacto F6 y copia publicada `/beta/`, que deben terminar con el mismo código funcional.

No se cambia el esquema de productos, el mecanismo de login F5, la duración del lease ni la licencia de siete días.

## 5. Flujo de datos

### 5.1 Alta de empleado

1. El dueño abre Configuración → Empleados.
2. El cliente solicita el roster a `f5-members` con la sesión actual.
3. El dueño completa nombre, usuario, contraseña y permisos.
4. `f5-members` valida al actor, crea la identidad Auth interna y persiste la membresía `empleado` mediante la operación existente.
5. La pantalla limpia inmediatamente la contraseña y vuelve a cargar el roster.
6. El empleado inicia sesión con el código del comercio y sus credenciales internas.

### 5.2 Cambio o suspensión

1. El dueño selecciona un empleado.
2. El cliente invoca `f5_actualizar_miembro` con el comercio actual, usuario objetivo, rol fijo `empleado`, permisos y `activo`.
3. Supabase ejecuta la RPC bajo el token del actor autenticado.
4. Postgres valida la forma y las reglas F5, audita el cambio e incrementa `permission_version`.
5. La UI vuelve a consultar el roster y refleja el estado confirmado por servidor.

### 5.3 Imagen de producto

1. El usuario autorizado selecciona una imagen.
2. El navegador valida tamaño y tipo, y la optimiza a JPEG.
3. El cliente sube a `product-images/<comercio_id>/<producto_id>.jpg` con `upsert`.
4. Storage evalúa las cuatro condiciones de autoridad.
5. Sólo después del éxito el producto recibe `foto` y `fotoPath`; la sincronización V4 conserva `foto_path` como hasta ahora.

## 6. Fallos y recuperación

- Si Auth se crea pero falla la membresía, `f5-members` conserva la compensación existente que elimina la identidad incompleta.
- Si un cambio de permisos falla, la UI no modifica su copia local del roster y muestra el error del servidor.
- Si la sesión o licencia dejan de ser válidas durante una carga, Storage rechaza la escritura; el producto conserva su imagen anterior.
- Si falla el reemplazo de una imagen, no se borra primero el objeto anterior.
- Reintentar la misma imagen usa `upsert` sobre la misma ruta y no crea archivos huérfanos.
- No se agrega ninguna excepción basada en `clientes_licencia`, PIN local o estado visual de la barra lateral.

## 7. Pruebas y evidencia

La implementación seguirá prueba roja → corrección mínima → prueba verde.

Cobertura mínima:

1. la UI de Configuración contiene gestión real de empleados y no promete una función inexistente;
2. crear empleado transmite únicamente nombre, usuario, contraseña y permisos admitidos;
3. actualizar transmite siempre rol `empleado` y no permite promoción desde el cliente;
4. la contraseña se limpia después del pedido;
5. dueño y administrador autorizado pueden escribir imágenes;
6. empleado con `productos_editar` puede escribir;
7. empleado sin el permiso, miembro suspendido, licencia no operable y miembro de otro comercio son rechazados;
8. `upsert` cuenta con políticas `SELECT`, `INSERT` y `UPDATE`;
9. el cliente genera exactamente `<comercio_id>/<producto_id>.jpg`;
10. las regresiones F5/F6 existentes continúan pasando;
11. verificación manual final en la beta con una cuenta de empleado real y una imagen de prueba recuperable.

Antes de publicar se ejecutarán los verificadores del paquete, los tests nuevos, los asesores de seguridad de Supabase y una consulta de verificación de políticas. La migración se aplica primero al proyecto beta/QA. Producción queda fuera de este incremento.

## 8. Criterios de aceptación

- El dueño piloto puede crear un empleado desde Configuración sin usar el panel de Supabase.
- Ese empleado puede iniciar sesión con código de comercio, usuario y contraseña.
- Sus secciones coinciden con los permisos guardados por el servidor.
- Suspenderlo impide recuperar autoridad nueva y el cambio queda auditado.
- El dueño, un administrador y un empleado con `productos_editar` pueden agregar o reemplazar la imagen de un producto.
- Una persona sin ese permiso no puede hacerlo aunque invoque Storage por fuera de la interfaz.
- No se expone ninguna clave secreta y no se reintroduce autoridad legacy.
- La beta publicada y el artefacto verificado contienen la misma implementación.
