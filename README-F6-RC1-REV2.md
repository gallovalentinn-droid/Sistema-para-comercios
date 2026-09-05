# MiComercio F6 RC1-REV2

Este directorio conserva el candidato técnico F5/F6 aplicado y probado únicamente en Supabase QA.

## Estado

- Build cliente: `6.0.0-f6-rc1`.
- Revisión del paquete: `RC1-REV2`.
- Pruebas locales: 102/102.
- Suites SQL verificadas en QA: 14/14.
- SHA-256 del ZIP: `7805bab038089949e768461721f18b7fba17fe10c1d0bbad2c360e34a6c2b841`.

## Verificación

En Windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\MiComercio-F6-PAQUETE-RC1-REV2\verificar.ps1
```

El manifiesto debe controlar exactamente 102 archivos y las pruebas deben informar 102/102.

## Importante

Este candidato no reemplaza todavía `clientes/index.html` ni modifica `CNAME`. La página publicada continúa usando producción. El despliegue público requiere completar los gates F5, el recorrido integral F6, las pruebas concurrentes/offline y el piloto de siete días antes de preparar la migración final.

El paquete no contiene contraseñas, tokens ni la identidad completa del operador interno de QA.
