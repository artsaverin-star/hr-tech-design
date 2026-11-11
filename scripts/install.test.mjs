import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
function write(file,data,executable=false){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data,{mode:executable?0o755:0o644});}
function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bulochka-terminal-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const home=path.join(dir,'user'),bin=path.join(dir,'bin'),source=path.join(dir,'download'),target=path.join(home,'Library/Application Support/Bulochka'),calls=path.join(dir,'calls');
 fs.mkdirSync(home);fs.mkdirSync(bin);
 const env={PATH:bin+':/usr/bin:/bin',HOME:home,TMPDIR:dir,BULOCHKA_INSTALL_DIR:target,BULOCHKA_INSTALL_LOG:path.join(dir,'install.log'),FIXTURE_SOURCE:source,FIXTURE_DIR:dir,FIXTURE_CALLS:calls};
 function stub(name,body){write(path.join(bin,name),'#!/bin/bash\nprintf \'%s\\n\' \''+name+':\'"$*" >> "$FIXTURE_CALLS"\n'+body+'\n',true);}
 stub('uname','if [ "$1" = -m ]; then echo "${FIXTURE_ARCH:-arm64}"; else echo "${FIXTURE_OS:-Darwin}"; fi');
 stub('sw_vers','echo "${FIXTURE_MACOS:-14.0}"');
 stub('curl',`[ "$FIXTURE_DOWNLOAD_FAIL" != 1 ] || exit 22
output='';url=''
while [ "$#" -gt 0 ]; do case "$1" in -o) output="$2";shift 2;; https://*) url="$1";shift;; *) shift;; esac;done
[ -n "$output" ] || exit 2
printf '%s' "$url" > "$output"`);
 stub('tar',`[ "$FIXTURE_ARCHIVE_FAIL" != 1 ] || exit 1
archive='';destination=''
while [ "$#" -gt 0 ];do case "$1" in -xzf) archive="$2";shift 2;; -C) destination="$2";shift 2;; *)shift;;esac;done
if [[ "$archive" = */package.tar.gz ]];then cp -R "$FIXTURE_SOURCE" "$destination/hr-tech-design-main";
else mkdir -p "$destination/node-v24.22.2-darwin-arm64" "$destination/node-v24.22.2-darwin-x64";cp -R "$FIXTURE_DIR/node/." "$destination/node-v24.22.2-darwin-arm64/";cp -R "$FIXTURE_DIR/node/." "$destination/node-v24.22.2-darwin-x64/";fi`);
 stub('shasum','if [ "$FIXTURE_BAD_SHA" = 1 ];then echo bad;elif [ "$FIXTURE_ARCH" = x86_64 ];then echo d5e336d588c45be0c37dbd52cc29895593009ca4997a77a1fd02815131ed0e52;else echo aa9549349e47dffaa42dcf95d6e06ade8c4bdafc980979883b88767670df385a;fi');
 for(const name of ['git','brew','sudo','xcode-select'])stub(name,'exit 99');
 write(path.join(dir,'node/bin/node'),'#!/bin/sh\nexec '+JSON.stringify(process.execPath)+' "$@"\n',true);write(path.join(dir,'node/LICENSE'),'Node license');
 for(const name of ['update-package.mjs','bootstrap-package.mjs'])write(path.join(source,'scripts',name),fs.readFileSync(path.join(root,'scripts',name)));
 write(path.join(source,'scripts/agent-paths.sh'),`NODE_BIN="$DIR/runtime/node/bin/node"\nCODEX_BIN="fixture-codex"\nCLAUDE_BIN=""\nCLAUDE_DESKTOP_APP=""\n`);
 write(path.join(source,'scripts/install-next-steps.sh'),fs.readFileSync(path.join(root,'scripts/install-next-steps.sh')));
 write(path.join(source,'scripts/repair.sh'),'#!/bin/sh\nexit 0\n');
 write(path.join(source,'setup.sh'),'#!/bin/sh\necho "setup:$BULOCHKA_INSTALLER" >> "$FIXTURE_CALLS"\n[ "$FIXTURE_SETUP_FAIL" != 1 ]\n');
 for(const name of ['bridge','supervisor','engine'])write(path.join(source,'runtime/bin',name+'.mjs'),'// test '+name);
 write(path.join(source,'figma-desktop-bridge/ui.html'),'<html>test</html>');
 write(path.join(source,'claude/knowledge/team-notes.md'),'default notes');
 const manifest={schemaVersion:1,version:'4.28',files:[]};
 function scan(relative='') {for(const name of fs.readdirSync(path.join(source,relative))){const rel=relative?relative+'/'+name:name;const file=path.join(source,rel);if(fs.statSync(file).isDirectory())scan(rel);else manifest.files.push({path:rel,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')});}}
 scan();write(path.join(source,'update-manifest.json'),JSON.stringify(manifest));
 return {dir,home,bin,source,target,calls,env};
}
function run(f,extra={}){const r=spawnSync('/bin/bash',[path.join(root,'install.sh')],{env:{...f.env,...extra},encoding:'utf8',timeout:15000});r.all=r.stdout+r.stderr;r.calls=fs.existsSync(f.calls)?fs.readFileSync(f.calls,'utf8'):'';return r;}
function stopped(r){assert.notEqual(r.status,0,r.all);assert.doesNotMatch(r.all,/✓ Булочка настроена/);}
test('one command installs a private runtime and configures an assistant without git, Homebrew or sudo',t=>{
 const f=fixture(t),r=run(f);assert.equal(r.status,0,r.all);
 const marker=JSON.parse(fs.readFileSync(path.join(f.target,'.bulochka-install.json')));assert.equal(marker.distribution,'terminal');assert.equal(marker.configurationStatus,'ready');
 assert.ok(fs.existsSync(path.join(f.target,'runtime/node/bin/node')));assert.match(r.calls,/setup:1/);assert.doesNotMatch(r.calls,/^(git|brew|sudo|xcode-select):/m);assert.match(r.all,/Настроена|настроена/);assert.doesNotMatch(r.all,/⌘Q|Полностью закройте/);
});
test('Intel Macs receive the x64 runtime',t=>{const f=fixture(t),r=run(f,{FIXTURE_ARCH:'x86_64'});assert.equal(r.status,0,r.all);assert.match(r.calls,/node-v24.22.2-darwin-x64/);});
test('the same command repairs an existing installation and preserves personal notes',t=>{
 const f=fixture(t);assert.equal(run(f).status,0);write(path.join(f.target,'claude/knowledge/team-notes.md'),'personal notes');fs.writeFileSync(f.calls,'');
 const r=run(f);assert.equal(r.status,0,r.all);assert.equal(fs.readFileSync(path.join(f.target,'claude/knowledge/team-notes.md'),'utf8'),'personal notes');assert.doesNotMatch(r.calls,/nodejs.org/);
});
test('a previous app installation migrates to terminal installation in the same directory',t=>{
 const f=fixture(t);assert.equal(run(f).status,0);const marker=path.join(f.target,'.bulochka-install.json');fs.writeFileSync(marker,JSON.stringify({schemaVersion:1,distribution:'app',version:'4.27'}));
 assert.equal(run(f).status,0);assert.equal(JSON.parse(fs.readFileSync(marker)).distribution,'terminal');
});
for(const extra of [{FIXTURE_DOWNLOAD_FAIL:'1'},{FIXTURE_ARCHIVE_FAIL:'1'},{FIXTURE_BAD_SHA:'1'},{FIXTURE_OS:'Linux'},{FIXTURE_MACOS:'13.4'}])test('failed provisioning preserves the machine: '+JSON.stringify(extra),t=>{
 const f=fixture(t),r=run(f,extra);stopped(r);assert.equal(fs.existsSync(f.target),false);assert.doesNotMatch(r.calls,/setup:/);
});
test('an unrelated directory is never overwritten',t=>{const f=fixture(t);write(path.join(f.target,'keep.txt'),'user work');const r=run(f);stopped(r);assert.equal(fs.readFileSync(path.join(f.target,'keep.txt'),'utf8'),'user work');assert.doesNotMatch(r.calls,/setup:/);});
test('setup failure is retryable and never prints success',t=>{const f=fixture(t);stopped(run(f,{FIXTURE_SETUP_FAIL:'1'}));assert.equal(JSON.parse(fs.readFileSync(path.join(f.target,'.bulochka-install.json'))).configurationStatus,'incomplete');assert.equal(run(f).status,0);});
test('a tampered package fails before target creation',t=>{const f=fixture(t);fs.appendFileSync(path.join(f.source,'runtime/bin/engine.mjs'),'tampered');const r=run(f);stopped(r);assert.equal(fs.existsSync(f.target),false);});
