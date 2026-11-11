import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const html = fs.readFileSync(new URL('../figma-desktop-bridge/ui.html', import.meta.url), 'utf8');
const start = html.indexOf('    (function() {\n      // Port range for multi-instance support');
assert.ok(start >= 0, 'the production WebSocket client must be present');
const end = html.indexOf('    })();', start) + '    })();'.length;
const clientSource = html.slice(start, end);

// Execute the production client with controlled network events. No real ports,
// user settings, or Figma documents are touched by these regressions.
function clientHarness({ constructorThrows = false, onSocket } = {}) {
  const sockets = [];
  const timers = [];
  const intervals = [];
  const changes = [];
  const intervalTimers = [];
  let now = 0;
  let nextTimerId = 0;
  function schedule(fn, delay, interval = false) {
    const timer = { fn, delay, due: now + delay, id: ++nextTimerId, interval };
    (interval ? intervalTimers : timers).push(timer);
    return timer;
  }
  function advance(ms) {
    const end = now + ms;
    let steps = 0;
    while (true) {
      const timer = [...timers, ...intervalTimers]
        .filter(t => !t.canceled && !t.fired && t.due <= end)
        .sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (!timer) break;
      assert.ok(++steps < 10000, 'timers must not create a busy loop');
      now = timer.due;
      if (timer.interval) timer.due += timer.delay;
      else timer.fired = true;
      timer.fn();
    }
    now = end;
  }
  class Socket {
    constructor(url) {
      if (constructorThrows) throw new Error('WebSocket blocked');
      this.url = url;
      this.readyState = 0;
      this.createdAt = now;
      sockets.push(this);
      if (onSocket) schedule(() => onSocket(this), 0);
    }
    send() {}
    message(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
    open() { this.readyState = 1; this.onopen?.(); }
    close(code = 1006, reason = '') {
      this.readyState = 3;
      this.onclose?.({ code, reason });
    }
  }
  const window = {
    sendPluginCommand: () => Promise.resolve({ success: true, fileInfo: { fileKey: 'test-file' } }),
    __hrtechConnectionChanged() {
      changes.push(window.__wsGetActiveConnections().filter(c => c.ws.readyState === 1 && c.serverInfo).length);
    },
  };
  vm.runInNewContext(clientSource, {
    window,
    WebSocket: Socket,
    console: { log() {}, error() {} },
    setTimeout(fn, delay) { return schedule(fn, delay); },
    clearTimeout(timer) { if (timer) timer.canceled = true; },
    setInterval(fn, delay) { intervals.push(fn); return schedule(fn, delay, true); },
  });
  return { window, sockets, timers, intervals, changes, advance };
}

function finishScan(sockets, livePorts = [9223]) {
  for (const socket of sockets) {
    const port = Number(new URL(socket.url).port);
    if (livePorts.includes(port)) socket.open();
    else socket.close();
  }
}

test('all live MCP sessions connect, including one starting after the initial scan', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice(), [9223, 9224]);
  assert.equal(h.window.__wsGetActiveConnections().length, 2);
  const before = h.sockets.length;
  h.intervals[0]();
  finishScan(h.sockets.slice(before), [9225]);
  assert.equal(h.window.__wsGetActiveConnections().length, 3);
  assert.equal(h.sockets.filter(s => s.url.endsWith(':9223')).length, 1);
});

test('missing SERVER_HELLO expires and reconnects even if socket close never completes', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice());
  const silent = h.sockets[0];
  silent.close = function() { this.readyState = 2; }; // browser close event may be delayed indefinitely
  h.advance(4999);
  assert.equal(h.window.__wsGetActiveConnections().length, 1);
  h.advance(1);
  assert.equal(silent.readyState, 2);
  assert.equal(h.window.__wsGetActiveConnections().length, 0, 'timeout releases the port immediately');
  h.advance(999);
  assert.equal(h.sockets.filter(s => s.url.endsWith(':9223')).length, 1, 'retry must wait for backoff');
  h.advance(1);
  const replacement = h.sockets.findLast(s => s.url.endsWith(':9223'));
  assert.notEqual(replacement, silent);
  replacement.open();
  replacement.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.27' } });
  silent.onclose({ code: 1000, reason: 'Server handshake timeout' });
  silent.message({ type: 'SERVER_HELLO', data: { hrtechVersion: 'old' } });
  h.advance(10000);
  assert.equal(h.window.__wsGetActiveConnections()[0].ws, replacement);
  assert.equal(replacement.readyState, 1, 'a confirmed replacement has no handshake deadline');
});

