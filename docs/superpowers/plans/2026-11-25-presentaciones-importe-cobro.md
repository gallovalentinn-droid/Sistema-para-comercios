# Presentaciones rápidas y venta por importe

> Para ejecutar: superpowers:executing-plans. Se reutiliza el worktree local actual y se conserva el laboratorio Docker con sus datos.

Objetivo: agregar una presentación desde el resumen con un botón +, restaurar el cobro manual configurable y permitir ingresar el importe al vender a granel.

Base: 4e9fd34. HTML/JavaScript y PostgreSQL de Docker existentes. Sin publicar, push, SQL remoto, cobros reales ni llamadas pagas.

## Diseño y decisiones

- El + del resumen de Tamaños fijos abre una fila vacía enfocada en Nombre. Editar sigue sirviendo para modificar las existentes. Se conservan tamaños, precios y envases ya cargados.
- Venta por peso conserva Gramos y suma Importe. Solo se usa en productos sin presentaciones. El usuario confirmó cobrar el importe exacto y mostrar el peso aproximado, con las promociones y descuentos vigentes al cobrar.
- El usuario confirmó: verificación apagada implica un toque en Transferencia/QR para confirmar la venta; encendida conserva el cobro conectado. El modo manual no debe esperar ni consultar cuentas para vender. Un cobro conectado pendiente conserva siempre su recuperación segura.
- La preferencia de cobro es del comercio, no solo del navegador; si requiere esquema nuevo, se prepara migración incremental y se aplica únicamente en Docker.

## Pasos

- [x] Probar en navegador que el + abre una fila nueva y conserva la anterior, sin tocar Editar; observar fallo y corregir el resumen y manejador.
- [x] Confirmar precisión del importe y probar la conversión, valores inválidos, stock/costo, cambio de modo y convivencia con venta por gramos/presentaciones. Mantener el monto y peso de cada línea coherentes hasta el guardado.
- [x] Confirmar opciones de configuración; probar persistencia, comercio sin conectar, manual con conexión, conectado con cuenta, error y recuperación de pendientes. No abrir un camino manual que evite cancelar/verificar un pago pendiente.
- [x] Integrar en candidato Docker preservando lector; actualizar edición, caché y manifiesto de ambas copias.
- [x] Revisión independiente final y correcciones con regresiones, suite Node/SQL, navegador 1366/390, integridad. Actualizar informe y guardar commits locales sin push.

## Foco de revisión

Importes que no equivalen a gramos enteros; precio por kilo cero; entradas inválidas y códigos escaneados; cambio de configuración con un cobro pendiente; preferencia sincronizada entre dispositivos y autoridad de dueño; respuestas tardías de cuentas; mismo peso en varias presentaciones y foco al agregar una nueva.


Cierre: cinco hallazgos de revisión independiente reproducidos y corregidos (idempotencia manual, escaneo, proyección histórica, envío selectivo y F34). Sin segunda revisión. Migración solo en Docker. Candidato r21: 768/768 Node con SQL, 42 recorridos, diez ejemplos simulados, integridad50. La copia inicial del parche alteró selectores; corregida y cotejada literalmente antes de las verificaciones finales. Dos expectativas históricas sin cuenta se actualizaron al nuevo flujo manual. Informe en entregables/INFORME-UX-VENTA-IMPORTE-Y-COBRO-2026-11-25.md. Sin push ni publicación.
