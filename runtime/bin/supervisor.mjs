import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function isLockActive(lockPath) {
  if (!existsSync(lockPath)) return false;
  try {
    const owner = JSON.parse(readFileSync(lockPath + '/owner.json', 'utf8'));
    if (Number.isSafeInteger(owner.pid) && owner.pid > 0) {
      try { process.kill(owner.pid, 0); return true; }
      catch (err) { return err.code !== 'ESRCH'; }
    }
  } catch {
    // Plain directory lock or owner.json not yet written: treat locks older than 5 min as stale.
    try { return (Date.now() - statSync(lockPath).mtimeMs) <= 300000; } catch { return false; }
  }
  return true;
}

export function startSupervisor({ engine = fileURLToPath(new URL('./engine.mjs', import.meta.url)), lockDir = fileURLToPath(new URL('../..', import.meta.url)), input = process.stdin, output = process.stdout, pollMs = 1500 } = {}) {
  const updateLock = lockDir.replace(/\/$/, '') + '/.bulochka-update.lock';
  const repairLock = lockDir.replace(/\/$/, '') + '/.bulochka-repair.lock';
  const pending = new Map();
  const queue = [];
  let child, generation = 0, init, initialized = false, ready = false, closing = false;
  let signature, failedSignature, pinnedFileKey = '', restartTimer, startTimer, retired;
  let fileIdentity, cachedHash;
  const fingerprint = () => {
    const stat = statSync(engine, { bigint: true });
    const identity = `${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    if (identity !== fileIdentity) {
      cachedHash = createHash('sha256').update(readFileSync(engine)).digest('hex');
      fileIdentity = identity;
    }
    return cachedHash;
  };
  const write = message => output.write(JSON.stringify(message) + '\n');
  const send = message => child?.stdin.writable && child.stdin.write(JSON.stringify(message) + '\n');
  const error = (id, text) => write({ jsonrpc: '2.0', id, error: { code: -32603, message: text } });
  const toolData = result => {
    try { return JSON.parse(result?.content?.find(c => c.type === 'text')?.text || '{}'); } catch { return {}; }
  };
  function flush() {
    if (!ready || !initialized) return;
    for (const message of queue.splice(0)) forward(message);
  }
  function forward(message) {
    if (message.method && message.id !== undefined) pending.set(message.id, message);
    send(message);
  }
  function failGeneration(text) {
    for (const id of pending.keys()) error(id, text);
    pending.clear();
    for (const message of queue.splice(0)) if (message.id !== undefined) error(message.id, text);
  }
  function launch(reloading = false) {
    ready = false;
    const current = ++generation;
    try { signature = fingerprint(); } catch {
      failGeneration('Файлы моста недоступны. Повторите обновление Булочки.'); return;
    }
    child = spawn(process.execPath, [engine], {
      env: { ...process.env, BULOCHKA_SUPERVISED: '1', BULOCHKA_SESSION_FILE_KEY: pinnedFileKey },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    const active = child;
    active.stdin.on('error', () => {}); // A closing/crashed engine may reject a queued notification.
    let buffer = '';
    const initId = '__bulochka_reload_' + current;
    startTimer = setTimeout(() => {
      if (current !== generation || ready) return;
      failedSignature = signature;
      failGeneration('Мост не ответил после обновления. Повторите обновление Булочки.');
      active.kill('SIGTERM');
    }, 20000);
    active.stdout.setEncoding('utf8');
    active.stdout.on('data', chunk => {
      if (current !== generation || closing) return;
      buffer += chunk;
      let pos;
      while ((pos = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, pos); buffer = buffer.slice(pos + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (reloading && message.id === initId) {
          if (message.error) { failGeneration('Новая версия моста не прошла MCP-подключение.'); active.kill('SIGTERM'); continue; }
          clearTimeout(startTimer);
          ready = true;
          if (initialized) send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          write({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
          flush();
          continue;
        }
        if (!reloading && init && message.id === init.id) {
          clearTimeout(startTimer);
          ready = !message.error;
        }
        if (message.id !== undefined && !message.method) {
          const request = pending.get(message.id);
          if (request && !message.error && !message.result?.isError) {
            const data = toolData(message.result);
            if (request.params?.name === 'figma_pin_file' && data.status === 'pinned') pinnedFileKey = data.pinnedFileKey || '';
            if (request.params?.name === 'figma_unpin_file' && data.status === 'unpinned') pinnedFileKey = '';
          }
          pending.delete(message.id);
        }
        write(message);
        if (ready) flush();
      }
    });
    active.on('error', () => {
      if (current === generation) { clearTimeout(startTimer); failGeneration('Не удалось запустить мост Булочки.'); }
    });
    active.on('exit', () => {
      if (current !== generation || closing) return;
      clearTimeout(startTimer);
      ready = false;
      failGeneration('Мост завершился. Команда не повторялась автоматически; проверьте результат в Figma.');
      // Never replay a write after a crash. Keep stdio available for the next request.
      failedSignature = signature;
    });
    if (reloading && init) send({ ...init, id: initId });
  }
  function reload() {
    if (closing || pending.size || !init || !initialized || isLockActive(updateLock) || isLockActive(repairLock)) return;
    let next;
    try { next = fingerprint(); } catch { return; }
    if (next === signature || next === failedSignature) return;
    // Bump generation BEFORE terminating the old engine: late callbacks are ignored.
    ++generation;
    clearTimeout(startTimer);
    ready = false;
    retired = child;
    const old = retired;
    let started = false;
    const nextEngine = () => {
      if (started || closing) return;
      started = true;
      clearTimeout(restartTimer);
      retired = null;
      launch(true);
    };
    if (old.exitCode !== null || old.signalCode !== null) nextEngine();
    else {
      old.once('exit', nextEngine);
      try { old.stdin.end(); } catch {}
      old.kill('SIGTERM');
      restartTimer = setTimeout(() => { old.kill('SIGKILL'); }, 5000);
    }
  }
  let inputBuffer = '';
  input.setEncoding('utf8');
  input.on('data', chunk => {
    inputBuffer += chunk;
    let pos;
    while ((pos = inputBuffer.indexOf('\n')) >= 0) {
      const line = inputBuffer.slice(0, pos); inputBuffer = inputBuffer.slice(pos + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message.method === 'initialize') { init = message; forward(message); }
      else if (message.method === 'notifications/initialized') { initialized = true; send(message); flush(); }
      else if (!ready) {
        queue.push(message);
        if (child && (child.exitCode !== null || child.signalCode !== null) && init && initialized) launch(true);
      }
      else forward(message);
    }
  });
  let orphanWatch = null;
  function close() {
    if (closing) return;
    closing = true;
    clearInterval(poll); clearTimeout(restartTimer); clearTimeout(startTimer);
    if (orphanWatch) clearInterval(orphanWatch);
    try { child?.stdin?.end(); } catch {}
    try { retired?.stdin?.end(); } catch {}
    child?.kill('SIGTERM'); retired?.kill('SIGTERM');
    input.pause();
    const watchdog = setTimeout(() => { child?.kill('SIGKILL'); retired?.kill('SIGKILL'); }, 3000);
    watchdog.unref();
  }
  const poll = setInterval(reload, pollMs);
  input.on('end', close);
  input.on('close', close);
  input.on('error', close);
  output.on('error', close);
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
  if (input === process.stdin && process.ppid > 1) {
    const initialPpid = process.ppid;
    orphanWatch = setInterval(() => {
      if (process.ppid !== initialPpid || process.ppid === 1) close();
    }, 5000);
    orphanWatch.unref();
  }
  launch();
  return { close };
}
