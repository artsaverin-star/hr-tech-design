#!/usr/bin/env node
// Claude Code's desktop Code tab reads the same user-scope MCP entry as the CLI.
// Keep the rest of its config intact; never print config contents or credentials.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SERVER_NAME = 'figma-hrtech';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function readConfig(file) {
  let raw;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`Настройка ${path.basename(file)} должна быть обычным файлом. Существующий файл не изменён.`);
    }
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { file, raw: null, data: {} };
    if (error.message.startsWith('Настройка ')) throw error;
    throw new Error(`Не удалось прочитать ${path.basename(file)}. Существующие настройки не изменены.`);
  }
  let data;
  try { data = JSON.parse(raw); } catch {
    throw new Error(`В ${path.basename(file)} некорректный JSON. Исправьте файл и повторите установку; он не перезаписан.`);
  }
  if (!isObject(data) || (data.mcpServers !== undefined && !isObject(data.mcpServers))) {
    throw new Error(`В ${path.basename(file)} неверный формат mcpServers. Существующие настройки не изменены.`);
  }
  return { file, raw, data };
}

function readOptionalToken(tokenPath) {
  if (!tokenPath) return '';
  try { return fs.readFileSync(tokenPath, 'utf8').trim(); } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw new Error('Не удалось прочитать личный Figma-токен. Настройки не изменены.');
  }
}

function currentContents(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function configureClaudeDesktop({ home = os.homedir(), nodePath, serverPath, tokenPath, configDir = process.env.CLAUDE_CONFIG_DIR } = {}) {
  if (configDir && path.resolve(configDir) !== path.join(home, '.claude')) {
    throw new Error('Задан отдельный CLAUDE_CONFIG_DIR. Автонастройка Claude Desktop поддерживает стандартный каталог; существующие настройки не изменены.');
  }
  if (!path.isAbsolute(nodePath || '') || !path.isAbsolute(serverPath || '')) {
    throw new Error('Для Node.js и моста нужны абсолютные пути.');
  }
  try {
    fs.accessSync(nodePath, fs.constants.X_OK);
    fs.accessSync(serverPath, fs.constants.R_OK);
    if (!fs.statSync(nodePath).isFile() || !fs.statSync(serverPath).isFile()) throw new Error();
  } catch {
    throw new Error('Node.js или готовый мост недоступен. Повторите установку полного пакета Булочки.');
  }
  const token = readOptionalToken(tokenPath);
  const entry = { type: 'stdio', command: nodePath, args: [serverPath], env: token ? { FIGMA_ACCESS_TOKEN: token } : {} };
  const user = readConfig(path.join(home, '.claude.json'));
  const legacy = readConfig(path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
  // Desktop gives its legacy chat config precedence over the user-scope entry.
  // Update only an existing entry there; do not silently add a chat integration.
  const targets = [user];
  if (Object.hasOwn(legacy.data.mcpServers || {}, SERVER_NAME)) targets.push(legacy);
  const prepared = [];
  const committed = [];
  try {
    for (const target of targets) {
      const data = { ...target.data, mcpServers: { ...target.data.mcpServers, [SERVER_NAME]: entry } };
      const output = JSON.stringify(data, null, 2) + '\n';
      if (output === target.raw) {
        fs.chmodSync(target.file, 0o600);
        continue;
      }
      const suffix = randomUUID();
      const temporary = `${target.file}.bulochka-${suffix}.tmp`;
      const backup = target.raw === null ? null : `${target.file}.bulochka-backup-${suffix}`;
      fs.mkdirSync(path.dirname(target.file), { recursive: true });
      prepared.push({ ...target, output, temporary, backup });
      if (backup) fs.writeFileSync(backup, target.raw, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(temporary, output, { flag: 'wx', mode: 0o600 });
    }
    for (const target of prepared) {
      // Do not overwrite a config that the running desktop app has just changed.
      if (currentContents(target.file) !== target.raw) throw new Error('concurrent-config-change');
      fs.renameSync(target.temporary, target.file);
      committed.push(target);
    }
  } catch {
    // The two files cannot be renamed together. Roll back only our own exact
    // content, leaving any newer write by Claude untouched. Backups remain private.
    for (const target of committed.reverse()) {
      try {
        if (currentContents(target.file) !== target.output) continue;
        if (target.raw === null) fs.unlinkSync(target.file);
        else {
          fs.writeFileSync(target.temporary, target.raw, { flag: 'wx', mode: 0o600 });
          fs.renameSync(target.temporary, target.file);
        }
      } catch { /* a private backup is still available */ }
    }
    throw new Error('Не удалось сохранить настройки Claude. Закройте Claude полностью и повторите установку.');
  } finally {
    for (const target of prepared) {
      try { fs.unlinkSync(target.temporary); } catch { /* renamed or already removed */ }
    }
  }
  return { configured: true, legacyOverrideUpdated: targets.length > 1, changedFiles: prepared.length };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    const names = { '--node': 'nodePath', '--server': 'serverPath', '--token-file': 'tokenPath' };
    for (let i = 0; i < args.length; i += 2) {
      if (!names[args[i]] || !args[i + 1]) throw new Error('Нужны параметры --node, --server и необязательный --token-file.');
      options[names[args[i]]] = args[i + 1];
    }
    const result = configureClaudeDesktop(options);
    console.log('Claude Code: настройка моста сохранена.' + (result.legacyOverrideUpdated ? ' Существующая запись Claude Desktop тоже обновлена.' : ''));
  } catch (error) {
    // Errors above contain only our own messages, never JSON or secret values.
    console.error(error.message);
    process.exitCode = 1;
  }
}
