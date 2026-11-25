#!/usr/bin/env node
// Atomic, backup-preserving MCP configuration writer for supported local assistants:
// Claude Code (Desktop & CLI), Antigravity, Cursor, and Codex TOML fallback.
// Keeps unrelated config intact; never prints config contents or credentials.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SERVER_NAME = 'figma-hrtech';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateRuntimePaths(nodePath, serverPath) {
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
}

function readJsonConfig(file) {
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
  const normalized = raw.replace(/^\uFEFF/, '');
  if (normalized.trim() === '') return { file, raw, data: {} };
  let data;
  try { data = JSON.parse(normalized); } catch {
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

function commitJsonTargets(targets, entry, clientLabel) {
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
      const backup = target.raw === null || target.raw.replace(/^\uFEFF/, '').trim() === '' ? null : `${target.file}.bulochka-backup-${suffix}`;
      fs.mkdirSync(path.dirname(target.file), { recursive: true });
      prepared.push({ ...target, output, temporary, backup });
      if (backup) fs.writeFileSync(backup, target.raw, { flag: 'wx', mode: 0o600 });
      fs.writeFileSync(temporary, output, { flag: 'wx', mode: 0o600 });
    }
    for (const target of prepared) {
      // Do not overwrite a config that a running desktop app has just changed.
      if (currentContents(target.file) !== target.raw) throw new Error('concurrent-config-change');
      fs.renameSync(target.temporary, target.file);
      committed.push(target);
    }
  } catch {
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
    throw new Error(`Не удалось сохранить настройки ${clientLabel}. Закройте ${clientLabel} полностью и повторите установку.`);
  } finally {
    for (const target of prepared) {
      try { fs.unlinkSync(target.temporary); } catch { /* renamed or already removed */ }
    }
  }
  return { configured: true, legacyOverrideUpdated: targets.length > 1, changedFiles: prepared.length };
}

