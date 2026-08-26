# Patch v0.1.2 — F3.2 reclasificado correctamente

Fecha: 2026-08-26

Corrección:

- F3.2 Slice A/B deja de figurar como fase SQL del rebuild.
- Se clasifica como baseline cliente.
- El rebuild del servidor queda en 8 tramos SQL:
  V3 → F2 → hardening → F3.1 → F3.3 → F3.4 → F4.1 → F4.2.
- `check_canonical_files.py` exige únicamente esos 8 SQL.
- Se elimina `canonical_sources/F32_SOURCES.txt`.
- Se agrega `client_baseline/F32_CLIENT_BASELINE.txt`.

No se cambia ninguna huella de producción ni se ejecuta SQL.
