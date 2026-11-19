const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
test('PostgreSQL: anulación de fiado por dueño y empleado, permisos, deuda, Caja, mora y replay',{skip:process.env.MP_SQL_TEST!=='true',timeout:90000},()=>{
 const container='supabase_db_micomercio-prueba-local';
 const [info]=JSON.parse(cp.execFileSync('docker',['inspect',container],{encoding:'utf8'}));
 assert.deepEqual(info.NetworkSettings.Ports['5432/tcp'],[{HostIp:'127.0.0.1',HostPort:'55322'}]);
 const root=path.resolve(__dirname,'..');
 const migration=fs.readFileSync(path.join(root,'REV108-FIADO-ANULAR.sql'),'utf8').replace(/^begin;$/m,'').replace(/^commit;$/m,'');
 const fixture=fs.readFileSync(path.join(root,'supabase/tests/fiado/anulacion.sql'),'utf8').replace(/^begin;$/m,'').replace(/^rollback;$/m,'');
 cp.execFileSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q'],{input:'begin;\n'+migration+'\n'+fixture+'\nrollback;\n',encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:80000});
});
