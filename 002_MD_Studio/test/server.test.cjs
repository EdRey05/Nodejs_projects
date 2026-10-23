const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'md-studio-'));process.env.WORKSPACE=workspace;
const {app}=require('../server');
test('CRUD, path and origin confinement, sanitized preview',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}`;
 try{
 let response=await fetch(url+'/api/files/write',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:'demo.md',content:'# Hello'})});assert.equal(response.status,200);
 assert.equal((await (await fetch(url+'/api/files/read?path=demo.md')).json()).content,'# Hello');
 assert.equal((await fetch(url+'/api/files/read?path='+encodeURIComponent('../'+path.basename(workspace)+'-sibling/file.md'))).status,403);
 const outside=fs.mkdtempSync(path.join(os.tmpdir(),'outside-'));fs.writeFileSync(path.join(outside,'secret.md'),'secret');fs.symlinkSync(outside,path.join(workspace,'link'),'junction');
 assert.equal((await fetch(url+'/api/files/read?path=link/secret.md')).status,403);
 response=await fetch(url+'/api/markdown/render',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({markdown:'# Title\n- [x] Done\n<script>alert(1)</script><img src=x onerror=alert(1)>'})});const html=(await response.json()).html;assert.match(html,/<h1>/);assert.doesNotMatch(html,/script|onerror/);assert.match(html,/type="checkbox"/);assert.match(html,/disabled/);assert.match(html,/checked/);
 assert.equal((await fetch(url+'/api/workspace/clear',{method:'POST',headers:{Origin:'https://example.com'}})).status,403);
 assert.equal((await fetch(url+'/api/files/delete?path=demo.md',{method:'DELETE'})).status,200);assert.equal(fs.existsSync(path.join(workspace,'demo.md')),false);
 fs.rmSync(outside,{recursive:true,force:true});
 }finally{server.close();fs.rmSync(workspace,{recursive:true,force:true});}
});
