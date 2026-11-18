#!/usr/bin/env node
// Read-only Figma inventory and resumable content index. No dependencies.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readIndex} from './index-io.mjs';
import {DEFAULT_TEAM_ID, resolveCatalogPath, discoveryHint} from './catalog-path.mjs';

const args = process.argv.slice(2);
const command = args.shift() || 'status';
const option = (key, fallback) => { const i=args.indexOf(key); return i<0 ? fallback : args[i+1]; };
const teamId = option('--team', DEFAULT_TEAM_ID);
let catalogPath, base, catalog;
const now = () => new Date().toISOString();
const read = async (p, fallback) => { try { return JSON.parse(await fs.readFile(p,'utf8')); } catch(e) { if(e.code==='ENOENT') return fallback; throw e; } };
async function write(p,data) { await fs.mkdir(path.dirname(p),{recursive:true}); await fs.writeFile(p+'.tmp',JSON.stringify(data,null,2)+'\n'); await fs.rename(p+'.tmp',p); }
let token;
let lastRequest = 0;
class ApiError extends Error { constructor(status,message,retryAfter){super(message);this.status=status;this.retryAfter=retryAfter;} }
async function api(endpoint, rateAttempt=0) {
  if (!token) { try {token=(await fs.readFile(path.join(os.homedir(),'.hrtech/figma-token'),'utf8')).trim();} catch {} token ||= process.env.FIGMA_ACCESS_TOKEN; }
  if (!token) throw new Error('Figma token missing: configure Bulochka token or FIGMA_ACCESS_TOKEN. Never pass tokens as CLI arguments.');
  if (!/^\/v[12]\/(teams|folders|files)\/[a-zA-Z0-9]+(?:[/?]|$)/.test(endpoint)) throw new Error('Unexpected read endpoint');
  const slot = Math.max(Date.now(),lastRequest+Number(option('--interval-ms','800')));
  lastRequest=slot;
  const delay = slot-Date.now();
  if (delay) await new Promise(r=>setTimeout(r,delay));
  const headers = token.startsWith('figu_') ? {Authorization:`Bearer ${token}`} : {'X-Figma-Token':token};
  const res=await fetch('https://api.figma.com'+endpoint,{headers,signal:AbortSignal.timeout(180000)});
  if(!res.ok) {
    const retry=res.headers.get('retry-after');
    let detail; try {const d=await res.json(); detail=d.message||d.err||d.error;} catch {}
    const error=new ApiError(res.status,`HTTP ${res.status} ${endpoint}: ${typeof detail==='string'?detail.slice(0,700):res.statusText}`,retry);
    const retryLimit=Math.min(3,Math.max(0,Number(option('--rate-limit-retries','0'))));
    const waitSeconds=Number(retry);
    if(res.status===429&&rateAttempt<retryLimit&&Number.isFinite(waitSeconds)&&waitSeconds>0&&waitSeconds<=60){
      console.log(JSON.stringify({retrying:endpoint,rateAttempt:rateAttempt+1,retryAfter:waitSeconds}));
      await new Promise(r=>setTimeout(r,waitSeconds*1000));
      return api(endpoint,rateAttempt+1);
    }
    throw error;
  }
  return res.json();
}
function coverage() {
  const counts={}; for(const f of catalog.files) counts[f.scanStatus||'metadata']=(counts[f.scanStatus||'metadata']||0)+1;
  const byDepth={};for(const f of catalog.files.filter(f=>f.indexPath))byDepth[String(f.depth??'unknown')]=(byDepth[String(f.depth??'unknown')]||0)+1;
  return {folders:catalog.folders.length,files:catalog.files.length,byStatus:counts,byDepth,
    pages:catalog.files.reduce((sum,f)=>sum+(f.stats?.pages||0),0),records:catalog.files.reduce((sum,f)=>sum+(f.stats?.records||0),0),
    inventoryComplete:catalog.inventoryComplete||false,limitations:['Only files visible to this Figma account in the selected team.','Drafts outside team folders, deleted files, history, comments and raster-only text are not indexed.']};
}
async function save() { catalog.coverage=coverage(); await write(catalogPath,catalog); }
function fileRecord(f,folder,parentKey) {
  return {key:f.key,name:f.name,folderId:folder.id,folderPath:folder.path,url:`https://www.figma.com/design/${f.key}`,editorType:f.editor_type||f.editorType,lastModified:f.last_modified||f.lastModified||null,parentKey:parentKey||null,scanStatus:'metadata'};
}
async function discover() {
  if (catalog.teamId!==teamId) throw new Error('Use a separate catalog path for another team.');
  catalog.inventoryComplete=false; catalog.discoveryStartedAt=now(); await save();
  const response=await api(`/v2/teams/${teamId}/folders`);
  const roots=response.folders;
  if(!Array.isArray(roots)) throw new Error(`Unexpected folders response keys: ${Object.keys(response)}`);
  catalog.teamName=response.name||response.team_name||catalog.teamName;
  const oldFiles=new Map(catalog.files.map(f=>[f.key,f]));
  const pending=roots.map(f=>({...f,path:f.name})); const seen=new Set();
  // Retain prior records during a partial inventory; prune only after a complete walk.
  const foundFiles=new Set();catalog.folders=[];catalog.errors=[];
  while(pending.length) {
    const folder=pending.shift(); if(seen.has(String(folder.id))) continue; seen.add(String(folder.id));
    const item={id:String(folder.id),name:folder.name,path:folder.path,parentId:folder.parent_folder_id||null};
    catalog.folders.push(item);
    try {
      const children=await api(`/v2/folders/${item.id}/folders`);
      if(!Array.isArray(children.folders)) throw new Error('Unexpected child folders response');
      pending.push(...children.folders.map(f=>({...f,path:item.path+' / '+f.name})));
      const data=await api(`/v2/folders/${item.id}/files?branch_data=true`);
      if(!Array.isArray(data.files)) throw new Error('Unexpected folder files response');
      for(const f of data.files) {
        const record=fileRecord(f,item); const old=oldFiles.get(record.key);
        const upsert = (r, previous) => {
          foundFiles.add(r.key);
          const updated={...previous,...r,scanStatus:previous?.indexPath && previous.lastModified!==r.lastModified?'stale':previous?.scanStatus||'metadata',indexPath:previous?.indexPath};
          if(!r.editorType&&previous?.editorType){updated.editorType=previous.editorType;updated.url=previous.url||r.url;}
          const i=catalog.files.findIndex(x=>x.key===r.key);if(i<0)catalog.files.push(updated);else catalog.files[i]=updated;
        };
        upsert(record,old);
        for(const branch of f.branches||[]) { const b=fileRecord(branch,item,f.key);upsert(b,oldFiles.get(b.key)); }
      }
      item.status='complete'; console.log(JSON.stringify({folder:item.path,files:data.files.length,totalFiles:catalog.files.length}));
    } catch(e) {
      item.status='error';catalog.errors.push({folderId:item.id,at:now(),message:e.message,retryAfter:e.retryAfter});
      if(e.status===429 || !e.status) { await save();throw e; }
    }
    await save();
  }
  if(catalog.errors.length===0) catalog.files=catalog.files.filter(f=>foundFiles.has(f.key));
  catalog.files=[...new Map(catalog.files.map(f=>[f.key,f])).values()];
  catalog.inventoryComplete=catalog.errors.length===0;catalog.scannedAt=now();await save();console.log(JSON.stringify(catalog.coverage));
}
function makeIndex(data,file,depth) {
  const records=[]; const stack=[{node:data.document,anc:[],page:null,visible:true}]; let nodes=0,texts=0;
  while(stack.length) {
    const {node:n,anc,page,visible}=stack.pop(); if(!n) continue; nodes++;
    const p=n.type==='CANVAS'?{id:n.id,name:n.name}:page;
    const vis=visible && n.visible!==false;
    const text=n.characters??n.text?.characters??'';
    const isText=typeof text==='string'&&text.length>0; if(isText) texts++;
    if(n.type!=='DOCUMENT' && (n.name || isText)) {
      records.push({id:n.id,type:n.type,name:n.name||'',...(text?{text}:{}),pageId:p?.id,pageName:p?.name,path:[...anc,n.name||n.type].join(' / '),url:file.url+'?node-id='+encodeURIComponent(n.id),visible:vis});
    }
    const nextAnc=n.type==='DOCUMENT'?anc:[...anc,n.name||n.type];
    for(let i=(n.children?.length||0)-1;i>=0;i--) stack.push({node:n.children[i],anc:nextAnc,page:p,visible:vis});
  }
  return {key:file.key,name:data.name||file.name,scannedAt:now(),version:data.version,lastModified:data.lastModified,depth,records,stats:{nodes,records:records.length,texts,pages:data.document?.children?.length||0}};
}
async function scanPage() {
  const key=option('--file',null), pageId=option('--page',null);
  const file=catalog.files.find(f=>f.key===key);
  if(!file||!pageId) throw new Error('page requires --file FILE_KEY and --page PAGE_ID from a discovered file');
  const previous=file.indexPath?await readIndex(path.join(base,file.indexPath)):null;
  const response=await api(`/v1/files/${key}/nodes?ids=${encodeURIComponent(pageId)}`);
  const page=response.nodes?.[pageId]?.document;
  if(!page||page.type!=='CANVAS') throw new Error('Requested node is not an accessible page');
  const partial=makeIndex({...response,document:{type:'DOCUMENT',children:[page]}},file,0);
  // Keep other pages only when their snapshot version agrees; otherwise old rows stay explicitly stale.
  const unchanged=previous?.version===response.version;
  const records=[...(previous?.records||[]).filter(r=>r.pageId!==pageId),...partial.records];
  const pageIds=records.filter(r=>r.type==='CANVAS').map(r=>r.id);
  const inheritedDepths=unchanged?(previous?.depth===0?Object.fromEntries(pageIds.map(id=>[id,0])):previous?.pageDepths):{};
  const pageDepths={...inheritedDepths,[pageId]:0};
  const stalePageIds=(unchanged?(previous?.stalePageIds||[]):previous?pageIds:[]).filter(id=>id!==pageId);
  const allPagesFull=!!previous&&unchanged&&pageIds.length>0&&pageIds.every(id=>pageDepths[id]===0)&&!stalePageIds.length;
  const index={...partial,depth:allPagesFull?0:previous?.depth||1,records,pageDepths,partial:true,
    baseScannedAt:previous?.baseScannedAt||previous?.scannedAt||partial.scannedAt,
    pageScannedAt:{...previous?.pageScannedAt,[pageId]:partial.scannedAt},
    stalePageIds,staleOtherPages:stalePageIds.length>0,
    stats:{records:records.length,texts:records.filter(r=>r.text).length,pages:pageIds.length}};
  file.indexPath||=`indexes/${key}.json`;
  await write(path.join(base,file.indexPath),index);
  file.scanStatus=allPagesFull?'full':'partial';file.scannedAt=now();file.stats=index.stats;file.depth=index.depth;file.lastModified=response.lastModified;delete file.error;
  await save();console.log(JSON.stringify({file:file.name,page:page.name,status:file.scanStatus,staleOtherPages:index.staleOtherPages,stats:index.stats}));
}
async function metadata() {
  const key=option('--file',null);
  for(const file of catalog.files.filter(f=>key?f.key===key:/File type not supported/.test(f.error?.message||''))) {
    try {
      const {file:meta}=await api(`/v1/files/${file.key}/meta`);
      if(!meta) throw new Error('Response has no metadata');
      file.editorType=meta.editorType;file.name=meta.name||file.name;
      if(meta.url&&/^https:\/\/(www\.)?figma\.com\//.test(meta.url))file.url=meta.url;
      if(/File type not supported/.test(file.error?.message||''))file.scanStatus='unsupported';
      file.metadataCheckedAt=now();await save();console.log(JSON.stringify({file:file.name,editorType:file.editorType,status:file.scanStatus}));
    } catch(e){console.error(e.message);if(e.status===429)throw e;}
  }
}
async function scan() {
  const depth=Number(option('--depth','0')); const limit=Number(option('--limit','1000000')); const key=option('--file',null);
  if(!Number.isInteger(depth)||depth<0) throw new Error('depth must be >=0 (0 means full tree)');
  const workers=Number(option('--workers','1'));
  if(!Number.isInteger(workers)||workers<1||workers>8||(depth===0&&workers>1)) throw new Error('workers must be 1..8; full-tree scan uses one worker');
  const queue=[];
  for(const f of catalog.files) {
    if(key && f.key!==key) continue;
    if(f.scanStatus==='unsupported'&&!args.includes('--force'))continue;
    let exists=false;if(f.indexPath) {try {await fs.access(path.resolve(base,f.indexPath));exists=true;}catch{}}
    const sufficient=f.depth===0||(depth>0&&f.depth>=depth);
    const limitedAttempt=!!f.limitedReason&&(f.attemptedDepth===0||(depth>0&&f.attemptedDepth>=depth));
    if(!args.includes('--force') && exists && ['full','structure'].includes(f.scanStatus) && (sufficient||limitedAttempt)) continue;
    if(queue.length>=limit) break;queue.push(f);
  }
  let stop=null;let saveChain=Promise.resolve();
  const checkpoint=()=>{saveChain=saveChain.then(save);return saveChain;};
  async function worker(){while(queue.length&&!stop){
    const f=queue.shift();
    try {
      let d,actualDepth=depth;
      try {d=await api(`/v1/files/${f.key}${depth?`?depth=${depth}`:''}`);}
      catch(e){
        if(e.status!==400 || !/too large/i.test(e.message) || depth===1) throw e;
        actualDepth=1;d=await api(`/v1/files/${f.key}?depth=1`);f.limitedReason='Figma rejected a larger response; page list saved. Read selected pages with the page command.';
      }
      if(!d.document) throw new Error('Response has no document');
      if(actualDepth===depth) delete f.limitedReason;
      const index=makeIndex(d,f,actualDepth);
      const indexPath=`indexes/${f.key}.json`;await write(path.join(base,indexPath),index);
      f.name=index.name;f.lastModified=index.lastModified;f.indexPath=indexPath;f.scanStatus=actualDepth===0?'full':'structure';f.scannedAt=index.scannedAt;f.depth=actualDepth;f.attemptedDepth=depth;f.stats=index.stats;delete f.error;
      console.log(JSON.stringify({file:f.name,status:f.scanStatus,...index.stats}));
    } catch(e) {
      f.scanStatus=f.indexPath?'stale':'error';f.error={message:e.message,at:now(),retryAfter:e.retryAfter};
      if(e.status===400&&/File type not supported/.test(e.message))f.scanStatus='unsupported';
      console.log(JSON.stringify({file:f.name,error:e.message,retryAfter:e.retryAfter}));
      if(e.status===429) stop=e;
    }
    await checkpoint();
  }}
  await Promise.all(Array.from({length:workers},worker));
  if(stop)throw stop;
  catalog.contentScannedAt=now();await save();console.log(JSON.stringify(catalog.coverage));
}
try {
  catalogPath = await resolveCatalogPath({catalog:option('--catalog',undefined),teamId});
  base = path.dirname(catalogPath);
  catalog = await read(catalogPath,null);
  if (!catalog) {
    if (command !== 'discover') throw new Error(`Локальный каталог ещё не создан: ${catalogPath}\n${discoveryHint(catalogPath)}`);
    catalog = {schemaVersion:1,teamId,folders:[],files:[],errors:[]};
  }
  if(!Array.isArray(catalog.files)||!Array.isArray(catalog.folders)) throw new Error('Неверный каталог: files и folders должны быть массивами');
  if(command==='discover') await discover();
  else if(command==='scan') await scan();
  else if(command==='page') await scanPage();
  else if(command==='metadata') await metadata();
  else if(command==='status') console.log(JSON.stringify({catalog:catalogPath,...coverage(),scannedAt:catalog.scannedAt,errors:catalog.errors,...(catalog.files.length?{}:{nextStep:discoveryHint(catalogPath)})},null,2));
  else throw new Error('Usage: scan.mjs discover|scan|page|metadata|status [--catalog PATH] [--team ID] [--depth 0] [--file KEY] [--page ID] [--force]');
} catch(e) {console.error(e.message);if(e.retryAfter)console.error(`Retry-After: ${e.retryAfter}; rerun after this interval.`);process.exitCode=1;}
