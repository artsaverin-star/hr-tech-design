import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { allowed } from './update-package.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const files = [];
function walk(relative) {
  const file = path.join(root, relative), stat = fs.lstatSync(file);
  if (stat.isDirectory()) { for (const name of fs.readdirSync(file).sort()) walk(relative + '/' + name); }
  else if (stat.isFile() && allowed(relative) && !relative.endsWith('.test.mjs')) files.push({ path: relative, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
}
for (const name of ['runtime/bin', 'scripts', 'claude/skills', 'claude/commands', 'claude/knowledge', 'figma-desktop-bridge', 'setup.sh', 'package.json', 'LICENSE']) walk(name);
const source = fs.readFileSync(path.join(root, 'src/core/websocket-server.ts'), 'utf8');
const version = source.match(/const HRTECH_VERSION = '([^']+)'/)[1];
fs.writeFileSync(path.join(root, 'update-manifest.json'), JSON.stringify({ schemaVersion: 1, version, files }, null, 2) + '\n');
console.log('Update manifest:', version, files.length, 'files');
