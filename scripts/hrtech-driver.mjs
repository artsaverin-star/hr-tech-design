// HR TECH driver: спавнит MCP-сервер моста и проксирует команды через файлы.
// Команда: /tmp/hrtech-cmds/<id>.cmd.json  → {"tool": "...", "args": {...}}
// Ответ:   /tmp/hrtech-cmds/<id>.res.json
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CMD_DIR = '/tmp/hrtech-cmds';
fs.mkdirSync(CMD_DIR, { recursive: true });

// Путь к серверу моста — ОТНОСИТЕЛЬНО этого скрипта, чтобы работало на любой установке.
// Приоритет: готовый бандл runtime/bin/bridge.mjs, иначе собранный dist/local.js.
const REPO = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const SERVER = [
  path.join(REPO, 'runtime', 'bin', 'bridge.mjs'),
  path.join(REPO, 'dist', 'local.js'),
].find((p) => fs.existsSync(p)) || path.join(REPO, 'runtime', 'bin', 'bridge.mjs');

const child = spawn('node', [SERVER], {
  stdio: ['pipe', 'pipe', 'inherit'],
});
child.on('exit', (code) => { console.error('server exited', code); process.exit(code ?? 1); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { try { child.kill('SIGKILL'); } catch {} process.exit(0); });
}
process.on('exit', () => { try { child.kill('SIGKILL'); } catch {} });

let buf = '';
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { file } = pending.get(msg.id);
      pending.delete(msg.id);
      fs.writeFileSync(file, JSON.stringify(msg, null, 2));
    }
  }
});

let nextId = 1;
function send(method, params, file) {
  const id = nextId++;
  if (file) pending.set(id, { file });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
}

send('initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'hrtech-driver', version: '1.0.0' },
});
setTimeout(() => {
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  console.error('driver ready, watching ' + CMD_DIR);
}, 700);

setInterval(() => {
  let files;
  try { files = fs.readdirSync(CMD_DIR); } catch { return; }
  for (const f of files) {
    if (!f.endsWith('.cmd.json')) continue;
    const p = path.join(CMD_DIR, f);
    let cmd;
    try { cmd = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    fs.unlinkSync(p);
    send('tools/call', { name: cmd.tool, arguments: cmd.args }, p.replace('.cmd.json', '.res.json'));
  }
}, 300);
