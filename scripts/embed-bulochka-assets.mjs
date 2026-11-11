import { readFileSync, writeFileSync } from 'node:fs';

// Old illustrations remain in assets/ but are no longer shipped to every window.
const ui = new URL('../figma-desktop-bridge/ui.html', import.meta.url);
const asset = readFileSync(new URL('../figma-desktop-bridge/assets/bulochka-pixel-cutout-v1.webp', import.meta.url));
if (asset.length > 64 * 1024) throw new Error('Mascot exceeds 64 KiB');
const html = readFileSync(ui, 'utf8');
const pattern = /\/\*BAKE-VARS-START\*\/[\s\S]*?\/\*BAKE-VARS-END\*\//;
if (!pattern.test(html)) throw new Error('Missing asset markers');
writeFileSync(ui, html.replace(pattern, `/*BAKE-VARS-START*/:root{--bake-cutout:url("data:image/webp;base64,${asset.toString('base64')}")}/*BAKE-VARS-END*/`));
console.log('Embedded the Bulochka mascot');
