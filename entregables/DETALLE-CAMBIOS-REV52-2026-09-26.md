# Mi Comercio — cambios REV52 (26/09/2026)

## Caja

1. Al cerrar, hay que elegir **Retiro todo** o **Dejo plata**. Si se deja dinero, se indica cuánto queda en cada caja; el sistema calcula cuánto se retira y no permite dejar más de lo contado. La decisión se muestra antes de confirmar y se guarda con el cierre.
2. La apertura consulta el **último cierre de esa caja en el servidor**, aunque se haya hecho desde otro dispositivo. Pregunta si el dinero que quedó está en la caja. Si no coincide, exige un nuevo conteo y un motivo, y registra la diferencia entre turnos. Si el cierre es anterior a REV52 o está en revisión, pide contar sin suponer un saldo. Sin conexión usa el último cierre local disponible e informa esa situación.
3. La apertura es explícita también para los comercios que no usan «Caja por turnos». Una caja nueva no hereda un fondo de configuración ni una suma histórica sin confirmación. Si la separación de cigarrillos fue desactivada, el dinero que quedó en ambas cajas se presenta junto en la caja general.
4. El cierre se abre como una ventana guiada de tres pasos desde **Cerrar caja**. Se puede salir sin cerrar, corregir el conteo y volver a revisar. La pestaña de cierre se quitó de la navegación principal.
5. La vista del turno destaca la plata calculada que debería haber, visible sólo al dueño. Nunca presenta un importe negativo como plata disponible; una cifra anómala se acompaña de una explicación.
6. Un descuadre superior a $2.000 en cualquiera de las cajas obliga a escribir el motivo antes de cerrar. Los campos de conteo empiezan vacíos y aceptan cero escrito expresamente.
7. El historial muestra la persona que cerró cuando está disponible, la falta o sobra de cada caja, cuánto se retiró y cuánto quedó. Si hubo diferencia al abrir el turno, aparece en una fila separada del detalle del cierre. Los cierres antiguos permanecen sin importes de retiro/traspaso inventados.
8. Se quitaron indicadores duplicados del turno y la configuración de fondos sugeridos se mantiene en Configuración, fuera del cierre.

## Actualización de la nube

El archivo `REV52-CAJA-TRASPASO.sql` agrega campos a cierres y aperturas y una consulta del último cierre por caja. La escritura del traspaso se valida y se realiza en la misma transacción que el cierre. **Hay que aplicar esta migración antes de servir REV52**: el cliente nuevo consulta esas columnas y la función de lectura. La migración no modifica importes ni estados de cierres anteriores; sus campos nuevos quedan vacíos.

No se aplicó la migración ni se publicó esta revisión en la beta pública. No se realizaron cierres, aperturas ni cambios en datos reales durante este trabajo.

## Cambio pendiente del pedido

**Agregar plata durante un turno (C6)** queda pendiente. El contrato actual sólo dispone de egresos positivos; usarlo para una entrada produciría un saldo incorrecto y una sincronización engañosa. Requiere un registro de ingresos de efectivo, su sincronización entre equipos y su incorporación al arqueo y las copias de seguridad. La apertura sí permite registrar y explicar una diferencia inicial.

## Verificación

- **Código:** se revisó el cierre, la apertura, la proyección de cierres remotos, los permisos de lectura y la separación por caja. REV52 identifica al HTML y a su caché.
- **Local:** 210 pruebas automatizadas aprobadas; sintaxis del script principal correcta; integridad de 15 archivos correcta y sin secretos privados detectados; `git diff --check` sin observaciones.
- **Beta pública:** no verificada para REV52 porque esta versión y su migración aún no están publicadas.
