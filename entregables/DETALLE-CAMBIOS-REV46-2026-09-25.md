# MiComercio — revisión de la auditoría REV45 y cambios de REV46

Fecha: 25/09/2026

## Resultado de los hallazgos

| Hallazgo | Evaluación | Corrección |
|---|---|---|
| R1 · Fondo manual borrado | Confirmado en el código y reproducido localmente. | La migración del fondo heredado sólo puede actuar sobre aperturas anteriores al inicio de REV40. Un fondo cargado manualmente después de REV40 se conserva aunque coincida con el anterior. |
| R2 · Sin turnos no se puede dejar cambio | Confirmado en el código y reproducido localmente. | El cierre permite indicar el efectivo que quedará para la caja siguiente, separado entre general y cigarrillos cuando corresponde. Ambos valores empiezan en 0. No se puede reservar más de lo contado. El importe queda asociado a la misma caja y se consume al abrir la siguiente sesión. |
| R3 · Recuperación repetida | Confirmado en el código. | Primero se completa la sincronización normal. Luego se comparan las cantidades con el alcance de la proyección del usuario y del dispositivo. Sólo si faltan registros locales se reinician los cursores afectados y se repite la descarga. Las cuatro consultas de control se hacen en paralelo. |
| R4 · Esperas sucesivas con red colgada | Confirmado en el código; la cifra de ~32 s proviene de la auditoría. | Cuando vence una solicitud durante el arranque, las solicitudes siguientes de ese mismo intento terminan inmediatamente. Un intento nuevo restablece el límite. |
| R5 · Producto nuevo de factura a $0 | Confirmado en el código y reproducido localmente. | La factura no se confirma hasta asignar un precio de venta positivo a cada producto nuevo. Descartarla sigue sin alterar el catálogo. |
| R6 · Informes ausentes | Confirmado en el ZIP REV45. | El ZIP REV46 incluye los informes REV43, REV44, REV45 y este informe. |

## Caja

Al cerrar sin «Caja por turnos», el usuario escribe cuánto efectivo físico deja para la próxima caja. El valor inicial es 0. Si hay caja separada de cigarrillos, se cargan ambos fondos por separado. La confirmación muestra los importes antes de guardar. El cierre conserva su arqueo y la siguiente sesión toma sólo el fondo reservado de esa caja; no hereda saldos de cierres anteriores.

La protección de R1 usa como límite la fecha del cambio de REV40 en el código. Esta corrección evita borrar fondos de aperturas recientes. No modifica cierres históricos ni reconstruye fondos que una versión anterior ya hubiera cambiado en un dispositivo.

## Verificación

- **Código:** revisados los seis hallazgos contra REV45 y modificados los cinco comportamientos confirmados.
- **Local:** 182 de 182 pruebas aprobadas; sintaxis del cliente válida; integridad correcta de 14 archivos; `git diff --check` sin errores. Las pruebas nuevas cubren la conservación del fondo manual, el fondo reservado en el cierre, el orden y alcance de la recuperación, la red colgada y la factura con precio obligatorio.
- **Beta pública:** REV46 no se publicó ni se probó en el dominio público. No se consultaron ni cambiaron datos reales de comercios durante esta revisión.

## Instalación

El ZIP contiene el sistema completo, sus dependencias locales, migraciones existentes, pruebas, verificador de integridad e informes. Para activar REV46 en la beta pública hay que publicar el contenido y repetir allí los escenarios de caja y sincronización con cuentas de prueba antes de considerarlos verificados en producción.
