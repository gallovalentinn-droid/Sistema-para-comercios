#!/usr/bin/env python3
from pathlib import Path
import hashlib, sys, json

base = Path(sys.argv[1] if len(sys.argv) > 1 else "canonical_sources")

required = [
    "supabase-setup.sql",
    "supabase-v4-schema-final.sql",
    "01_F2_PRIVILEGIOS_HARDENING.sql",
    "supabase-v4-f3-contracts.sql",
    "supabase-v4-f3.3-contracts.sql",
    "supabase-v4-f3.4-contracts.sql",
    "supabase-v4-f4.1-control-plane.sql",
    "supabase-v4-f4.2-zero-start.sql",
]

found = {}
missing = []

for name in required:
    matches = list(base.rglob(name)) if base.exists() else []
    if len(matches) != 1:
        missing.append({"file": name, "matches": len(matches)})
        continue
    p = matches[0]
    h = hashlib.sha256(p.read_bytes()).hexdigest()
    found[name] = {"path": str(p), "sha256": h, "size": p.stat().st_size}

f32 = base / "F32_SOURCES.txt"
f32_ok = False
if f32.exists():
    lines = [x.strip() for x in f32.read_text(encoding="utf-8", errors="replace").splitlines()]
    f32_ok = any(x and not x.startswith("#") for x in lines)

ready = (not missing) and f32_ok

result = {
    "READY_FOR_SANDBOX_REBUILD": ready,
    "base": str(base),
    "found": found,
    "missing_or_duplicate": missing,
    "F32_SOURCES_declared": f32_ok,
}

print(json.dumps(result, indent=2, ensure_ascii=False))
sys.exit(0 if ready else 2)
