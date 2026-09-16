import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const uiPath = join(root, 'figma-desktop-bridge', 'ui.html');
let html = readFileSync(uiPath, 'utf8');

const assets = [
  {
    marker: 'BULOCHKA_HERO',
    file: 'bulochka-designer-hero.webp',
    alt: 'Булочка за рабочим столом переносит макеты в прототип',
  },
  // BULOCHKA_FLOW жил в виде «Инструменты» (кнопки-действия очереди). Вид удалён в 4.13
  // вместе с конвейером, ассет bulochka-prototype-flow.* остался сиротой.
];

const cutoutAsset = 'bulochka-pixel-cutout-v1.webp';
const statesAsset = 'bulochka-states-25-v2-crisp.png';
const workspaceBackgroundAsset = 'bulochka-workspace-night-v2.webp';
const skillStoriesAsset = 'bulochka-skill-stories-6-v2.webp';

function replaceMarkedBlock(source, start, end, replacement) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Missing ${start} / ${end} markers in ui.html`);
  return source.slice(0, startIndex) + replacement + source.slice(endIndex + end.length);
}

for (const asset of assets) {
  const bytes = readFileSync(join(root, 'figma-desktop-bridge', 'assets', asset.file));
  const dataUrl = `data:image/webp;base64,${bytes.toString('base64')}`;
  const start = `<!-- ${asset.marker}_START -->`;
  const end = `<!-- ${asset.marker}_END -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (!pattern.test(html)) throw new Error(`Missing ${asset.marker} markers in ui.html`);
  html = html.replace(pattern, `${start}<img src="${dataUrl}" alt="${asset.alt}" />${end}`);
}

const cutoutBytes = readFileSync(join(root, 'figma-desktop-bridge', 'assets', cutoutAsset));
if (cutoutBytes.length > 64 * 1024) {
  throw new Error(`${cutoutAsset} is ${cutoutBytes.length} bytes; the plugin cutout must stay below 64 KiB`);
}
const cutoutDataUrl = `data:image/webp;base64,${cutoutBytes.toString('base64')}`;
const statesBytes = readFileSync(join(root, 'figma-desktop-bridge', 'assets', statesAsset));
if (statesBytes.length > 128 * 1024) {
  throw new Error(`${statesAsset} is ${statesBytes.length} bytes; the plugin sprite must stay below 128 KiB`);
}
const statesDataUrl = `data:image/png;base64,${statesBytes.toString('base64')}`;
const workspaceBackgroundBytes = readFileSync(join(root, 'figma-desktop-bridge', 'assets', workspaceBackgroundAsset));
if (workspaceBackgroundBytes.length > 96 * 1024) {
  throw new Error(`${workspaceBackgroundAsset} is ${workspaceBackgroundBytes.length} bytes; the plugin background must stay below 96 KiB`);
}
const workspaceBackgroundDataUrl = `data:image/webp;base64,${workspaceBackgroundBytes.toString('base64')}`;
const skillStoriesBytes = readFileSync(join(root, 'figma-desktop-bridge', 'assets', skillStoriesAsset));
if (skillStoriesBytes.toString('ascii', 0, 4) !== 'RIFF' || skillStoriesBytes.toString('ascii', 8, 12) !== 'WEBP') {
  throw new Error(`${skillStoriesAsset} must be a WebP image`);
}
if (skillStoriesBytes.length > 96 * 1024) {
  throw new Error(`${skillStoriesAsset} is ${skillStoriesBytes.length} bytes; the six-story atlas must stay below 96 KiB`);
}
const skillStoriesDataUrl = `data:image/webp;base64,${skillStoriesBytes.toString('base64')}`;

const bakeStart = '/*BAKE-VARS-START*/';
const bakeEnd = '/*BAKE-VARS-END*/';
const bakeBlock = `${bakeStart}:root{--bake-cutout:url("${cutoutDataUrl}");--bake-states:url("${statesDataUrl}");--bake-workspace-bg:url("${workspaceBackgroundDataUrl}");--bake-sad:var(--bake-cutout);--bake-sync:var(--bake-cutout)}${bakeEnd}`;
html = replaceMarkedBlock(html, bakeStart, bakeEnd, bakeBlock);

const landingBakeStart = '/*BAKE-LANDING-VARS-START*/';
const landingBakeEnd = '/*BAKE-LANDING-VARS-END*/';
const landingBakeBlock = `${landingBakeStart}:root{--bake-landing-stories:url("${skillStoriesDataUrl}");}${landingBakeEnd}`;
html = replaceMarkedBlock(html, landingBakeStart, landingBakeEnd, landingBakeBlock);

if (Buffer.byteLength(html, 'utf8') > 1024 * 1024) {
  throw new Error(`Embedded plugin UI is ${Buffer.byteLength(html, 'utf8')} bytes; keep it below 1 MiB`);
}

writeFileSync(uiPath, html);
console.log(`Embedded ${assets.length} legacy illustration, 1 cutout, 25-state sprite, workspace background and one six-story landing atlas into ${uiPath}`);
