# Patch v0.1.1 — COV-1 scenario IDs

Fecha: 2026-08-26

Se corrigieron los IDs de escenario de `qa/04_cov1_precheck.sql` para alinearlos con
la fuente normativa `COVERAGE_CONTRACT.md v0.2`.

Cambios:

- `COV-FIADO-PAY` -> `COV-CREDIT-PAY`
- `COV-FIADO-ADJ` -> `COV-CREDIT-ADJ`
- `COV-SALE-VOID` -> `COV-SALE-CANCEL`

Criterio: el contrato normativo define los `scenario_id`; el precheck y el futuro
runner/audit deben consumir exactamente esos identificadores.

No cambia semántica de backend ni se ejecuta SQL destructivo.