test('manual retry replaces unconfirmed sockets and preserves other confirmed MCP sessions', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice(), [9223, 9224]);
  const silent = h.sockets[0];
  const confirmed = h.sockets[1];
  confirmed.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.27' } });
  const deadline = h.window.__wsGetActiveConnections()[0].handshakeTimer;
  h.window.__wsManualScan();
  const replacement = h.sockets.findLast(s => s.url.endsWith(':9223'));
  assert.notEqual(replacement, silent);
  assert.equal(silent.readyState, 3);
  assert.equal(deadline.canceled, true);
  assert.equal(h.window.__wsGetActiveConnections()[0].ws, confirmed);
  assert.equal(h.sockets.filter(s => s.url.endsWith(':9224')).length, 1);
  replacement.open();
  replacement.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.27' } });
  deadline.fn(); // an already queued old timeout must not retire its replacement
  assert.equal(h.window.__wsGetActiveConnections().length, 2);
  h.advance(10000);
  assert.equal(confirmed.readyState, 1);
  assert.equal(replacement.readyState, 1);
});

test('manual retry invalidates the pending scan without accepting a late open from it', () => {
  const h = clientHarness();
  const abandoned = h.sockets[0];
  h.window.__wsManualScan();
  const replacement = h.sockets.findLast(s => s.url.endsWith(':9223'));
  assert.notEqual(replacement, abandoned);
  abandoned.open(); // the old browser event was already queued before close
  assert.equal(abandoned.readyState, 3);
  assert.equal(h.window.__wsIsScanning(), true, 'old callbacks cannot finish the replacement scan');
  finishScan(h.sockets.slice(10));
  replacement.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.27' } });
  assert.equal(h.window.__wsIsScanning(), false);
  assert.equal(h.window.__wsGetActiveConnections().length, 1);
  assert.equal(h.window.__wsGetActiveConnections()[0].ws, replacement);
});

test('repeated open-without-HELLO failures back off; watchdog cannot bypass the delay', () => {
  const h = clientHarness({ onSocket(socket) {
    if (socket.url.endsWith(':9223')) socket.open();
    else socket.close();
  } });
  h.advance(60000);
  const attempts = h.sockets.filter(s => s.url.endsWith(':9223'));
  assert.deepEqual(attempts.slice(0, 3).map(s => s.createdAt), [0, 6000, 13000]);
  assert.ok(attempts.length >= 6 && attempts.length <= 9, 'failed handshakes stay bounded over a minute');
  for (let i = 1; i < attempts.length; i++) assert.ok(attempts[i].createdAt - attempts[i - 1].createdAt >= 6000);
  assert.ok(attempts.filter(s => s.readyState < 2).length <= 1, 'never duplicate an active attempt on a port');
  const current = h.window.__wsGetActiveConnections().find(c => c.port === 9223);
  assert.ok(current);
  current.ws.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.27' } });
  current.ws.close();
  const before = attempts.length;
  h.advance(1000);
  assert.equal(h.sockets.filter(s => s.url.endsWith(':9223')).length, before + 1, 'HELLO resets the retry budget');
});

test('pause and replacement cancel handshake deadlines and keep background retries suppressed', () => {
  for (const action of ['pause', 'replacement']) {
    const h = clientHarness();
    finishScan(h.sockets.slice());
    const socket = h.sockets[0];
    const deadline = h.window.__wsGetActiveConnections()[0].handshakeTimer;
    if (action === 'pause') h.window.__wsDisconnectAll();
    else socket.close(1000, 'Replaced by same file reconnection');
    assert.equal(deadline.canceled, true, action);
    deadline.fn();
    h.advance(20000);
    assert.equal(h.sockets.filter(s => s.url.endsWith(':9223')).length, 1, action);
    h.window.__wsManualScan();
    assert.equal(h.sockets.filter(s => s.url.endsWith(':9223')).length, 2, action + ': manual retry resumes');
  }
});

test('a late-starting MCP is still discovered after the initial retry budget is exhausted', () => {
  let available = false;
  const h = clientHarness({ onSocket(socket) {
    if (available && socket.url.endsWith(':9223')) {
      socket.open();
      socket.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.27' } });
    } else socket.close();
  } });
  h.advance(30000);
  assert.equal(h.window.__wsGetActiveConnections().length, 0);
  available = true;
  h.advance(4000);
  assert.equal(h.window.__wsGetActiveConnections().length, 1);
  assert.equal(h.window.__wsGetActiveConnections()[0].serverInfo.hrtechVersion, '4.27');
});

