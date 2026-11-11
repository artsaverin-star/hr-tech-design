// Isolated real-bundle MCP + simulated Figma test. No user config or real documents.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import WebSocket from 'ws';
const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = fs.mkdtempSync(path.join(root, 'bulochka-connection-fix/live-'));
const engine = path.join(scratch, 'runtime/bin/engine.mjs');
fs.mkdirSync(path.dirname(engine), { recursive: true });
fs.mkdirSync(path.join(scratch, 'user')); fs.mkdirSync(path.join(scratch, 'tmp'));
fs.copyFileSync(path.join(root, 'runtime/bin/engine.mjs'), engine);
fs.copyFileSync(path.join(root, 'package.json'), path.join(scratch, 'package.json'));
const runner = path.join(scratch, 'runner.mjs');
fs.writeFileSync(runner, `import {startSupervisor} from ${JSON.stringify(new URL('../runtime/bin/supervisor.mjs', import.meta.url).href)};startSupervisor({engine:${JSON.stringify(engine)},pollMs:100});`);
const client = new Client({name:'Codex update acceptance',version:'1'}, {capabilities:{}});
const transport = new StdioClientTransport({ command:process.execPath,args:[runner],stderr:'pipe', env:{...process.env, HOME:path.join(scratch,'user'),TMPDIR:path.join(scratch,'tmp'),FIGMA_WS_PORT:'19583',LOG_LEVEL:'error'} });
transport.stderr?.resume();
let stopped=false, hellos=[], sockets=new Set();
const reconnectTimers=new Set();
function connect(fileKey) {
 if(stopped)return;
 const ws=new WebSocket('ws://localhost:19583');sockets.add(ws);
 ws.on('error',()=>{});
 ws.on('open',()=>ws.send(JSON.stringify({type:'FILE_INFO',data:{fileKey,fileName:fileKey,currentPage:'Test'}})));
 ws.on('message',raw=>{
  const m=JSON.parse(raw);
  if(m.type==='SERVER_HELLO')hellos.push(m.data);
  if(m.id&&m.method)ws.send(JSON.stringify({id:m.id,result:{success:true,value:'ok'}}));
 });
 ws.on('close',()=>{sockets.delete(ws);if(!stopped){const timer=setTimeout(()=>{reconnectTimers.delete(timer);connect(fileKey);},100);reconnectTimers.add(timer);}});
}
async function until(check) {const deadline=Date.now()+15000;while(!await check()){assert.ok(Date.now()<deadline,'live check timed out');await new Promise(r=>setTimeout(r,100));}}
const call=async(name,args={})=>client.callTool({name,arguments:args});
const data=result=>JSON.parse(result.content.find(c=>c.type==='text').text);
try {
 await client.connect(transport);
 const tools=await client.listTools();assert.ok(tools.tools.some(t=>t.name==='figma_execute'));
 connect('A');connect('B');
 await until(async()=>data(await call('figma_list_open_files')).totalFiles===2);
 const pin=await call('figma_pin_file',{fileKey:'A'});assert.equal(data(pin).pinnedFileKey,'A');
 const oldPid=hellos.at(-1).pid;
 fs.appendFileSync(engine,'\n// acceptance hot update\n');
 await until(()=>hellos.some(h=>h.pid!==oldPid));
 await until(async()=>data(await call('figma_list_open_files')).totalFiles===2);
 const files=data(await call('figma_list_open_files'));
 assert.equal(files.pinnedFileKey,'A');assert.equal(files.activeFileKey,'A');
 const newHello=hellos.find(h=>h.pid!==oldPid);
 assert.equal(newHello.mcpClient.name,'Codex update acceptance');
 console.log(JSON.stringify({passed:true,tools:tools.tools.length,enginePidChanged:true,mcpClientUnchanged:true,files:files.totalFiles,pinPreserved:true,bridgeProtocol:newHello.bridgeProtocol}));
} finally {
 stopped=true;for(const timer of reconnectTimers)clearTimeout(timer);for(const socket of sockets)socket.terminate();
 await client.close();
 fs.rmSync(scratch,{recursive:true,force:true});
}
