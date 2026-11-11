#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { applyPackage, validatePackage, acquireUpdateLock } from './update-package.mjs';
function markerAt(target) {
  const file=path.join(target,'.bulochka-install.json');
  if(fs.lstatSync(file).isSymbolicLink())throw new Error('Папка установки содержит постороннюю ссылку.');
  const marker=JSON.parse(fs.readFileSync(file,'utf8'));
  if(marker.schemaVersion!==1 || !['app','terminal'].includes(marker.distribution))throw new Error('В выбранной папке находится другой проект. Его файлы сохранены.');
  return marker;
}
export function bootstrapPackage(source,target,nodeRoot) {
  const manifest=validatePackage(source);
  if(fs.existsSync(target)) {
    if(fs.lstatSync(target).isSymbolicLink() || !fs.lstatSync(target).isDirectory())throw new Error('Место установки занято другим файлом или ссылкой.');
    try { markerAt(target); } catch { throw new Error('В выбранной папке находится другой проект. Его файлы сохранены.'); }
  }
  fs.mkdirSync(target,{recursive:true});
  const release=acquireUpdateLock(target);
  try {
    const nodeTarget=path.join(target,'runtime/node');
    for(const relative of ['runtime','runtime/node','runtime/node/bin']) {
      const directory=path.join(target,relative);
      if(fs.existsSync(directory) && (fs.lstatSync(directory).isSymbolicLink() || !fs.lstatSync(directory).isDirectory()))throw new Error('Папка движка заменена посторонней ссылкой.');
    }
    const executable=path.join(nodeTarget,'bin/node');
    if(!fs.existsSync(executable) || path.resolve(nodeRoot)!==path.resolve(nodeTarget)) {
      if(fs.existsSync(executable) && (!fs.lstatSync(executable).isFile() || fs.lstatSync(executable).isSymbolicLink()))throw new Error('Движок заменён посторонней ссылкой.');
      fs.mkdirSync(path.dirname(executable),{recursive:true});
      const temp=executable+'.'+randomUUID();
      fs.copyFileSync(path.join(nodeRoot,'bin/node'),temp);fs.chmodSync(temp,0o755);fs.renameSync(temp,executable);
      fs.copyFileSync(path.join(nodeRoot,'LICENSE'),path.join(nodeTarget,'LICENSE'));
    } else if(fs.lstatSync(executable).isSymbolicLink() || !fs.lstatSync(executable).isFile())throw new Error('Движок заменён посторонней ссылкой.');
    const version=applyPackage(source,target);
    writeMarker(target,{schemaVersion:1,distribution:'terminal',version,configurationStatus:'incomplete'});
    return version;
  } finally {release();}
}
function writeMarker(target,data) {
  const file=path.join(target,'.bulochka-install.json'),temporary=file+'.'+randomUUID();
  fs.writeFileSync(temporary,JSON.stringify(data)+'\n',{mode:0o600});fs.renameSync(temporary,file);
}
if(process.argv[1] && fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(process.argv[2]==='--ready') {
      const target=process.argv[3];writeMarker(target,{...markerAt(target),configurationStatus:'ready'});
    } else console.log('Булочка '+bootstrapPackage(process.argv[2],process.argv[3],process.argv[4]));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
