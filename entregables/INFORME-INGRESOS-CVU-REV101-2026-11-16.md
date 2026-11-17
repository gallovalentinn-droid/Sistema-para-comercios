# Ingresos y MODO — candidato REV101

El usuario aprobó el boceto y pidió implementar y probar. Fuente: `.worktrees/publicacion-docker-mp/`, base origin/main a2beeb0. No se desplegó ni se habilitó la comprobación de transferencias.

## Verificado en código

- Vender muestra ingresos acreditados, importe, fecha, remitente informado y uso previo. Elegir solo selecciona; «Registrar venta con este ingreso» vuelve a consultar el pago individual en el servidor antes de emitir el recibo único existente. Cambiar de cuenta descarta selección. La consulta muestra estado inmediato y el cobro manual es una acción secundaria diferenciada.
- Caja incorpora «Ingresos de Mercado Pago»: últimos tres días, acreditados y usados/sin asociar. Solo consulta, sin registrar ventas ni reclamar pagos. Puede renovar credenciales vencidas.
- El validador conserva money_transfer y agrega exclusivamente account_fund/bank_transfer/cvu. Exige destinatario, ARS, approved/accredited, importe exacto al reclamar y ausencia de importe reembolsado. La búsqueda consulta approved sin filtro de operación y valida cada resultado.
- Error consultando uso previo o respuesta incompleta no equivale a lista vacía. Hasta100 ingresos visibles, consultas de uso en lotes10 y advertencia de recorte. Unicidad transaccional existente preservada.
- Conector Docker compatible. REV101, edición2026-11-16-mp-ingresos-r1, cachérev101-r1 y manifiesto regenerado.

## Verificado localmente

- **692/692 pruebas Node, cero fallos y cero omisiones**, incluido PostgreSQL sintético en Docker. Evidencia en candidato: entregables/ingresos-suite-final.txt.
- Nuevas regresiones observadas primero en rojo y después en verde: CVU/rechazos, búsqueda, historial sin claim, fallo de uso, claim individual, límite y concurrencia acotada. Compatibilidad Docker probada.
- **12 recorridos de navegador aprobados**: ingresos, cobros, esperaQR, recuperación, capacidades y consulta no bloqueante a1366/390. Datos/sesión/proveedor simulados, escrituras externas bloqueadas. Evidencia: candidato entregables/ingresos-navegador.txt y capturas ingresos-preview/. Captura móvil de Caja inspeccionada.
- Revisión independiente sin hallazgos importantes reproducibles; focales6/6 repetidas por el revisor.

## Entorno público y MODO real

No se publicó esta revisión ni se activó la bandera financiera. Estas pruebas no demuestran que el GET individual ni el claim de la transferencia real hayan concluido.

Antecedente real: 16/11 a21:20 Argentina, diagnóstico agregado mostró account_fund/bank_transfer/cvu approved/accredited, ARS, destinatario correcto y rechazo del validador anterior. Usuario informó envío de$300 desde MODO. El agregado no contiene importe/ID ni tuvo referencia previa fresca; no identifica por sí solo el pago ni registra venta. Evidencia: despliegue-cobertura-mp-2026-11-16/consulta-posterior-modo.json.

Usuario informó al escanear QR: «este qr solo sirve para cobrar en tu negocio». Se preguntó app exacta y si pagador es distinto del comercio, respuesta pendiente. No se cambió modoQR ni se afirmó interoperabilidad resuelta. TransferenciaCVU y pagoQR son pruebas distintas.

## Pendiente operativo

Publicar candidato revisado, comprobar huellas/versión/pantallas públicas y consultar ingreso real. Antes de habilitar claim, verificar cobertura y pago individual. El usuario elige/confirma desde su ticket y se comprueban recibo/venta únicos, sin otra transferencia ni venta ficticia contra stock real. Para QR, confirmar aplicación/cuenta pagadora y repetir escaneo nuevo conservando mensaje/hora.

No se hicieron transferencias, cobros, ventas, cambios de secretos, migraciones ni escrituras de negocio públicas.
