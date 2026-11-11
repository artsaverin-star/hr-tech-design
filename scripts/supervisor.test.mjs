import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const supervisor = fileURLToPath(new URL('../runtime/bin/supervisor.mjs', import.meta.url));
function engineSource(version) {
  return `import readline from 'node:readline';
let client;
const version = ${JSON.stringify(version)};
function reply(id, result) { console.log(JSON.stringify({jsonrpc:'2.0',id,result})); }
readline.createInterface({input:process.stdin}).on('line', line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize') {client=m.params.clientInfo; reply(m.id,{protocolVersion:'2024-11-05',capabilities:{tools:{listChanged:true}},serverInfo:{name:'test',version}});}
 else if(m.method==='crash') process.exit(2);
 else if(m.method==='tools/call') {
   if(m.params.name==='figma_pin_file') reply(m.id,{content:[{type:'text',text:JSON.stringify({status:'pinned',pinnedFileKey:m.params.arguments.fileKey})}]});
   else if(m.params.name==='figma_unpin_file') reply(m.id,{content:[{type:'text',text:JSON.stringify({status:'unpinned'})}]});
   else setTimeout(()=>reply(m.id,{version,pin:process.env.BULOCHKA_SESSION_FILE_KEY,client}),m.params.arguments?.delay||0);
 } else if(m.method==='ping') reply(m.id,{version,pin:process.env.BULOCHKA_SESSION_FILE_KEY,client});
});`;
}
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulochka-supervisor-test-'));
  const engine = path.join(dir, 'engine.mjs');
  fs.writeFileSync(engine, engineSource('1'));
  const runner = path.join(dir, 'runner.mjs');
  fs.writeFileSync(runner, `import {startSupervisor} from ${JSON.stringify('file://' + supervisor)};startSupervisor({engine:${JSON.stringify(engine)},pollMs:25});`);
  const child = spawn(process.execPath, [runner], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '', nextId = 1;
  const responses = new Map(), notices = [], errors = [];
  child.stderr.on('data', c => errors.push(c.toString()));
  child.stdout.on('data', c => {
    buffer += c;
    let pos;
    while ((pos = buffer.indexOf('\n')) >= 0) {
      const m = JSON.parse(buffer.slice(0,pos)); buffer=buffer.slice(pos+1);
      if(m.id!==undefined) responses.set(m.id,m); else notices.push(m);
    }
  });
  const send = m => child.stdin.write(JSON.stringify({jsonrpc:'2.0',...m})+'\n');
  async function until(check) {
    const deadline=Date.now()+5000;
    while(!check()) {
      assert.equal(child.exitCode,null, errors.join(''));
      assert.ok(Date.now()<deadline,'timed out: '+errors.join(''));
      await new Promise(r=>setTimeout(r,10));
    }
  }
  async function request(method,params={}) {
    const id=nextId++; send({id,method,params}); await until(()=>responses.has(id)); return responses.get(id);
  }
  t.after(async()=>{
    child.stdin.end();
    await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,1000))]);
    if(child.exitCode===null) child.kill('SIGKILL');
    fs.rmSync(dir,{recursive:true,force:true});
  });
  const result = await request('initialize',{clientInfo:{name:'Codex',version:'test'},capabilities:{},protocolVersion:'2024-11-05'});
  assert.equal(result.result.serverInfo.version,'1');
  send({method:'notifications/initialized'});
  return {child,engine,request,send,notices,until, update(version){fs.writeFileSync(engine,engineSource(version));}};
}
test('engine update keeps the same stdio connection and repeats the original client handshake',async t=>{
 const f=await fixture(t); const pid=f.child.pid;
 f.update('2'); await f.until(()=>f.notices.some(m=>m.method==='notifications/tools/list_changed'));
 const response=await f.request('ping');
 assert.equal(f.child.pid,pid); assert.equal(response.result.version,'2'); assert.equal(response.result.client.name,'Codex');
});
test('an in-flight command finishes once on the old engine before reload',async t=>{
 const f=await fixture(t);
 const pending=f.request('tools/call',{name:'work',arguments:{delay:250}});
 f.update('2'); const response=await pending;
 assert.equal(response.result.version,'1');
 await f.until(()=>f.notices.length>0);
 assert.equal((await f.request('ping')).result.version,'2');
});
test('session pin survives engine replacement and compare-and-release is respected',async t=>{
 const f=await fixture(t);
 await f.request('tools/call',{name:'figma_pin_file',arguments:{fileKey:'file-A'}});
 f.update('2'); await f.until(()=>f.notices.length>0);
 assert.equal((await f.request('ping')).result.pin,'file-A');
 await f.request('tools/call',{name:'figma_unpin_file',arguments:{fileKey:'file-A'}});
 f.update('3'); await f.until(()=>f.notices.length>1);
 assert.equal((await f.request('ping')).result.pin,'');
});
test('a crashed write returns an error and is never replayed',async t=>{
 const f=await fixture(t);
 const response=await f.request('crash');
 assert.match(response.error.message,/Команда не повторялась/);
 f.update('2'); await f.until(()=>f.notices.length>0);
 assert.equal((await f.request('ping')).result.version,'2');
});
test('two assistants keep independent file locks across the same update',async t=>{
 const a=await fixture(t), b=await fixture(t);
 await a.request('tools/call',{name:'figma_pin_file',arguments:{fileKey:'A'}});
 await b.request('tools/call',{name:'figma_pin_file',arguments:{fileKey:'B'}});
 a.update('2'); b.update('2'); await Promise.all([a.until(()=>a.notices.length),b.until(()=>b.notices.length)]);
 assert.equal((await a.request('ping')).result.pin,'A'); assert.equal((await b.request('ping')).result.pin,'B');
});
