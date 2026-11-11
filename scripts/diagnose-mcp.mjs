#!/usr/bin/env node
// Read-only end-to-end MCP check. No assistant config, tokens or Figma edits.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const child = spawn(process.execPath, [fileURLToPath(new URL('../runtime/bin/bridge.mjs', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '', stage = 'initialize', tools = 0, finished = false;
const timeout = setTimeout(() => finish(false, `Таймаут MCP: ${stage}`), 20000);
function finish(ok, message) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  console.log(message);
  child.stdin.end();
  child.kill('SIGTERM');
  process.exitCode = ok ? 0 : 1;
}
function send(message) { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n'); }
child.on('error', () => finish(false, 'Не удалось запустить Node.js для моста.'));
child.on('exit', () => { if (!finished) finish(false, `Мост завершился во время ${stage}.`); });
child.stderr.resume(); // Never echo logs containing environment or user data.
child.stdout.setEncoding('utf8');
child.stdout.on('data', chunk => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    if (message.error) { finish(false, `Ошибка MCP на этапе ${stage}: ${message.error.code}`); return; }
    if (message.id === 1 && message.result) {
      send({ method: 'notifications/initialized' });
      stage = 'tools/list';
      send({ id: 2, method: 'tools/list', params: {} });
    } else if (message.id === 2 && message.result) {
      tools += (message.result.tools || []).length;
      if (message.result.nextCursor) {
        send({ id: 2, method: 'tools/list', params: { cursor: message.result.nextCursor } });
      } else if (!tools) finish(false, 'Мост ответил, но не предоставил инструменты.');
      else {
        stage = 'figma_list_open_files';
        send({ id: 3, method: 'tools/call', params: { name: 'figma_list_open_files', arguments: {} } });
      }
    } else if (message.id === 3 && message.result) {
      let data;
      try { data = JSON.parse(message.result.content?.find(c => c.type === 'text')?.text || '{}'); } catch { data = {}; }
      const noFiles = message.result.isError && Array.isArray(data.files) && data.files.length === 0 && String(data.error).startsWith('No files connected.');
      finish(!message.result.isError || noFiles, noFiles
        ? `MCP исправен: initialize, ${tools} инструментов, вызов выполнен. К этой проверочной сессии ещё не подключён файл Figma. Откройте плагин Булочка и повторите проверку.`
        : message.result.isError ? 'MCP работает, но чтение списка файлов Figma вернуло ошибку.'
        : `MCP исправен: initialize, ${tools} инструментов, подключённых файлов: ${data.totalFiles ?? '?'}.`);
    }
  }
});
send({ id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'Bulochka diagnostics', version: '1.0' } } });
