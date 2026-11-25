# Presentaciones con el mismo peso

Pedido del usuario: Cuarto y Milkshake pueden consumir ambos 250 g del mismo helado. Cada presentación conserva nombre distinto, venta y envase propios. Se mantienen la venta directa, los datos existentes y las restricciones de importes y nombres.

Diseño: distinguir la presentación por nombre y peso, nunca por gramos solos ni por posición en la lista. Los nombres ya son únicos por producto en cliente y SQL. Una referencia ambigua antigua no elige silenciosamente la primera fila. El ticket mantiene nombre, precio y envase congelados por línea, y el stock se descuenta del producto base. Nueva migración incremental cambia solo la validación privada para permitir repetir gramos; no se reescribe la migración aplicada. Se instala únicamente en Docker. Producción queda pendiente de autorización separada.

- [x] Reproducir guardado y selección equivocada mediante pruebas Node, SQL y navegador.
- [x] Corregir formulario, atajos y selección por nombre/peso; preservar compatibilidad cuando un peso es único.
- [x] Preparar migración incremental, comprobar reaplicación y restricciones en transacciones revertidas.
- [x] Integrar y aplicar solo en Docker, comprobar el catálogo conservado, suite completa y recorridos en ambos anchos.
- [x] Hacer una revisión independiente, corregir hallazgos, guardar commit local y entregar el informe consolidado solicitado.

Cierre: revisión independiente realizada; corregidas prioridad del nombre exacto y compatibilidad del ensayo SQL histórico con un catálogo de pesos repetidos. No hubo segunda revisión. Migración aplicada solo en Docker: catálogo, dueño y ACL conservados. Candidato: 760/760 pruebas Node con SQL habilitado, ocho recorridos de navegador y diez ejemplos simulados del lector. Tres pruebas SQL repetidas tras aplicar la migración; integridad49 correcta. La pestaña del usuario quedó actualizada y operativa; la otra pestaña estaba en una página de error, sin ejecutar el selector antiguo. Sin push ni publicación. Informe consolidado en entregables/INFORME-CAMBIOS-PRESENTACIONES-Y-COBRO-2026-11-24.md.
