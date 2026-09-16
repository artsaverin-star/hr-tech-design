import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const uiUrl = new URL('../figma-desktop-bridge/ui.html', import.meta.url);
const html = readFileSync(uiUrl, 'utf8');
const pluginCode = readFileSync(new URL('../figma-desktop-bridge/code.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../src/core/websocket-server.ts', import.meta.url), 'utf8');
const skillStoriesAsset = 'bulochka-skill-stories-6-v2.webp';

const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter(Boolean);

inlineScripts.forEach((source, index) => {
  new vm.Script(source, { filename: `ui-inline-${index + 1}.js` });
});

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
if (duplicates.length) {
  throw new Error(`Duplicate UI ids: ${duplicates.join(', ')}`);
}

// BULOCHKA_FLOW удалён в 4.13 вместе с видом «Инструменты» и конвейером очереди.
for (const marker of ['BULOCHKA_HERO']) {
  const assetPattern = new RegExp(
    `<!-- ${marker}_START --><img src="data:image/webp;base64,[A-Za-z0-9+/=]+"[^>]*><!-- ${marker}_END -->`,
  );
  if (!assetPattern.test(html)) throw new Error(`${marker} is not embedded as WebP`);
}

if (!/--bake-cutout:url\("data:image\/webp;base64,[A-Za-z0-9+/=]+"\)/.test(html)) {
  throw new Error('The transparent pixel Bulochka cutout must be embedded as WebP');
}
if (!/--bake-states:url\("data:image\/png;base64,[A-Za-z0-9+/=]+"\)/.test(html)) {
  throw new Error('The 25-state transparent Bulochka sprite must be embedded as a crisp PNG');
}
if (!/--bake-workspace-bg:url\("data:image\/webp;base64,[A-Za-z0-9+/=]+"\)/.test(html)) {
  throw new Error('The generated Bulochka workspace background must be embedded as WebP');
}
const skillStoriesBytes = readFileSync(new URL(`../figma-desktop-bridge/assets/${skillStoriesAsset}`, import.meta.url));
if (skillStoriesBytes.length > 96 * 1024) throw new Error(`${skillStoriesAsset} exceeds the 96 KiB landing budget`);
if (skillStoriesBytes.toString('ascii', 0, 4) !== 'RIFF' || skillStoriesBytes.toString('ascii', 8, 12) !== 'WEBP') {
  throw new Error(`${skillStoriesAsset} is not a WebP image`);
}
const skillStoryMatches = [...html.matchAll(/--bake-landing-stories:url\("data:image\/webp;base64,([A-Za-z0-9+/=]+)"\)/g)];
if (skillStoryMatches.length !== 1 || !Buffer.from(skillStoryMatches[0][1], 'base64').equals(skillStoriesBytes)) {
  throw new Error('The embedded six-story landing atlas must match its source WebP byte-for-byte');
}
if (Buffer.byteLength(html, 'utf8') > 1024 * 1024) throw new Error('Embedded plugin UI exceeds 1 MiB');

