# Reset destructivo no incluido todavía

Este paquete NO incluye ni ejecuta `DROP SCHEMA`, `DROP TABLE`, `TRUNCATE` ni otras
acciones destructivas.

Motivo: el sandbox sólo se debe resetear cuando los instaladores canónicos completos
estén físicamente presentes y el checker confirme el set de fuentes. Resetear antes
de tener F2→F4.2 reproducible dejaría el laboratorio en un estado peor y obligaría
a reconstruir contratos desde memoria/catalogo.

Condición para habilitar el siguiente paso:

`READY_FOR_SANDBOX_REBUILD=true`

producido por:

`python scripts/check_canonical_files.py canonical_sources`

Una vez cumplida esa condición, el reset debe estar protegido explícitamente contra
el project ref de producción `zzpmdiivewmvhiszmdzh`.
