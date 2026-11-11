import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyPackage, validatePackage, allowed, acquireUpdateLock } from './update-package.mjs';
function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bulochka-update-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const source=path.join(dir,'source'), target=path.join(dir,'installed with spaces');
 fs.mkdirSync(source); fs.mkdirSync(target);
 const files=[];
 for(const name of ['runtime/bin/bridge.mjs','runtime/bin/supervisor.mjs','runtime/bin/engine.mjs','scripts/update-package.mjs','scripts/repair.sh','figma-desktop-bridge/ui.html','claude/knowledge/team-notes.md']) {
  const data=name.endsWith('.mjs')?'// valid JS\n':'new content';
  fs.mkdirSync(path.dirname(path.join(source,name)),{recursive:true});fs.writeFileSync(path.join(source,name),data);
  files.push({path:name,sha256:createHash('sha256').update(data).digest('hex')});
 }
 const manifest={schemaVersion:1,version:'4.28',files};
 const save=()=>fs.writeFileSync(path.join(source,'update-manifest.json'),JSON.stringify(manifest));save();
 return {dir,source,target,manifest,save};
}
test('verified update replaces runtime but preserves personal notes, runtime node and marker metadata',t=>{
 const f=fixture(t);
 fs.mkdirSync(path.join(f.target,'claude/knowledge'),{recursive:true});fs.writeFileSync(path.join(f.target,'claude/knowledge/team-notes.md'),'my notes');
 fs.writeFileSync(path.join(f.target,'.bulochka-install.json'),JSON.stringify({schemaVersion:1,distribution:'app',version:'4.27',configurationStatus:'ready'}));
 assert.equal(applyPackage(f.source,f.target),'4.28');
 assert.equal(fs.readFileSync(path.join(f.target,'claude/knowledge/team-notes.md'),'utf8'),'my notes');
 assert.equal(JSON.parse(fs.readFileSync(path.join(f.target,'.bulochka-install.json'))).configurationStatus,'ready');
 assert.ok(fs.existsSync(path.join(f.target,'runtime/bin/engine.mjs')));
});
test('corrupted download fails before changing the installed runtime',t=>{
 const f=fixture(t);fs.writeFileSync(path.join(f.source,'runtime/bin/engine.mjs'),'corrupted');
 assert.throws(()=>applyPackage(f.source,f.target),/сумма/);assert.deepEqual(fs.readdirSync(f.target),[]);
});
test('traversal, credentials and hidden files cannot enter the update',()=>{
 for(const name of ['../outside','/tmp/outside','scripts/../outside.mjs','claude/knowledge/../../token.md','.bulochka-install.json','runtime/node/bin/node','scripts/.hidden.mjs','claude/knowledge/a\\b.md']) assert.equal(allowed(name),false,name);
});
test('missing engine or a duplicate manifest entry fails validation',t=>{
 const f=fixture(t);f.manifest.files.push(f.manifest.files[0]);f.save();assert.throws(()=>validatePackage(f.source));
 f.manifest.files=f.manifest.files.filter(e=>e.path!=='runtime/bin/engine.mjs');f.save();assert.throws(()=>validatePackage(f.source));
});
test('invalid new JavaScript is rejected before commit',t=>{
 const f=fixture(t);const data='invalid javascript !!!';fs.writeFileSync(path.join(f.source,'runtime/bin/engine.mjs'),data);
 f.manifest.files.find(e=>e.path==='runtime/bin/engine.mjs').sha256=createHash('sha256').update(data).digest('hex');f.save();
 assert.throws(()=>applyPackage(f.source,f.target),/JavaScript/);assert.deepEqual(fs.readdirSync(f.target),[]);
});
test('a foreign symlink causes rollback of already copied files',t=>{
 const f=fixture(t);const outside=path.join(f.dir,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(f.target,'figma-desktop-bridge'));
 assert.throws(()=>applyPackage(f.source,f.target),/ссылку/);
 assert.equal(fs.existsSync(path.join(f.target,'runtime/bin/bridge.mjs')),false);
 assert.deepEqual(fs.readdirSync(outside),[]);
});


test('update lock rejects concurrent work and releases only its own ownership', t => {
 const f=fixture(t);const release=acquireUpdateLock(f.target);
 assert.throws(()=>acquireUpdateLock(f.target), /уже выполняется/);
 release();const releaseAgain=acquireUpdateLock(f.target);releaseAgain();
 assert.equal(fs.existsSync(path.join(f.target,'.bulochka-update.lock')),false);
});
test('a lock left by a dead updater is recovered without manual cleanup', t => {
 const f=fixture(t);const lock=path.join(f.target,'.bulochka-update.lock');fs.mkdirSync(lock);
 fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:2147483647,token:'dead'}));
 const release=acquireUpdateLock(f.target);release();assert.equal(fs.existsSync(lock),false);
});
