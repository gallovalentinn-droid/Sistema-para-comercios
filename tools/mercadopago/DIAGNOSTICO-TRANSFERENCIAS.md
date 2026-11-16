# Diagnóstico de cobertura de transferencias

Acción `transfer-coverage`, disponible únicamente para el dueño autenticado con autoridad vigente y una cuenta conectada del comercio. Es un diagnóstico de categorías; no habilita ni ejecuta comprobaciones financieras contra ventas.

La acción consulta pagos de una ventana entre 1 y 4320 minutos, por defecto tres días, hasta 500 resultados. Devuelve conteos por categorías de catálogo, si la cuenta es receptora y si el validador actual aceptaría el ingreso. No devuelve ni registra importes, fechas de pagos, nombres o identificadores. Valores desconocidos se agrupan como `otro`.

No crea ventas, recibos ni reclamos. Puede renovar credenciales vencidas mediante el mecanismo normal de OAuth. Esa renovación sí actualiza credenciales de servidor.

## Consulta con ventana de diez minutos

Con la sesión del dueño abierta en la web y una cuenta principal conectada:

```js
mpRequest('accounts')
  .then(r => mpRequest('transfer-coverage', {
    accountId: r.accounts.find(a => a.primary).id,
    minutes: 10
  }))
  .then(r => console.log(JSON.stringify(r.coverage, null, 1)))
```

El servidor registra el resumen con el evento `MP_PUBLIC_COVERAGE`. La respuesta de la consola permite conservar el resumen previo y posterior sin copiar movimientos individuales ni credenciales.

## Protocolo de prueba

1. Ejecutar y guardar una consulta previa.
2. El usuario realiza una sola transferencia de prueba a la cuenta conectada.
3. Después de uno o dos minutos, ejecutar y guardar la consulta posterior con la misma ventana.
4. Comparar los conteos previos y posteriores. Si `truncated` es verdadero o `otherGroups` es mayor que cero, no usar esa pareja para concluir una ausencia.
5. Separar las transferencias de prueba más de diez minutos. Orden propuesto: otra cuenta de Mercado Pago, banco por CVU o alias, otra billetera.

La separación evita superponer las transferencias de prueba entre sí, pero no excluye movimientos ajenos a la prueba. Los conteos y `accepted:true` no identifican por sí solos una transferencia concreta ni comprueban el importe de una venta. Un error o tiempo agotado tampoco equivale a cero ingresos. Si una categoría relevante queda como `otro`, debe identificarse y revisarse antes de ampliar el catálogo.

La comprobación automática de transferencias debe continuar deshabilitada hasta demostrar cobertura y validación con un caso real. Este diagnóstico no resuelve la interoperabilidad del QR con MODO.
