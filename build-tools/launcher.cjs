const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),{spawn}=require('node:child_process'),crypto=require('node:crypto');
const root=__dirname, state=path.join(root,'portable-state.json');
const get=(url)=>new Promise((resolve,reject)=>http.get(url,r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>resolve(b));}).on('error',reject));
(async()=>{
 if(fs.existsSync(state)){try{const old=JSON.parse(fs.readFileSync(state));const health=await get(`http://127.0.0.1:${old.control}/health`);if(health===old.token){if(process.argv.includes('--stop'))await get(`http://127.0.0.1:${old.control}/stop?token=${old.token}`);else spawn('cmd.exe',['/d','/c','start','',old.url],{windowsHide:true});return;}}catch{} }
 if(process.argv.includes('--stop'))return;
 const config=JSON.parse(fs.readFileSync(path.join(root,'portable.json'),'utf8').replace(/^\uFEFF/,'')),token=crypto.randomBytes(24).toString('hex');
 const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const appRoot=path.join(root,'app');const env={...process.env,PORT:String(port),HOSTNAME:'127.0.0.1',NODE_ENV:'production',GSA_PYTHON:path.join(root,'python','python.exe')};
 const log=fs.openSync(path.join(root,'application.log'),'a');
 const child=spawn(process.execPath,[path.join(appRoot,config.entry)],{cwd:appRoot,env,windowsHide:true,stdio:['ignore',log,log]});
 const control=http.createServer((req,res)=>{if(req.url==='/health')return res.end(token);if(req.url===`/stop?token=${token}`){res.end('Stopping');child.kill();return;}res.statusCode=403;res.end();});
 child.on('error',e=>{fs.appendFileSync(path.join(root,'application.log'),String(e));process.exitCode=1;control.close();});
 child.on('exit',()=>{control.close();try{fs.unlinkSync(state)}catch{} });
 await new Promise(r=>control.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${port}${config.route||'/'}`;
 fs.writeFileSync(state,JSON.stringify({control:control.address().port,token,url}));
 let ready=false;for(let i=0;i<120;i++){try{await get(url);ready=true;break}catch{await new Promise(r=>setTimeout(r,500));}}
 if(!ready){child.kill();throw Error('App did not become ready; see application.log');}
 if(!process.argv.includes('--no-browser'))spawn('cmd.exe',['/d','/c','start','',url],{windowsHide:true});
})().catch(e=>{fs.appendFileSync(path.join(root,'application.log'),String(e));process.exitCode=1;});