test('product status is notified immediately on identity, dropout, pause and retry', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice());
  assert.equal(h.changes.at(-1), 0, 'TCP open is not a confirmed bridge');
  h.sockets[0].message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.27', skills: [] } });
  assert.equal(h.changes.at(-1), 1, 'identity is visible before the periodic UI tick');
  h.sockets[0].close();
  assert.equal(h.changes.at(-1), 0, 'dropout is visible before the periodic UI tick');
  const count = h.changes.length;
  h.window.__wsDisconnectAll();
  assert.equal(h.changes.length, count + 1);
  h.window.__wsManualScan();
  assert.equal(h.changes.length, count + 2);
});

test('a late message from a departed socket cannot restore stale host metadata', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice());
  const socket = h.sockets[0];
  socket.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.27', skills: [] } });
  socket.message({ type: 'HRTECH_HOST_STATUS', data: { agents: { codex: { installed: true } } } });
  assert.equal(h.window.__wsGetActiveConnections()[0].hostStatus.agents.codex.installed, true);
  socket.close();
  const count = h.changes.length;
  socket.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.25', skills: [{ name: 'old' }] } });
  assert.equal(h.changes.length, count);
  assert.equal(h.window.__wsGetActiveConnections().length, 0);
});

test('a delayed reconnect cannot duplicate a socket already opened by a scan', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice());
  h.sockets[0].close();
  const retry = h.timers.findLast(t => t.delay === 1000);
  assert.ok(retry);
  const before = h.sockets.length;
  h.window.__wsManualScan();
  finishScan(h.sockets.slice(before));
  const count = h.sockets.length;
  // Even an already queued callback that cancellation cannot retract is safe.
  retry.fn();
  assert.equal(h.sockets.length, count);
  assert.equal(h.window.__wsGetActiveConnections().length, 1);
});

test('an old close callback cannot remove the replacement socket on the same port', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice());
  const oldClose = h.sockets[0].onclose;
  h.sockets[0].close();
  const before = h.sockets.length;
  h.window.__wsManualScan();
  finishScan(h.sockets.slice(before));
  const replacement = h.window.__wsGetActiveConnections()[0].ws;
  oldClose({ code: 1000, reason: 'Replaced by same file reconnection' });
  assert.equal(h.window.__wsGetActiveConnections()[0].ws, replacement);
  assert.equal(replacement.readyState, 1);
});

test('pause cancels in-flight scans and rejects late open events until resumed', () => {
  const h = clientHarness();
  const firstSocket = h.sockets[0];
  h.window.__wsDisconnectAll();
  firstSocket.open();
  assert.equal(h.window.__wsIsPaused(), true);
  assert.equal(h.window.__wsGetActiveConnections().length, 0);
  assert.equal(firstSocket.readyState, 3);
  const count = h.sockets.length;
  h.intervals[0]();
  assert.equal(h.sockets.length, count);
  h.window.__wsManualScan();
  finishScan(h.sockets.slice(count));
  assert.equal(h.window.__wsGetActiveConnections().length, 1);
});

test('pause also blocks reconnect callbacks queued before it', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice());
  h.sockets[0].close();
  const retry = h.timers.findLast(t => t.delay === 1000);
  h.window.__wsDisconnectAll();
  const count = h.sockets.length;
  retry.fn();
  assert.equal(h.sockets.length, count);
});

test('constructor failures release the scan so retry remains possible', () => {
  const h = clientHarness({ constructorThrows: true });
  assert.equal(h.window.__wsIsScanning(), false);
  h.window.__wsManualScan();
  assert.equal(h.window.__wsIsScanning(), false);
});

test('a plugin replaced by another window does not steal the connection back', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice());
  h.sockets[0].close(1000, 'Replaced by same file reconnection');
  const before = h.sockets.filter(s => s.url.endsWith(':9223')).length;
  h.intervals[0]();
  finishScan(h.sockets.slice(10), []);
  assert.equal(h.sockets.filter(s => s.url.endsWith(':9223')).length, before);
  h.window.__wsManualScan();
  assert.equal(h.sockets.filter(s => s.url.endsWith(':9223')).length, before + 1);
});