export function configureClaudeDesktop({ home = os.homedir(), nodePath, serverPath, tokenPath, configDir = process.env.CLAUDE_CONFIG_DIR, client = 'desktop' } = {}) {
  if (!['desktop', 'cli'].includes(client)) throw new Error('Неизвестный клиент Claude.');
  if (client === 'desktop' && configDir) {
    throw new Error('Задан отдельный CLAUDE_CONFIG_DIR. Автонастройка Claude Desktop поддерживает стандартный каталог; существующие настройки не изменены.');
  }
  validateRuntimePaths(nodePath, serverPath);
  const token = readOptionalToken(tokenPath);
  const entry = { type: 'stdio', command: nodePath, args: [serverPath], env: token ? { FIGMA_ACCESS_TOKEN: token } : {} };
  // An explicit CLAUDE_CONFIG_DIR moves CLI state to that directory, even when
  // its value happens to be ~/.claude. Desktop profiles remain explicit-only.
  const user = readJsonConfig(path.join(client === 'cli' && configDir ? path.resolve(configDir) : home, '.claude.json'));
  // Desktop gives its legacy chat config precedence over the user-scope entry.
  // Update only an existing entry there; do not silently add a chat integration.
  const targets = [user];
  if (client === 'desktop') {
    const legacy = readJsonConfig(path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'));
    if (Object.hasOwn(legacy.data.mcpServers || {}, SERVER_NAME)) targets.push(legacy);
  }
  return commitJsonTargets(targets, entry, 'Claude');
}

export function configureAntigravity({ home = os.homedir(), nodePath, serverPath, tokenPath } = {}) {
  validateRuntimePaths(nodePath, serverPath);
  const token = readOptionalToken(tokenPath);
  const entry = { command: nodePath, args: [serverPath], ...(token ? { env: { FIGMA_ACCESS_TOKEN: token } } : {}) };
  const primary = readJsonConfig(path.join(home, '.gemini', 'config', 'mcp_config.json'));
  const targets = [primary];
  // Update legacy Antigravity IDE location too if it already contains our entry.
  const legacyPath = path.join(home, '.gemini', 'antigravity', 'mcp_config.json');
  if (fs.existsSync(legacyPath)) {
    const legacy = readJsonConfig(legacyPath);
    if (Object.hasOwn(legacy.data.mcpServers || {}, SERVER_NAME)) targets.push(legacy);
  }
  return commitJsonTargets(targets, entry, 'Antigravity');
}

export function configureCursor({ home = os.homedir(), nodePath, serverPath, tokenPath } = {}) {
  validateRuntimePaths(nodePath, serverPath);
  const token = readOptionalToken(tokenPath);
  const entry = { command: nodePath, args: [serverPath], ...(token ? { env: { FIGMA_ACCESS_TOKEN: token } } : {}) };
  const primary = readJsonConfig(path.join(home, '.cursor', 'mcp.json'));
  return commitJsonTargets([primary], entry, 'Cursor');
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function upsertCodexTomlSection(raw, nodePath, serverPath, token) {
  const lines = raw ? raw.replace(/\r\n/g, '\n').split('\n') : [];
  const kept = [];
  let skipping = false;
  const headerRe = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/;
  const ownSectionRe = /^mcp_servers\.(?:figma-hrtech|"figma-hrtech"|'figma-hrtech')(?:\.|$)/;
  for (const line of lines) {
    const match = line.match(headerRe);
    if (match) {
      const sectionName = match[1].trim();
      if (ownSectionRe.test(sectionName)) {
        skipping = true;
        continue;
      }
      skipping = false;
    }
    if (!skipping) kept.push(line);
  }
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  const block = [
    `[mcp_servers.${SERVER_NAME}]`,
    `command = ${tomlString(nodePath)}`,
    `args = [${tomlString(serverPath)}]`,
    'enabled = true',
  ];
  if (token) {
    block.push('', `[mcp_servers.${SERVER_NAME}.env]`, `FIGMA_ACCESS_TOKEN = ${tomlString(token)}`);
  }
  const prefix = kept.length > 0 ? kept.join('\n') + '\n\n' : '';
  return prefix + block.join('\n') + '\n';
}

export function configureCodexToml({ home = os.homedir(), codexHome = process.env.CODEX_HOME, nodePath, serverPath, tokenPath } = {}) {
  validateRuntimePaths(nodePath, serverPath);
  const token = readOptionalToken(tokenPath);
  const file = path.join(codexHome ? path.resolve(codexHome) : path.join(home, '.codex'), 'config.toml');
  let raw = null;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('Настройка config.toml должна быть обычным файлом. Существующий файл не изменён.');
    }
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      if (error.message.startsWith('Настройка ')) throw error;
      throw new Error('Не удалось прочитать config.toml Codex. Существующие настройки не изменены.');
    }
  }
  const output = upsertCodexTomlSection(raw, nodePath, serverPath, token);
  if (output === raw) {
    fs.chmodSync(file, 0o600);
    return { configured: true, changedFiles: 0 };
  }
  const suffix = randomUUID();
  const temporary = `${file}.bulochka-${suffix}.tmp`;
  const backup = raw === null ? null : `${file}.bulochka-backup-${suffix}`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    if (backup) fs.writeFileSync(backup, raw, { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(temporary, output, { flag: 'wx', mode: 0o600 });
    if (currentContents(file) !== raw) throw new Error('concurrent-config-change');
    fs.renameSync(temporary, file);
  } catch {
    throw new Error('Не удалось сохранить настройки Codex. Закройте Codex и повторите установку.');
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
  return { configured: true, changedFiles: 1 };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    const names = { '--node': 'nodePath', '--server': 'serverPath', '--token-file': 'tokenPath', '--client': 'client' };
    for (let i = 0; i < args.length; i += 2) {
      if (!names[args[i]] || !args[i + 1]) throw new Error('Нужны параметры --node, --server и необязательный --token-file.');
      options[names[args[i]]] = args[i + 1];
    }
    const client = options.client || 'desktop';
    if (client === 'antigravity') {
      const result = configureAntigravity(options);
      console.log('Antigravity: настройка моста сохранена.' + (result.legacyOverrideUpdated ? ' Прежний файл конфигурации тоже обновлён.' : ''));
    } else if (client === 'cursor') {
      configureCursor(options);
      console.log('Cursor: настройка моста сохранена.');
    } else if (client === 'codex-toml') {
      configureCodexToml(options);
      console.log('Codex: настройка моста сохранена в config.toml.');
    } else {
      const result = configureClaudeDesktop(options);
      console.log('Claude Code: настройка моста сохранена.' + (result.legacyOverrideUpdated ? ' Существующая запись Claude Desktop тоже обновлена.' : ''));
    }
  } catch (error) {
    // Errors above contain only our own messages, never JSON or secret values.
    console.error(error.message);
    process.exitCode = 1;
  }
}
