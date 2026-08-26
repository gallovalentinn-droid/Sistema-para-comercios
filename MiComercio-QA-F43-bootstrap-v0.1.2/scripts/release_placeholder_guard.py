#!/usr/bin/env python3
# Falla si encuentra placeholders típicos en artefactos HTML/JS de release.
from pathlib import Path
import sys

base = Path(sys.argv[1] if len(sys.argv)>1 else ".")
tokens = [
    "PEGA_TU_URL_DE_SUPABASE_ACA",
    "PEGA_TU_ANON_KEY_ACA",
    "PEGA_TU_",
    "TU-PROYECTO.supabase.co",
]
exts = {".html",".js",".ts",".json",".env"}
bad=[]
for p in base.rglob("*"):
    if p.is_file() and p.suffix.lower() in exts:
        try:
            txt=p.read_text(encoding="utf-8",errors="ignore")
        except Exception:
            continue
        for t in tokens:
            if t in txt:
                bad.append((str(p),t))
if bad:
    print("PLACEHOLDER_GUARD=FAIL")
    for p,t in bad:
        print(f"{p}: {t}")
    sys.exit(2)
print("PLACEHOLDER_GUARD=PASS")
