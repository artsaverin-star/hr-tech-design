#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const shippedScripts = new Set(['bootstrap-package.mjs', 'agent-paths.sh', 'connect-mcp.sh', 'link-knowledge.sh', 'install-next-steps.sh', 'repair.sh', 'configure-claude-desktop.mjs', 'update-package.mjs', 'diagnose-mcp.mjs']);
const exact = new Set(['runtime/bin/bridge.mjs', 'runtime/bin/supervisor.mjs', 'runtime/bin/engine.mjs', 'setup.sh', 'package.json', 'LICENSE', 'figma-desktop-bridge/code.js', 'figma-desktop-bridge/ui.html', 'figma-desktop-bridge/manifest.json']);
export const allowed = name => typeof name === 'string' && !name.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.')) && !name.includes('\\') && (exact.has(name) || (name.startsWith('scripts/') && shippedScripts.has(name.slice(8))) || /^claude\/(?:skills|commands|knowledge)\/.+\.(?:md|json|ts|tsx|js|mjs|css|html|svg)$/.test(name));
export function validatePackage(source) {
  source = fs.realpathSync(source);
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'update-manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1 || !/^\d+\.\d+(?:\.\d+)?$/.test(manifest.version) || !Array.isArray(manifest.files) || manifest.files.length > 2000) throw new Error('Неверный манифест обновления.');
  const names = new Set();
  for (const entry of manifest.files) {
    if (!allowed(entry.path) || names.has(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Неверный путь или контрольная сумма обновления.');
    names.add(entry.path);
    const file = path.join(source, entry.path);
    if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== path.resolve(file)) throw new Error('Обновление содержит ссылку вместо файла.');
    if (createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== entry.sha256) throw new Error('Контрольная сумма обновления не совпала.');
  }
  for (const required of ['runtime/bin/bridge.mjs', 'runtime/bin/supervisor.mjs', 'runtime/bin/engine.mjs', 'scripts/update-package.mjs', 'scripts/repair.sh', 'figma-desktop-bridge/ui.html']) {
    if (!names.has(required)) throw new Error('Неполный пакет обновления.');
  }
  for (const name of ['bridge.mjs', 'supervisor.mjs', 'engine.mjs']) {
    const result = spawnSync(process.execPath, ['--check', path.join(source, 'runtime/bin', name)], { stdio: 'ignore', timeout: 20000 });
    if (result.status !== 0) throw new Error('Новый мост не прошёл проверку JavaScript.');
  }
  return manifest;
}
export function applyPackage(source, target) {
  const manifest = validatePackage(source);
  const changed = [];
  const suffix = '.bulochka-' + randomUUID();
  try {
    // Engine is committed last; the supervisor also waits for the update lock.
    const entries = [...manifest.files].sort((a, b) => Number(a.path === 'runtime/bin/engine.mjs') - Number(b.path === 'runtime/bin/engine.mjs'));
    for (const entry of entries) {
      const destination = path.join(target, entry.path);
      // Personal team notes belong to the existing installation.
      if (entry.path === 'claude/knowledge/team-notes.md' && fs.existsSync(destination)) continue;
      let current = target;
      for (const part of entry.path.split('/').slice(0, -1)) {
        current = path.join(current, part);
        if (fs.existsSync(current) && (!fs.lstatSync(current).isDirectory() || fs.lstatSync(current).isSymbolicLink())) throw new Error('Папка установки содержит постороннюю ссылку.');
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      if (fs.existsSync(destination) && (!fs.lstatSync(destination).isFile() || fs.lstatSync(destination).isSymbolicLink())) throw new Error('Файл установки заменён посторонней ссылкой.');
      const previous = fs.existsSync(destination) ? fs.readFileSync(destination) : null;
      const data = fs.readFileSync(path.join(source, entry.path));
      if (previous?.equals(data)) continue;
      const temporary = destination + suffix;
      try { fs.writeFileSync(temporary, data, { flag: 'wx', mode: 0o644 }); fs.renameSync(temporary, destination); }
      finally { fs.rmSync(temporary, { force: true }); }
      changed.push({ destination, previous });
    }
    const marker = path.join(target, '.bulochka-install.json');
    if (fs.existsSync(marker)) {
      const data = JSON.parse(fs.readFileSync(marker, 'utf8'));
      const temporary = marker + suffix;
      fs.writeFileSync(temporary, JSON.stringify({ ...data, version: manifest.version }) + '\n', { mode: 0o600 });
      fs.renameSync(temporary, marker);
    }
    return manifest.version;
  } catch (error) {
    for (const { destination, previous } of changed.reverse()) {
      if (previous === null) fs.rmSync(destination, { force: true });
      else {
        fs.writeFileSync(destination + suffix, previous);
        fs.renameSync(destination + suffix, destination);
      }
    }
    throw error;
  }
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error('Не удалось скачать или распаковать обновление. Проверьте доступ к GitHub.');
  return result.stdout;
}
export function acquireUpdateLock(target) {
  const lock = path.join(target, '.bulochka-update.lock');
  const owner = path.join(lock, 'owner.json');
  const token = randomUUID();
  try { fs.mkdirSync(lock); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let stale = false;
    try {
      const data = JSON.parse(fs.readFileSync(owner, 'utf8'));
      if (Number.isSafeInteger(data.pid) && data.pid > 0) {
        try { process.kill(data.pid, 0); } catch (probe) { stale = probe.code === 'ESRCH'; }
      }
    } catch {
      // A creator may not have written its ownership file yet.
      stale = Date.now() - fs.statSync(lock).mtimeMs > 300000;
    }
    if (!stale) throw new Error('Обновление уже выполняется. Дождитесь результата.');
    // Remove only our known lock files. Foreign contents are never swept away.
    fs.rmSync(owner, { force: true });
    fs.rmdirSync(lock);
    fs.mkdirSync(lock);
  }
  fs.writeFileSync(owner, JSON.stringify({ pid: process.pid, token }), { flag: 'wx', mode: 0o600 });
  return () => {
    try {
      if (JSON.parse(fs.readFileSync(owner, 'utf8')).token !== token) return;
      fs.unlinkSync(owner); fs.rmdirSync(lock);
    } catch { /* Never remove another updater's lock. */ }
  };
}
export function updateInstalledPackage(target = root) {
  const release = acquireUpdateLock(target);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'bulochka-update-'));
  try {
    const archive = path.join(scratch, 'update.tar.gz');
    run('/usr/bin/curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '15', '--max-time', '90', '--retry', '2', 'https://codeload.github.com/artsaverin-star/hr-tech-design/tar.gz/refs/heads/main', '--output', archive]);
    const entries = run('/usr/bin/tar', ['-tzf', archive]).trim().split('\n');
    if (entries.length > 20000 || entries.some(name => name.startsWith('/') || name.split('/').includes('..'))) throw new Error('Неверный архив обновления.');
    const unpacked = path.join(scratch, 'unpacked'); fs.mkdirSync(unpacked);
    run('/usr/bin/tar', ['-xzf', archive, '-C', unpacked]);
    const source = path.join(unpacked, 'hr-tech-design-main');
    return applyPackage(source, target);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
    release();
  }
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log('Булочка обновлена до ' + updateInstalledPackage()); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