const serverSource = fs.readFileSync(new URL('../src/core/websocket-server.ts', import.meta.url), 'utf8');
const helpers = serverSource.slice(serverSource.indexOf('let _skillsCache:'), serverSource.indexOf("import { createChildLogger }"));
const helpersJs = ts.transpileModule(helpers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function discoveryHarness(files = {}, executableFiles = []) {
  const context = {
    join: path.join,
    delimiter: path.delimiter,
    process: { env: { PATH: '/bin' } },
    homedir: () => '/designer',
    fsConstants: { X_OK: 1 },
    accessSync(file) { if (!executableFiles.includes(file)) throw new Error('missing'); },
    readFileSync(file) { if (!(file in files)) throw new Error('missing'); return files[file]; },
    readdirSync(root) {
      return [...new Set(Object.keys(files).filter(file => file.startsWith(root + '/')).map(file => file.slice(root.length + 1).split('/')[0]))];
    },
  };
  vm.createContext(context);
  vm.runInContext(helpersJs, context);
  return context;
}

test('desktop Codex is detected without a shell PATH entry', () => {
  for (const binary of [
    '/Applications/Codex.app/Contents/Resources/codex',
    '/designer/Applications/Codex.app/Contents/Resources/codex',
    '/designer/Applications/ChatGPT.app/Contents/Resources/codex',
  ]) {
    const context = discoveryHarness({}, [binary]);
    assert.equal(vm.runInContext("findLocalAgentBinary('codex')", context), binary);
  }
});

test('desktop Claude is detected without requiring a standalone CLI', () => {
  for (const app of ['/Applications/Claude.app', '/designer/Applications/Claude.app']) {
    const context = discoveryHarness({}, [`${app}/Contents/MacOS/Claude`]);
    assert.equal(vm.runInContext('findLocalClaudeDesktopApp()', context), app);
    assert.equal(vm.runInContext("findLocalAgentBinary('claude')", context), null);
  }
});

test('skill discovery reads current and legacy roots once and counts only HR Tech skills', () => {
  const skill = name => `---\nname: ${name}\n---\n## Примеры\n- Пример задачи\n`;
  const context = discoveryHarness({
    '/designer/.agents/skills/hrtech/SKILL.md': skill('hrtech'),
    '/designer/.codex/skills/hrtech/SKILL.md': skill('hrtech'),
    '/designer/.codex/skills/hrtech-mobile/SKILL.md': skill('hrtech-mobile'),
    '/designer/.claude/skills/hrtech-audit/SKILL.md': skill('hrtech-audit'),
    '/designer/.agents/skills/unrelated/SKILL.md': skill('unrelated'),
  });
  const result = JSON.parse(vm.runInContext('JSON.stringify(readInstalledSkills())', context));
  assert.deepEqual(result.map(s => s.name).sort(), ['hrtech', 'hrtech-audit', 'hrtech-mobile']);
  assert.deepEqual(result[0].examples, ['Пример задачи']);
});

test('MCP initialization updates only its own live connection and ignores late events', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice(), [9223, 9224]);
  const [a, b] = h.sockets;
  for (const socket of [a, b]) socket.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.27', mcpClient: null } });
  a.message({ type: 'HRTECH_MCP_STATUS', data: { client: { name: 'Codex', version: '1' } } });
  const conns = h.window.__wsGetActiveConnections();
  assert.equal(conns.find(c => c.ws === a).serverInfo.mcpClient.name, 'Codex');
  assert.equal(conns.find(c => c.ws === b).serverInfo.mcpClient, null);
  a.close();
  a.message({ type: 'HRTECH_MCP_STATUS', data: { client: { name: 'stale', version: '1' } } });
  assert.equal(h.window.__wsGetActiveConnections().length, 1);
  assert.equal(h.window.__wsGetActiveConnections()[0].serverInfo.mcpClient, null);
});

test('connection summary includes every bridge version and only confirmed MCP names', () => {
  const helpers = html.slice(html.indexOf('    function hrtechAssistantNames()'), html.indexOf('    // A transport link and a completed MCP handshake'));
  const context = { hrtechReadyConnections: () => [
    { port: 9223, serverInfo: { hrtechVersion: '4.27', mcpClient: { name: 'Codex' } } },
    { port: 9224, serverInfo: { hrtechVersion: '4.25' } },
    { port: 9225, serverInfo: { hrtechVersion: '4.27', mcpClient: { name: 'Codex' } } },
  ] };
  vm.createContext(context);
  vm.runInContext(helpers, context);
  assert.equal(vm.runInContext('hrtechAssistantNames().join(",")', context), 'Codex');
  const versions = vm.runInContext('hrtechConnectionVersions()', context);
  assert.match(versions, /Codex v4.27 \(порт 9223\)/);
  assert.match(versions, /Мост v4.25 \(порт 9224\)/);
});
