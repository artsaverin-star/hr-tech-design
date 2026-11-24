#!/usr/bin/env node
// Assembles figma-desktop-bridge/ui.html from modular src/plugin-ui/ sources,
// bulochka.version.json (single source of truth), and the embedded pixel mascot.
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const read = rel => readFileSync(new URL(rel, root), 'utf8');

const meta = JSON.parse(read('bulochka.version.json'));
const mascot = readFileSync(new URL('figma-desktop-bridge/assets/bulochka-pixel-cutout-v1.webp', root));
if (mascot.length > 64 * 1024) throw new Error('Mascot exceeds 64 KiB');

const styles = read('src/plugin-ui/styles.css').replace(
  /\/\*BAKE-VARS-START\*\/[\s\S]*?\/\*BAKE-VARS-END\*\//,
  `/*BAKE-VARS-START*/:root{--bake-cutout:url("data:image/webp;base64,${mascot.toString('base64')}")}/*BAKE-VARS-END*/`
);

const rpcJs = read('src/plugin-ui/rpc-bridge.js');
const wsJs = read('src/plugin-ui/ws-client.js');
const appJs = read('src/plugin-ui/app.js')
  .replace(/__UI_VERSION__/g, meta.version)
  .replace(/__BRIDGE_VERSION__/g, meta.bridgeVersion);
const keepAliveJs = read('src/plugin-ui/keep-alive.js');

const template = read('src/plugin-ui/template.html')
  .replace(/__UI_VERSION__/g, meta.version)
  .replace('/*__BULOCHKA_STYLES__*/', () => styles)
  .replace('/*__BULOCHKA_SCRIPT_RPC__*/', () => rpcJs)
  .replace('/*__BULOCHKA_SCRIPT_WS__*/', () => wsJs)
  .replace('/*__BULOCHKA_SCRIPT_APP__*/', () => appJs)
  .replace('/*__BULOCHKA_SCRIPT_KEEPALIVE__*/', () => keepAliveJs);

// Verify every inline script compiles cleanly before writing output.
const scripts = [...template.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
scripts.forEach((source, i) => new vm.Script(source, { filename: `ui-inline-${i + 1}.js` }));

const outPath = new URL('figma-desktop-bridge/ui.html', root);
writeFileSync(outPath, template, 'utf8');
console.log(`Built figma-desktop-bridge/ui.html: v${meta.version} (bridge v${meta.bridgeVersion}), ${scripts.length} scripts, ${Math.round(Buffer.byteLength(template) / 1024)} KiB`);
