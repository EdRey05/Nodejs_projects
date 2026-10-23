const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const [python,output]=process.argv.slice(2);
function run(name,args,input){
  const result=spawnSync(python,args,{input,encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  fs.writeFileSync(path.join(output,name),result.stdout||'');
  fs.writeFileSync(path.join(output,name+'.stderr'),result.stderr||'');
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(`${name}: exit ${result.status}: ${result.stderr||result.stdout}`);
  return result.stdout;
}
try{
 run('003-python-imports.txt',['-I','-c',"import duckdb,pandas,openpyxl,yaml,PIL; print('Native runtime imports passed')"]);
 const stages=JSON.parse(run('003-stages.json',['python_tools/bridge.py'],JSON.stringify({action:'fetch_stages'})));
 if(!stages.success||stages.stages.length!==13)throw Error('Expected thirteen canonical stages');
 run('003-empty-schema.txt',['-c',"import sys; sys.path.insert(0,'python_tools'); import db_ops; db_ops.init_db(); c=db_ops.get_connection(); print(c.execute('SHOW TABLES').fetchall()); c.close()"]);
 console.log('Bundled Python, UTF-8 bridge and empty schema passed');
}catch(error){console.error(error);process.exitCode=1;}
