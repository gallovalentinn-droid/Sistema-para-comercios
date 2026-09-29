# MiComercio REV62 — mejoras para el trabajo diario

Fecha: 28/09/2026.

## Alcance

Esta revisión aplica los grupos acordados «mejorar sin cambiar la lógica» y «priorizar para el trabajo diario». No modifica las reglas de caja, el cálculo de ventas, el modelo de datos ni los permisos de acceso.

## Cambios

### Sincronización y actualización

- Un único indicador visible informa si los datos están en la nube, si hay operaciones pendientes, si falla la lectura de la cola, si no hay conexión o si la sesión está cerrada. El estado verde exige que la cola V4 y la copia local no tengan pendientes.
- Cuando hay pendientes, el indicador permite reintentar. El panel conserva el detalle técnico y las excepciones.
- La beta comprueba si existe una revisión nueva del service worker. Ofrece actualizar al terminar una venta y después de confirmar el guardado local; nunca recarga automáticamente un ticket en curso.
- Soporte deja de indicar Ctrl+F5 y muestra el diagnóstico técnico plegado.

### Venta

- En efectivo, dejar «Con cuánto paga» vacío significa importe exacto. Al escribir un importe se conserva la validación y el cálculo del vuelto. Enter confirma únicamente desde ese campo del modal.
- En celular aparece una barra fija con el total y «Elegir medio de pago». Se elimina el botón duplicado del pie del ticket móvil.
- El ticket destaca el último producto agregado; el buscador tiene fondo claro y foco azul.

### Productos y vistas

- Búsqueda y rubro quedan siempre visibles; actividad, estado, orden y datos faltantes se agrupan en «Filtros», con contador de filtros activos.
- Las casillas de selección aparecen solo al entrar en el modo «Seleccionar». «Todos los resultados» queda dentro de ese modo.
- El stock por debajo del mínimo se marca «Bajo» en ámbar; el agotado se marca «Sin stock» en rojo.
- En celular las filas muestran primero producto, precio y stock, con detalle desplegable. Los productos sin foto dejan de mostrar un avatar de inicial.
- Se permite que el nombre del comercio ocupe dos líneas y se unifica la tipografía de importes visibles.
- Los avisos breves pasan a la esquina superior derecha; los encabezados de Compras y Descuentos coinciden con el menú.
- Vencimientos presenta un solo botón para cargar fechas cuando no hay ninguna. Fiado elimina acciones duplicadas en la vista vacía, compacta los indicadores en celular y mueve la configuración de mora a Configuración. Resumen vacío ofrece «Ver ayer» y «Ver 7 días».
- El selector de respaldo usa una etiqueta en español. Cambiar el modo de caja con un turno abierto muestra una advertencia y pide confirmación antes de aplicar el cambio.

## Verificación

- **Código:** identidad REV62 alineada entre `beta/index.html`, `beta/sw.js`, pruebas y manifiesto de integridad. Sin migraciones SQL.
- **Local:** 260 pruebas automatizadas; verificador de integridad; recorrido de navegador a 1366 y 390 px con datos de prueba para catálogo, selección, cobro exacto, barra móvil, aviso de actualización y ausencia de desborde.
- **Entorno público:** pendiente de verificar tras publicar la revisión. Las pruebas locales no usan una cuenta real ni validan la sincronización entre dos dispositivos reales.

## Archivo

El ZIP completo se genera desde la revisión confirmada del repositorio, sin claves ni carpetas de trabajo temporales.
