# Tamaños con stock compartido

El usuario aprobó integrar y publicar tamaños de venta con precio propio que descuenten un único stock total en kilos. Configuración única desde Productos; venta de un tamaño con un toque. Sin seguimiento por sabor.

## Enfoque

Se reutilizan agrupaciones de componentes existentes: una presentación se identifica por tener exactamente un componente cuyo producto se vende por kg. Su cantidad es el consumo en kg, su precio es independiente y no posee inventario propio. Se descarta usar atados porque trasladan stock a productos separados; se descarta un nuevo tipo financiero/SQL porque el circuito de componentes ya registra cantidades decimales, costos, operaciones offline y anulaciones históricas.

Productos ofrece Tamaños por cada base kg y una pantalla para crear/editar/desactivar. El mostrador muestra botones de las presentaciones activas con nombre y precio. Los productos base conservan reposición, costos y ajuste de kilos. Ventas/anulaciones conservan el snapshot de componentes existente, aun cuando después cambie la configuración.

Validaciones: base kg vigente sin origen de atado; gramos enteros positivos, hasta 1.000.000 (precisión 0,001 kg); precio positivo con hasta dos decimales; nombre no vacío hasta 160 caracteres. No alterar combos existentes de varios componentes. En la creación y edición se conserva autorización de edición de combos, y el cajero solo necesita autorización de venta. Altas de tamaños requieren conexión como los maestros actuales; vender conserva el flujo offline.

## Publicación

Base aislada main/REV88, no candidato P0 0f1c901. Revisión REV92, edición 2026-10-24; HTML, SW y manifiesto alineados. Publicación autorizada explícitamente por el usuario, después de pruebas y revisión independiente. El cambio invalida las referencias públicas REV88 usadas por C3/P0, cuyo candidato permanece intacto y deberá revalidarse.

No crear catálogo ni ventas reales al publicar. Verificar interfaz y escenarios sobre la beta pública con datos sintéticos y red de negocio bloqueada. No modificar SQL, Edge ni permisos.
