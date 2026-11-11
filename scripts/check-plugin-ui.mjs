import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../figma-desktop-bridge/ui.html', import.meta.url), 'utf8');
const plugin = readFileSync(new URL('../figma-desktop-bridge/code.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/core/websocket-server.ts', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
scripts.forEach((source, i) => new vm.Script(source, { filename: `ui-inline-${i + 1}.js` }));
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
if (new Set(ids).size !== ids.length) throw new Error('Duplicate UI ids');
const versions = [
  html.match(/var HRTECH_UI_VERSION = '([^']+)'/)?.[1],
  plugin.match(/globalThis\.hrtechVersion = '([^']+)'/)?.[1],
  server.match(/const HRTECH_VERSION = '([^']+)'/)?.[1],
];
if (versions.some(v => v !== '4.30')) throw new Error(`Version mismatch: ${versions.join(', ')}`);
if (Buffer.byteLength(html) > 250 * 1024) throw new Error('Plugin UI exceeds the 250 KiB budget');
const mascot = readFileSync(new URL('../figma-desktop-bridge/assets/bulochka-pixel-cutout-v1.webp', import.meta.url));
const embedded = [...html.matchAll(/--bake-cutout:url\("data:image\/webp;base64,([A-Za-z0-9+/=]+)"\)/g)];
if (embedded.length !== 1 || !Buffer.from(embedded[0][1], 'base64').equals(mascot)) throw new Error('Embedded mascot must match its source');
for (const obsolete of ['hrtech-splash', 'HRTECH_BUN_STATES', 'BULOCHKA_HERO_START', '--bake-landing-stories']) {
  if (html.includes(obsolete)) throw new Error(`Unused decoration remains: ${obsolete}`);
}
const callbacks = [...html.matchAll(/onclick="([A-Za-z_$][\w$]*)\(/g)].map(m => m[1]);
for (const callback of new Set(callbacks)) {
  if (!scripts.some(s => s.includes(`function ${callback}(`))) throw new Error(`Missing callback: ${callback}`);
}
console.log(`Plugin UI OK: ${scripts.length} scripts, ${ids.length} unique ids, v${versions[0]}, ${Math.round(Buffer.byteLength(html) / 1024)} KiB`);
