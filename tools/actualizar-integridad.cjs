const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),p=path.join(root,'integrity-manifest.json');
const m=JSON.parse(fs.readFileSync(p,'utf8'));m.packageRevision=84;m.packageEdition='2026-10-05-r3';m.generatedAt='2026-10-05';
for(const file of ['REV84-LECTOR-MEMORIA.sql','REV84-LECTOR-CUPO.sql','supabase/functions/_shared/f6-invoice-review.mjs','tools/actualizar-integridad.cjs'])m.files[file]='';
if(fs.existsSync(path.join(root,'LEEME-REV84.md')))m.files['LEEME-REV84.md']='';
for(const file of Object.keys(m.files))m.files[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
fs.writeFileSync(p,JSON.stringify(m,null,2)+'\n');