const spriteBytes = readFileSync(new URL('../figma-desktop-bridge/assets/bulochka-states-25-v2-crisp.png', import.meta.url));
const spriteMatches = [...html.matchAll(/--bake-states:url\("data:image\/png;base64,([A-Za-z0-9+/=]+)"\)/g)];
if (spriteMatches.length !== 1 || !Buffer.from(spriteMatches[0][1], 'base64').equals(spriteBytes)) {
  throw new Error('The embedded 25-state sprite must match its source PNG byte-for-byte');
}
if (spriteBytes.toString('ascii', 1, 4) !== 'PNG' || spriteBytes.readUInt32BE(16) !== 500 || spriteBytes.readUInt32BE(20) !== 500) {
  throw new Error('The 25-state sprite must remain a 500×500 PNG');
}
const spriteHash = createHash('sha256').update(spriteBytes).digest('hex');
if (spriteHash !== 'f369526434ee432a8b9e01f88ecd4dae286ea74a5009fb93c2cca6d73006d603') {
  throw new Error(`The protected 25-state sprite changed (${spriteHash})`);
}
if (/--bake-h\d{2}:url\(/.test(html)) {
  throw new Error('Legacy hourly backgrounds with a second mascot must not be embedded in the compact UI');
}
if (!html.includes('--bake-sad:var(--bake-cutout);--bake-sync:var(--bake-cutout)')) {
  throw new Error('Offline and syncing fallbacks must reuse the transparent pixel cutout');
}

const uiRegressionChecks = [
  [
    '<!-- BULOCHKA_SKILLS_START -->',
    'Static agent skill catalog marker is missing',
  ],
  [
    'data-view="skills" aria-label="Главная"',
    'Main navigation must expose the landing page',
  ],
  [
    '<section class="hrtech-view active" data-view-panel="skills">',
    'Skill catalog must be the default product view',
  ],
  [
    '.hrtech-app.hrtech-connected #b4-connect-slot .hrtech-connect { display: none !important; }',
    'Reconnect control must be hidden once the local bridge is connected',
  ],
  [
    "hrtechMoveNode('hrtech-connect', 'b4-connect-slot');",
    'Reconnect control must be mounted in the visible settings view',
  ],
  [
    '.b3-nav-btn span:not(.b3-nav-icon) { display: inline !important; }',
    'Compact navigation labels must survive the legacy narrow-screen media query',
  ],
  [
    '>Повторить поиск</button>',
    'Local bridge action must describe the scan it actually performs',
  ],
  [
    'id="b6-state-toggle" type="button"',
    'The central pixel Bulochka must remain visible, addressable and tappable',
  ],
  [
    'background-image: var(--bake-states) !important;',
    'The central mascot must use the 25-state transparent sprite',
  ],
  [
    'width: 100px; height: 100px; margin: 0;',
    'The central mascot must render at its native 100×100 cell size',
  ],
  [
    'image-rendering: pixelated; filter: none !important; box-shadow: none !important;',
    'The central mascot must stay crisp and render without an added shadow',
  ],
  [
    'body { color-scheme: dark !important; }',
    'The compact product shell must keep its dark theme',
  ],
  [
    '--b8-bg: #100e13;',
    'The warm dark theme tokens must remain defined',
  ],
  [
    'id="b6-collapse-toggle"',
    'The compact shell must expose a persistent collapse control',
  ],
  [
    'background-image: var(--bake-states) !important; background-position: var(--b6-state-x, 0%) var(--b6-state-y, 0%);',
    'The collapsed mascot must reuse the same sprite frame as the expanded mascot',
  ],
  [
    'Работайте с макетом в&nbsp;Codex или Claude',
    'The hero must keep the preposition with Codex on the same line',
  ],
  [
    'align-content: start; align-items: end;',
    'The landing hero rows must not stretch apart after removing the kicker',
  ],
  [
    "type: 'HRTECH_UI_COMPACT_SET'",
    'The collapse control must request a fixed Figma window size',
  ],
];

for (const [needle, message] of uiRegressionChecks) {
  if (!html.includes(needle)) throw new Error(message);
}

// Лента активности переехала из карточки прогресса очереди (удалена в 4.13). Пока она в UI —
// она обязана оставаться читаемой; если её выпилят вместе с карточкой, проверять нечего.
if (html.includes('hrtech-feed-row') && !html.includes('.hrtech-feed-row:first-child { color:var(--b3-ink) !important; }')) {
  throw new Error('Activity feed must remain readable on the light progress card');
}

const skillsBlock = html.match(/<!-- BULOCHKA_SKILLS_START -->([\s\S]*?)<!-- BULOCHKA_SKILLS_END -->/);
if (!skillsBlock || (skillsBlock[1].match(/class="b14-feature"/g) || []).length !== 6) {
  throw new Error('Landing must contain all six HR Tech skills');
}
if ((skillsBlock[1].match(/class="b14-feature-art"/g) || []).length !== 6) {
  throw new Error('Every skill must contain one generated illustration');
}
if ((skillsBlock[1].match(/class="b14-feature-copy"/g) || []).length !== 6
    || (skillsBlock[1].match(/<h3>/g) || []).length !== 6
    || (skillsBlock[1].match(/<p>/g) || []).length !== 6) {
  throw new Error('Every landing feature must contain only its title, description and illustration');
}
if (/class="b14-capabilities"|class="b14-capability"/.test(skillsBlock[1])) {
  throw new Error('Landing feature cards must not render secondary capability labels');
}
if (skillsBlock[1].includes('class="b14-feature-number"')) {
  throw new Error('Landing feature cards must not render decorative numbers');
}
const landingArtSlugs = [...skillsBlock[1].matchAll(/data-landing-art="([^"]+)"/g)].map((match) => match[1]);
if (landingArtSlugs.join(',') !== 'prod,audit,mobile,scenario,prototype,sync') {
  throw new Error(`Landing art must cover all six skills; got ${landingArtSlugs.join(',')}`);
}
if (!skillsBlock[1].includes('<h3>Собирает спеку</h3>')) {
  throw new Error('The scenario skill must use the concise “Собирает спеку” title');
}
if (!html.includes('background-image: var(--bake-landing-stories); background-size: 300% 200%;')) {
  throw new Error('All six skills must use the generated Bulochka story atlas');
}
if ((html.match(/class="b14-step"/g) || []).length !== 3) {
  throw new Error('Landing must explain the workflow in exactly three steps');
}
const removedLandingUi = [
  ['<section class="b14-example"', 'Landing CTA section must stay removed'],
  ['class="b14-copy-example"', 'Landing copy CTA must stay removed'],
  ['class="b14-check-connection"', 'Landing connection CTA must stay removed'],
  ['class="b14-open-settings"', 'Landing settings CTA must stay removed'],
  ['function hrtechCopyLandingExample(', 'Removed landing CTA must not leave dead clipboard code'],
  ['.b14-feature-number {', 'Removed feature numbers must not leave dead CSS'],
  ['.b14-capabilities {', 'Removed capability labels must not leave dead CSS'],
  ['.b14-capability {', 'Removed capability labels must not leave dead CSS'],
  ['<span class="b14-eyebrow">', 'Landing hero must not render a provider kicker'],
  ['<span class="b14-section-kicker">', 'Landing sections must not render redundant kickers'],
  ['.b14-eyebrow {', 'Removed landing hero kicker must not leave dead CSS'],
  ['.b14-section-kicker {', 'Removed landing section kickers must not leave dead CSS'],
];
for (const [needle, message] of removedLandingUi) {
  if (html.includes(needle)) throw new Error(message);
}

const statesBlock = html.match(/var HRTECH_BUN_STATES = \[([\s\S]*?)\n    \];/);
if (!statesBlock || (statesBlock[1].match(/title:/g) || []).length !== 25) {
  throw new Error('Bulochka state catalog must contain exactly 25 quarter-hour states');
}
if (!html.includes('Math.floor(now.getMinutes() / 15)')) {
  throw new Error('Bulochka state selection must update on quarter-hour boundaries');
}
if (!pluginCode.includes("figma.ui.resize(msg.collapsed === true ? 96 : 360, msg.collapsed === true ? 44 : 480)")) {
  throw new Error('The Figma runtime must resize the compact shell to 96×44 and restore 360×480');
}

const uiVersion = html.match(/var HRTECH_UI_VERSION = '([^']+)'/)?.[1];
const pluginVersion = pluginCode.match(/globalThis\.hrtechVersion = '([^']+)'/)?.[1];
const serverVersion = serverSource.match(/const HRTECH_VERSION = '([^']+)'/)?.[1];
if (!uiVersion || uiVersion !== pluginVersion || uiVersion !== serverVersion) {
  throw new Error(`Version mismatch: UI=${uiVersion}, plugin=${pluginVersion}, server=${serverVersion}`);
}
if (uiVersion !== '4.21') throw new Error(`Expected Bulochka 4.21, got ${uiVersion}`);

const mainNav = html.match(/<nav class="b3-nav">([\s\S]*?)<\/nav>/);
const visibleNavViews = mainNav ? [...mainNav[1].matchAll(/data-view="([^"]+)"/g)].map((match) => match[1]) : [];
if (visibleNavViews.join(',') !== 'skills,settings') {
  throw new Error(`Main navigation must contain only Landing and Settings; got ${visibleNavViews.join(',')}`);
}

if (html.includes('<div class="b3-agent-switch"')) {
  throw new Error('Visible provider switch must not be present in the product shell');
}

console.log(`Plugin UI OK: ${inlineScripts.length} scripts, ${ids.length} unique ids, 1 legacy illustration, 1 cutout, 25 states, 6 landing scenes`);
