import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { EventEmitter } from 'node:events';

// An explicit local override lets regressions prove the previous shipped UI fails.
const versionMeta = JSON.parse(fs.readFileSync(new URL('../bulochka.version.json', import.meta.url), 'utf8'));
const html = fs.readFileSync(process.env.HRTECH_TEST_UI || new URL('../figma-desktop-bridge/ui.html', import.meta.url), 'utf8');
const wsMatch = html.match(/\(function\(\)\s*\{\n\s*\/\/ Port range for multi-instance support[\s\S]*?\n\s*\}\)\(\);/);
assert.ok(wsMatch, 'the production WebSocket client must be present');
const clientSource = wsMatch[0];

// Execute the production client with controlled network events. No real ports,
// user settings, or Figma documents are touched by these regressions.
function clientHarness({ constructorThrows = false, onSocket, sendPluginCommand } = {}) {
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
    send(data) { (this.sent ||= []).push(JSON.parse(data)); }
    message(data) { this.onmessage?.({ data: JSON.stringify(data) }); }
    open() { this.readyState = 1; this.onopen?.(); }
    close(code = 1006, reason = '') {
      this.readyState = 3;
      this.onclose?.({ code, reason });
    }
  }
  const window = {
    sendPluginCommand: sendPluginCommand || (() => Promise.resolve({ success: true, fileInfo: { fileKey: 'test-file' } })),
    __hrtechConnectionChanged() {
      changes.push(window.__wsGetActiveConnections().filter(c => c.ws.readyState === 1 && c.fileRegistered).length);
    },
  };
  const context = vm.createContext({
    window,
    WebSocket: Socket,
    Date: class extends Date {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    },
    console: { log() {}, error() {} },
    setTimeout(fn, delay) { return schedule(fn, delay); },
    clearTimeout(timer) { if (timer) timer.canceled = true; },
    setInterval(fn, delay) { intervals.push(fn); return schedule(fn, delay, true); },
  });
  vm.runInContext(clientSource, context);
  return { window, sockets, timers, intervals, changes, advance, context };
}

function finishScan(sockets, livePorts = [9223]) {
  for (const socket of sockets) {
    const port = Number(new URL(socket.url).port);
    if (livePorts.includes(port)) socket.open();
    else socket.close();
  }
}

function confirmFile(socket, data = {}) {
  socket.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.30', fileRegistrationAck: true, ...data } });
  socket.message({ type: 'FILE_REGISTERED', data: { fileKey: 'test-file' } });
}

// Read real top-level product functions without evaluating unrelated DOM setup.
// Parsing statements avoids copying their implementation into a test fixture.
const productScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match, index) => ts.createSourceFile(`plugin-${index}.js`, match[1], ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS));
function productStatement(name) {
  for (const script of productScripts) {
    for (const statement of script.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement.getText(script);
      if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => declaration.name.getText(script) === name)) return statement.getText(script);
      if (ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression)
        && statement.expression.left.getText(script) === name) return statement.getText(script);
    }
  }
  assert.fail(`Missing production statement: ${name}`);
}

function repairHarness(options = {}) {
  const h = clientHarness(options);
  const nodes = new Map();
  function element(key) {
    if (!nodes.has(key)) {
      const classes = new Set();
      nodes.set(key, { textContent: '', innerHTML: '', className: '', hidden: false, disabled: false, dataset: {}, style: {},
        attrs: {},
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return this.attrs[k]; },
        querySelector() { return null; },
        classList: {
          add(name) { classes.add(name); },
          remove(name) { classes.delete(name); },
          toggle(name, value) { if (value) classes.add(name); else classes.delete(name); },
          contains(name) { return classes.has(name); },
        },
      });
      // This action is intentionally present before the first status render.
      // Model its actual static DOM rather than forcing production JS to repeat it.
      if (key === 'hrtech-install-manual') {
        const button = html.match(/<button\b[^>]*\bid="hrtech-install-manual"[^>]*>([^<]*)<\/button>/);
        assert.ok(button);
        nodes.get(key).textContent = button[1].trim();
        nodes.get(key).hidden = /\bhidden(?:\s|=|$)/.test(button[0].slice(0, button[0].indexOf('>')));
      }
    }
    return nodes.get(key);
  }
  let copied = 0, copiedReport = '';
  Object.assign(h.context, {
    document: { getElementById: element, querySelector: element },
    HRTECH_UI_VERSION: versionMeta.version,
    HRTECH_BRIDGE_VERSION: versionMeta.bridgeVersion,
    __graceTimer: null, __lastRepairError: '', __pinSource: null,
    hrtechCopyInstall() { copied++; },
    hrtechCopyText(text) { copiedReport = text; return true; }, hrtechFoundAgents: () => [],
    hrtechTokenState() {}, hrtechSkills() {}, hrtechRenderSelectedAgentHost() {}, hrtechRequestHost() {}, hrtechAutoUpdate() {},
  });
  for (const name of ['bunSafeCommand', 'window.executeCode',
    'hrtechEscHtml', 'hrtechFormatClientName', 'hrtechReadyConnections', 'hrtechLegacyBridge',
    'hrtechPrimaryConnection', 'hrtechRepairConnection', 'hrtechResumePendingRepair',
    'hrtechAssistantNames', 'hrtechRawAssistantNames', 'hrtechConnectionVersions',
    'hrtechDistribution', 'hrtechDistributionLabel', 'hrtechHasSearchSkill', 'hrtechFileExchangeConfirmed',
    'hrtechVersionOlder', 'scheduleGraceExpiry', 'setUpdateNote', 'hrtechRenderLock',
    'hrtechComputeState', 'hrtechConnState', 'hrtechRenderRepair',
    'hrtechFinishRepair', 'hrtechCheckConnection', 'hrtechMaintainRepair',
    'window.__hrtechConnectionCheckResult', 'hrtechSyncBridgeState', 'hrtechCopyDiagnostics',
    'hrtechRepair', 'hrtechReclaim', 'window.__hrtechRepairResult']) {
    vm.runInContext(productStatement(name), h.context);
  }
  h.window.__hrtechConnectionChanged = () => h.context.hrtechSyncBridgeState();
  return { ...h, element, copied: () => copied,
    repair: target => h.context.hrtechRepair(target),
    note: () => element('bun-update-note').textContent,
    report() { h.context.hrtechCopyDiagnostics(); return copiedReport; },
  };
}

async function settleClient() {
  // Flush nested RPC/refresh callbacks and the product result continuation.
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

function helloLegacy(socket, overrides = {}) {
  socket.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.27', ...overrides } });
}

const installCommand = 'curl -fsSL https://raw.githubusercontent.com/artsaverin-star/hr-tech-design/main/install.sh | bash';
const originalSevenSkills = ['hrtech', 'hrtech-arcadia', 'hrtech-audit', 'hrtech-mobile', 'hrtech-proto-spec', 'hrtech-prototipnitsa', 'hrtech-spec'].map(name => ({ name }));
function manualInstallHarness(copySucceeds = true) {
  const h = repairHarness();
  const clipboard = [], messages = [];
  h.context.hrtechCopyText = value => { clipboard.push(value); return copySucceeds; };
  h.context.parent = { postMessage(message, target) { messages.push({ message: JSON.parse(JSON.stringify(message)), target }); } };
  for (const name of ['HRTECH_INSTALL_CMD', 'hrtechCopyInstall']) vm.runInContext(productStatement(name), h.context);
  const button = html.match(/<button\b[^>]*\bid="hrtech-install-manual"[^>]*>/)?.[0];
  assert.ok(button, 'the secondary manual update button must exist');
  const handler = button.match(/\bonclick="([^"]+)"/)?.[1];
  assert.ok(handler, 'the secondary action must be explicitly wired');
  return { ...h, clipboard, messages, clickManual: () => vm.runInContext(handler, h.context) };
}

test('manual terminal update is visible in the initial markup with a stable label and explicit click handler', () => {
  const button = html.match(/<button\b[^>]*\bid="hrtech-install-manual"[^>]*>([^<]*)<\/button>/);
  assert.ok(button);
  assert.doesNotMatch(button[0].slice(0, button[0].indexOf('>')), /\bhidden(?:\s|=|$)/);
  assert.match(button[1].trim(), /Терминал|команду/i);
  assert.match(button[0], /onclick="hrtechCopyInstall\(\)"/);
});

test('manual terminal update is available for the targeted standalone 4.27 app with all seven original skills', async () => {
  const h = manualInstallHarness(); finishScan(h.sockets.slice()); await settleClient();
  const socket = h.sockets[0]; helloLegacy(socket, { distribution: 'app', skills: originalSevenSkills });
  const button = h.element('hrtech-install-manual');
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.match(button.textContent, /Терминал/i);
  h.repair();
  assert.equal(socket.sent.filter(message => message.type === 'HRTECH_REPAIR').length, 1);
  assert.equal(h.clipboard.length, 0, 'ordinary repair must not copy an install command');
  assert.equal(h.messages.length, 0);
  assert.equal(button.disabled, true, 'do not offer simultaneous update while normal repair is running');
  socket.message({ type: 'HRTECH_REPAIR_RESULT', data: { finished: true, ok: true, distribution: 'app', skills: originalSevenSkills } });
  await settleClient();
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.equal(h.clipboard.length, 0);
});

test('an identified standalone 4.27 app exposes the manual update before Figma file identification finishes', async () => {
  let identify;
  const h = repairHarness({ sendPluginCommand: () => new Promise(resolve => { identify = resolve; }) });
  finishScan(h.sockets.slice());
  helloLegacy(h.sockets[0], { distribution: 'app', skills: originalSevenSkills });
  assert.equal(h.window.__wsGetActiveConnections()[0].fileKey, undefined);
  const button = h.element('hrtech-install-manual');
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.match(button.textContent, /Терминал/i);
  identify({ success: true, fileInfo: { fileKey: 'test-file' } }); await settleClient();
  assert.equal(button.hidden, false);
});

test('manual terminal update remains visible for healthy Git, modern and mixed bridge installations', async () => {
  for (const kind of ['git', 'modern', 'app-before-git', 'app-before-modern']) {
    const h = manualInstallHarness();
    const mixed = kind.startsWith('app-before-');
    finishScan(h.sockets.slice(), mixed ? [9223, 9224] : [9223]); await settleClient();
    const first = h.sockets[0], target = mixed ? h.sockets[1] : first;
    if (mixed) helloLegacy(first, { distribution: 'app', skills: originalSevenSkills });
    if (kind.endsWith('git')) helloLegacy(target, { distribution: 'git', skills: originalSevenSkills });
    else confirmFile(target, { hrtechVersion: versionMeta.bridgeVersion, bridgeProtocol: 1, distribution: 'terminal', mcpClient: { name: 'codex-mcp-client' }, skills: originalSevenSkills });
    h.context.hrtechSyncBridgeState();
    const button = h.element('hrtech-install-manual');
    assert.equal(button.hidden, false, kind);
    assert.equal(button.disabled, false, kind);
    assert.match(button.textContent, /Терминал/i, kind);
    assert.equal(h.clipboard.length, 0);
    assert.equal(h.messages.length, 0);
  }
});

test('manual terminal update stays visible without a bridge, during pending repair and on pause; only availability changes', () => {
  const h = manualInstallHarness();
  const button = h.element('hrtech-install-manual');
  h.context.hrtechSyncBridgeState();
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  h.repair();
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, true, 'pending repair disables the explicit update action immediately');
  h.window.__wsDisconnectAll();
  assert.equal(button.hidden, false);
  h.window.__wsManualScan();
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false, 'resuming the search enables the action again');
  assert.match(button.textContent, /команду|Терминал/i);
  assert.equal(h.clipboard.length, 0);
  assert.equal(h.messages.length, 0);
});

test('an explicit manual update click copies only the fixed command and its guidance survives live status refreshes', async () => {
  for (const kind of ['legacy-app', 'healthy-modern']) {
    const h = manualInstallHarness(); finishScan(h.sockets.slice()); await settleClient();
    const socket = h.sockets[0];
    if (kind === 'legacy-app') helloLegacy(socket, { distribution: 'app', skills: originalSevenSkills });
    else { helloCheckedBridge(socket); checkedReply(socket); h.context.hrtechSyncBridgeState(); }
    assert.equal(h.element('hrtech-install-manual').hidden, false, kind);
    assert.equal(h.element('hrtech-install-manual').disabled, false, kind);
    h.clickManual();
    assert.deepEqual(h.clipboard, [installCommand]);
    assert.deepEqual(h.messages, [{ message: { pluginMessage: { type: 'HRTECH_INSTALL_HINT' } }, target: '*' }]);
    const note = h.element('hrtech-install-note');
    assert.match(note.textContent, /скопирован/i);
    assert.match(note.textContent, /Терминал/);
    const guidance = note.textContent;
    for (let i = 0; i < 3; i++) { h.advance(700); h.context.hrtechSyncBridgeState(); }
    assert.equal(note.textContent, guidance);
    assert.notEqual(note.hidden, true);
    assert.equal(socket.sent.filter(message => message.type === 'HRTECH_REPAIR').length, 0, 'copying is a separate explicit action');
    assert.equal(h.clipboard.length, 1);
    assert.equal(h.messages.length, 1);
  }
});

test('a failed manual copy leaves the complete command visible and does not emit a success toast', async () => {
  const h = manualInstallHarness(false); finishScan(h.sockets.slice()); await settleClient();
  helloLegacy(h.sockets[0], { distribution: 'app', skills: originalSevenSkills });
  h.clickManual();
  assert.deepEqual(h.clipboard, [installCommand]);
  const note = h.element('hrtech-install-note');
  assert.ok(note.textContent.includes(installCommand));
  assert.match(note.className, /\berr\b/);
  assert.doesNotMatch(note.textContent, /скопирована|скопировано/i);
  assert.equal(h.messages.length, 0, 'failed clipboard writes cannot trigger HRTECH_INSTALL_HINT success');
  const error = note.textContent;
  for (let i = 0; i < 3; i++) { h.advance(700); h.context.hrtechSyncBridgeState(); }
  assert.equal(note.textContent, error);
  assert.notEqual(note.hidden, true);
});

test('the main connection heading reflects a pending, failed, unidentified or proven modern file exchange', async () => {
  for (const scenario of ['pending', 'file-failed', 'no-client', 'healthy', 'skill-missing']) {
    const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
    const socket = h.sockets[0];
    helloCheckedBridge(socket, scenario === 'no-client' ? { mcpClient: null } : {});
    if (scenario !== 'pending') checkedReply(socket, undefined,
      scenario === 'file-failed' ? { fileOk: false }
        : scenario === 'no-client' ? { client: null, skillAvailable: false }
          : scenario === 'skill-missing' ? { skillAvailable: false } : {});
    const title = h.element('bun-connection-title').textContent;
    assert.notEqual(title, 'Подключение', scenario + ': the card title itself must communicate the actual state');
    if (scenario === 'healthy' || scenario === 'skill-missing') assert.match(title, /файл подключ[её]н/i, scenario);
    else {
      assert.doesNotMatch(title, /файл подключ[её]н|связь с файлом подтвержд[её]на/i, scenario);
      if (scenario === 'pending') assert.match(title, /проверя|ожида/i);
      if (scenario === 'file-failed') assert.match(title, /не подтверж|не подключ|нет связи/i);
      if (scenario === 'no-client') assert.match(title, /ожида.*помощник|жду.*помощник/i);
    }
  }
});

test('the legacy card heading distinguishes an available bridge, a sent file and an actual client roundtrip', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
  const socket = h.sockets[0]; helloLegacy(socket, { distribution: 'app', skills: originalSevenSkills });
  const title = () => h.element('bun-connection-title').textContent;
  assert.match(title(), /мост.*доступен|ожида/i);
  assert.doesNotMatch(title(), /файл подключ[её]н|связь.*подтвержд[её]на/i);
  h.repair();
  socket.message({ type: 'HRTECH_REPAIR_RESULT', data: { finished: true, ok: true, distribution: 'app', skills: originalSevenSkills } });
  await settleClient();
  assert.match(title(), /файл передан|файл отправлен/i);
  assert.doesNotMatch(title(), /файл подключ[её]н|связь.*подтвержд[её]на/i);
  socket.message({ id: 'actual-legacy-query', method: 'GET_FILE_INFO', params: {} }); await settleClient();
  assert.match(title(), /файл подключ[её]н/i);
  assert.equal(h.context.hrtechAssistantNames().length, 0, 'a factual file title never invents the missing legacy client name');
});

test('the main card heading drops a previous success on disconnect and displays the paused or offline state', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
  const socket = h.sockets[0]; helloCheckedBridge(socket); checkedReply(socket);
  assert.match(h.element('bun-connection-title').textContent, /файл подключ[её]н/i);
  h.advance(1); socket.close();
  assert.doesNotMatch(h.element('bun-connection-title').textContent, /файл подключ[её]н|связь.*подтвержд[её]на/i);
  h.advance(9000); h.context.hrtechConnState();
  assert.match(h.element('bun-connection-title').textContent, /не подключ|нет подключ|нет связи/i);
  h.window.__wsDisconnectAll();
  assert.match(h.element('bun-connection-title').textContent, /пауз|приостанов/i);
  assert.equal(h.element('hrtech-install-manual').hidden, false);
});

test('legacy compatibility is limited to bridge 4.27 without a newer protocol and does not need client identity', () => {
  const h = repairHarness();
  const legacy = info => h.context.hrtechLegacyBridge({ serverInfo: info });
  assert.equal(legacy({ hrtechVersion: '4.27' }), true);
  assert.equal(legacy({ hrtechVersion: '4.27', mcpClient: null }), true);
  assert.equal(legacy({ hrtechVersion: '4.27', mcpClient: { name: 'Codex' } }), true);
  for (const info of [{}, { hrtechVersion: '4.26' }, { hrtechVersion: '4.28' },
    { hrtechVersion: '4.32' }, { hrtechVersion: '4.27', bridgeProtocol: 1 }]) assert.equal(legacy(info), false);
  assert.equal(h.context.hrtechLegacyBridge(null), false);
});

test('legacy HELLO and proactive local identification show availability without claiming an assistant or live probe', async () => {
  const h = repairHarness();
  finishScan(h.sockets.slice());
  await settleClient();
  const socket = h.sockets[0];
  assert.ok(socket.sent.some(message => message.type === 'FILE_INFO'));
  helloLegacy(socket);
  await settleClient();
  const conn = h.window.__wsGetActiveConnections()[0];
  assert.equal(!!conn.legacyFileVerified, false);
  assert.equal(!!conn.fileRegistered, false);
  assert.equal(h.element('bun-connection-status').dataset.state, 'waiting');
  assert.equal(h.element('bun-status-label').textContent, 'Мост 4.27 доступен');
  assert.equal(h.element('hrtech-repair').textContent, 'Починить');
  assert.equal(h.context.hrtechAssistantNames().length, 0);
});

test('only a successful GET_FILE_INFO RPC on its legacy socket establishes file verification', async () => {
  const h = repairHarness();
  finishScan(h.sockets.slice(), [9223, 9224]);
  await settleClient();
  const [a, b] = h.sockets;
  helloLegacy(a); helloLegacy(b);
  a.message({ type: 'GET_FILE_INFO_RESULT', success: true, fileInfo: { fileKey: 'test-file' } });
  a.message({ method: 'GET_FILE_INFO', params: {} }); // no RPC id
  await settleClient();
  assert.ok(h.window.__wsGetActiveConnections().every(c => !c.legacyFileVerified));
  a.message({ id: 'read-only-probe', method: 'GET_FILE_INFO', params: {} });
  await settleClient();
  const conns = h.window.__wsGetActiveConnections();
  assert.equal(conns.find(c => c.ws === a).legacyFileVerified, true);
  assert.equal(!!conns.find(c => c.ws === b).legacyFileVerified, false);
  assert.equal(a.sent.find(message => message.id === 'read-only-probe').result.fileInfo.fileKey, 'test-file');
  assert.equal(h.element('bun-connection-status').dataset.state, 'connected');
  assert.equal(h.context.hrtechAssistantNames().length, 0, 'legacy probe must not invent a client name');
  a.close();
  assert.equal(h.element('bun-connection-status').dataset.state, 'waiting', 'another unverified legacy socket cannot inherit the proof');
});

test('failed, mismatched, unidentified and modern socket probes cannot set legacy verification', async () => {
  for (const scenario of ['failed', 'mismatch', 'missing-file', 'unidentified', 'modern', 'rejected']) {
    let probe = false;
    const h = clientHarness({ sendPluginCommand() {
      if (!probe) return Promise.resolve({ success: true, fileInfo: { fileKey: 'test-file' } });
      if (scenario === 'rejected') return Promise.reject(new Error('Read failed'));
      if (scenario === 'failed') return Promise.resolve({ success: false, fileInfo: { fileKey: 'test-file' } });
      if (scenario === 'missing-file') return Promise.resolve({ success: true });
      return Promise.resolve({ success: true, fileInfo: { fileKey: scenario === 'mismatch' ? 'other-file' : 'test-file' } });
    } });
    finishScan(h.sockets.slice());
    await settleClient();
    const socket = h.sockets[0];
    if (scenario !== 'unidentified') helloLegacy(socket, scenario === 'modern' ? { bridgeProtocol: 1 } : {});
    probe = true;
    socket.message({ id: 'probe', method: 'GET_FILE_INFO', params: {} });
    await settleClient();
    assert.equal(!!h.window.__wsGetActiveConnections()[0].legacyFileVerified, false, scenario);
  }
});

test('repair targets the primary verified connection and does not broadcast or require legacy identity', async () => {
  const h = repairHarness();
  finishScan(h.sockets.slice(), [9223, 9224]);
  await settleClient();
  const [a, b] = h.sockets;
  helloLegacy(a); helloLegacy(b);
  b.message({ id: 'probe-b', method: 'GET_FILE_INFO', params: {} });
  await settleClient();
  h.repair(); h.repair();
  assert.equal(h.window.__hrtechRepairSocket, b);
  assert.equal(b.sent.filter(message => message.type === 'HRTECH_REPAIR').length, 1);
  assert.equal(a.sent.filter(message => message.type === 'HRTECH_REPAIR').length, 0);
  assert.equal(h.window.__hrtechRepairBusy, true);
  assert.equal(h.copied(), 0);
});

const repairRequests = h => h.sockets.flatMap(socket => (socket.sent || []).filter(message => message.type === 'HRTECH_REPAIR'));

test('recovery regression: explicit Repair reclaims a replaced port while background discovery respects its owner', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
  const old = h.sockets[0]; helloLegacy(old, { distribution: 'git' });
  old.close(1000, 'Replaced by same file reconnection');
  const attempts = () => h.sockets.filter(socket => socket.url.endsWith(':9223'));
  for (let i = 0; i < 2; i++) {
    h.intervals[0]();
    finishScan(h.sockets.filter(socket => socket.readyState === 0), []);
  }
  assert.equal(attempts().length, 1, 'background scan must not steal the file from its other plugin window');
  h.repair(); h.repair();
  assert.equal(attempts().length, 2, 'an explicit Repair must reopen the previously replaced port');
  const replacement = attempts().at(-1);
  finishScan(h.sockets.filter(socket => socket.readyState === 0)); await settleClient();
  helloLegacy(replacement, { distribution: 'git' }); await settleClient();
  assert.equal(h.window.__hrtechRepairSocket, replacement);
  assert.equal(repairRequests(h).length, 1, 'the deferred click must execute once on the recovered socket');
  assert.equal(old.readyState, 3);
});

test('recovery regression: explicit Repair preserves pending sockets and live sockets awaiting HELLO or file identity', async () => {
  for (const phase of ['pending-open', 'awaiting-hello', 'awaiting-file']) {
    let identify;
    const h = repairHarness(phase === 'awaiting-file' ? {
      sendPluginCommand: () => new Promise(resolve => { identify = resolve; }),
    } : {});
    const original = h.sockets[0];
    if (phase !== 'pending-open') { finishScan(h.sockets.slice()); await settleClient(); }
    if (phase === 'awaiting-file') helloLegacy(original, { distribution: 'git' });
    const state = original.readyState;
    h.repair(); h.repair();
    assert.equal(original.readyState, state, phase + ': manual repair must not close the in-flight handshake');
    assert.equal(h.sockets.filter(socket => socket.url.endsWith(':9223')).length, 1, phase + ': no replacement candidate');
    assert.equal(repairRequests(h).length, 0);
    if (phase === 'pending-open') { finishScan(h.sockets.slice()); await settleClient(); }
    if (phase === 'awaiting-file') identify({ success: true, fileInfo: { fileKey: 'test-file' } });
    else helloLegacy(original, { distribution: 'git' });
    await settleClient();
    assert.equal(h.window.__hrtechRepairSocket, original);
    assert.equal(repairRequests(h).length, 1, phase + ': the original socket completes the deferred action once');
  }
});

test('recovery regression: a late healthy assistant clears the expired connection notice without replaying Repair', async () => {
  let available = false;
  const h = repairHarness({ onSocket(socket) {
    if (available && socket.url.endsWith(':9223')) { socket.open(); helloCheckedBridge(socket); }
    else socket.close();
  } });
  h.advance(0); h.repair(); h.advance(20000);
  const expired = h.note();
  assert.match(expired, /не подключился/);
  available = true; h.advance(4000); await settleClient();
  const connection = h.window.__wsGetActiveConnections()[0];
  assert.ok(connection.fileRegistered);
  assert.equal(h.note(), expired, 'HELLO and registration alone must not claim a completed roundtrip');
  checkedReply(connection.ws); h.context.hrtechSyncBridgeState();
  assert.equal(connection.connectionCheck.fileOk, true);
  assert.equal(h.element('bun-connection-title').textContent, 'Файл подключён');
  assert.notEqual(h.note(), expired, 'the successful current-file check must retire the expired connection error');
  assert.doesNotMatch(h.note(), /не подключился|соединение прервано/i);
  assert.equal(repairRequests(h).length, 0, 'a later assistant must not revive an expired repair click');
});

test('recovery regression: verified reconnect clears the departed outcome notice only after a fresh file check', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
  const old = h.sockets[0]; helloCheckedBridge(old);
  const request = await repairedModern(h, old); checkedReply(old, request);
  old.close();
  const disconnected = h.note(); assert.match(disconnected, /Соединение прервано/);
  assert.equal(h.window.__hrtechOutcomeSocket, null);
  h.advance(1000);
  const replacement = h.sockets.findLast(socket => socket.url.endsWith(':9223'));
  replacement.open(); await settleClient(); helloCheckedBridge(replacement);
  assert.equal(h.note(), disconnected, 'an unverified replacement cannot clear a failed connection notice');
  checkedReply(replacement); h.context.hrtechSyncBridgeState();
  assert.equal(h.element('bun-connection-title').textContent, 'Файл подключён');
  assert.notEqual(h.note(), disconnected, 'fresh proof must retire the departed socket notice');
  assert.doesNotMatch(h.note(), /соединение прервано|проверить заново/i);
  assert.equal((replacement.sent || []).some(message => message.type === 'HRTECH_REPAIR'), false);
});

test('recovery regression: a real legacy file RPC clears an expired notice without inventing MCP identity', async () => {
  let available = false;
  const h = repairHarness({ onSocket(socket) {
    if (available && socket.url.endsWith(':9223')) { socket.open(); helloLegacy(socket, { distribution: 'app' }); }
    else socket.close();
  } });
  h.advance(0); h.repair(); h.advance(20000);
  const expired = h.note(); available = true; h.advance(4000); await settleClient();
  const connection = h.window.__wsGetActiveConnections()[0];
  assert.equal(h.note(), expired, 'local FILE_INFO is not proof of an assistant roundtrip');
  connection.ws.message({ id: 'late-legacy-probe', method: 'GET_FILE_INFO', params: {} }); await settleClient();
  assert.equal(connection.legacyFileVerified, true);
  assert.notEqual(h.note(), expired);
  assert.doesNotMatch(h.note(), /не подключился|соединение прервано/i);
  assert.equal(connection.serverInfo.mcpClient, undefined);
  assert.equal(repairRequests(h).length, 0);
});

test('recovery regression: another live session check cannot erase an actual repair script failure', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice(), [9223, 9224]); await settleClient();
  const [a, b] = h.sockets;
  helloCheckedBridge(a); helloCheckedBridge(b); checkedReply(a); checkedReply(b);
  h.repair(h.window.__wsGetActiveConnections().find(connection => connection.ws === a));
  a.message({ type: 'HRTECH_REPAIR_RESULT', data: { finished: true, ok: false } });
  const failure = h.note(); assert.match(failure, /Не удалось восстановить/);
  b.message({ type: 'HRTECH_MCP_STATUS', data: { client: { name: 'Codex', version: 'new-handshake' } } });
  checkedReply(b); h.context.hrtechSyncBridgeState();
  assert.equal(h.note(), failure, 'only transient connectivity notices may be cleared by another healthy connection');
});

test('manual repair waits for HELLO without copying a command and sends once despite repeated clicks and notifications', async () => {
  const h = repairHarness();
  h.repair(); h.repair();
  assert.equal(h.copied(), 0);
  assert.equal(repairRequests(h).length, 0);
  assert.match(h.note(), /жду|ожида|ищ|подключ/i);
  finishScan(h.sockets.filter(socket => socket.readyState === 0));
  await settleClient();
  const socket = h.window.__wsGetActiveConnections()[0].ws;
  assert.ok(socket.sent.some(message => message.type === 'FILE_INFO'));
  assert.equal(repairRequests(h).length, 0, 'a listener with no HELLO is not a repair target');
  h.window.__hrtechRepairResult({ finished: true, ok: true, skills: searchSkills }, socket);
  assert.equal(repairRequests(h).length, 0, 'an unsolicited result cannot consume the deferred action');
  helloLegacy(socket, { distribution: 'git' });
  await settleClient();
  assert.equal(repairRequests(h).length, 1);
  assert.equal(socket.sent.filter(message => message.type === 'HRTECH_REPAIR').length, 1);
  assert.equal(h.window.__hrtechRepairSocket, socket);
  h.repair(); h.context.hrtechSyncBridgeState(); helloLegacy(socket, { distribution: 'git' });
  assert.equal(repairRequests(h).length, 1, 'manual, HELLO and periodic updates cannot replay the pending request');
  assert.equal(h.copied(), 0);
});

test('manual repair waits for file identity when HELLO arrives first and resumes once on its real FILE_INFO send', async () => {
  let identify;
  const h = repairHarness({ sendPluginCommand: () => new Promise(resolve => { identify = resolve; }) });
  finishScan(h.sockets.slice());
  const socket = h.sockets[0]; helloLegacy(socket, { distribution: 'git' });
  h.repair(); h.repair();
  assert.equal(repairRequests(h).length, 0);
  assert.equal(h.copied(), 0);
  identify({ success: true, fileInfo: { fileKey: 'test-file' } });
  await settleClient();
  assert.equal(repairRequests(h).length, 1);
  assert.equal(socket.sent.filter(message => message.type === 'FILE_INFO').length, 1);
  assert.ok(socket.sent.findIndex(message => message.type === 'FILE_INFO') < socket.sent.findIndex(message => message.type === 'HRTECH_REPAIR'));
  h.context.hrtechSyncBridgeState();
  assert.equal(repairRequests(h).length, 1);
});

test('a deferred manual repair expires at twenty seconds and later transports cannot revive it', async () => {
  const h = repairHarness(); h.repair();
  h.advance(10000); h.repair();
  h.advance(9999);
  assert.equal(repairRequests(h).length, 0);
  assert.equal(h.element('hrtech-repair').disabled, true, 'the full 20-second wait remains active');
  assert.match(h.note(), /жду|ожида|ищ|подключ/i);
  h.advance(1);
  assert.equal(!!h.window.__hrtechRepairBusy, false);
  assert.equal(h.element('hrtech-repair').disabled, false);
  assert.match(h.note(), /не найден|не подключ|не дожд|не появился|истек|истёк|не ответ|не удалось|повтор/i);
  const expiredNote = h.note();
  const previous = h.sockets.length;
  h.window.__wsManualScan(); finishScan(h.sockets.slice(previous)); await settleClient();
  const socket = h.window.__wsGetActiveConnections()[0].ws;
  helloLegacy(socket, { distribution: 'git' }); await settleClient();
  assert.equal(repairRequests(h).length, 0);
  h.window.__hrtechRepairResult({ finished: true, ok: true, skills: searchSkills }, socket);
  assert.equal(h.note(), expiredNote, 'a late unsolicited success cannot replace the expired operation');
  assert.equal(h.copied(), 0);
});

test('pause cancels deferred repair and a click while paused cannot unpause or queue it', async () => {
  for (const pendingFirst of [true, false]) {
    const h = repairHarness();
    if (pendingFirst) h.repair();
    h.window.__wsDisconnectAll();
    if (!pendingFirst) h.repair();
    assert.equal(h.window.__wsIsPaused(), true);
    assert.equal(!!h.window.__hrtechRepairBusy, false);
    assert.equal(repairRequests(h).length, 0);
    assert.equal(h.copied(), 0);
    const previous = h.sockets.length;
    h.window.__wsManualScan(); finishScan(h.sockets.slice(previous)); await settleClient();
    const socket = h.window.__wsGetActiveConnections()[0].ws;
    helloLegacy(socket, { distribution: 'git' }); await settleClient();
    h.advance(20000);
    assert.equal(repairRequests(h).length, 0, 'manual resume cannot revive a canceled repair');
  }
});

test('manual repair prefers a registered MCP bridge, then legacy Git ahead of an earlier standalone app', async () => {
  for (const withMcp of [false, true]) {
    const h = repairHarness(); finishScan(h.sockets.slice(), withMcp ? [9223, 9224, 9225] : [9223, 9224]); await settleClient();
    const [app, git, modern] = h.sockets;
    helloLegacy(app, { distribution: 'app' }); helloLegacy(git, { distribution: 'git' });
    // An earlier verified app is still unable to receive new bundled skills.
    app.message({ id: 'already-used-app', method: 'GET_FILE_INFO', params: {} }); await settleClient();
    if (withMcp) confirmFile(modern, { hrtechVersion: '4.33', bridgeProtocol: 1, distribution: 'terminal', mcpClient: { name: 'codex-mcp-client' } });
    h.repair(); h.repair();
    const target = withMcp ? modern : git;
    assert.equal(h.window.__hrtechRepairSocket, target);
    assert.equal(repairRequests(h).length, 1);
    assert.equal(target.sent.filter(message => message.type === 'HRTECH_REPAIR').length, 1);
    assert.equal(app.sent.filter(message => message.type === 'HRTECH_REPAIR').length, 0);
    assert.equal(h.copied(), 0);
  }
});

test('manual repair excludes nonlocal transports and a legacy Git bridge for another file', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice(), [9223, 9224, 9225]); await settleClient();
  const [app, sameFile, otherFile] = h.sockets;
  helloLegacy(app, { distribution: 'app' }); helloLegacy(sameFile, { distribution: 'git' }); helloLegacy(otherFile, { distribution: 'git' });
  app.message({ id: 'known-current-file', method: 'GET_FILE_INFO', params: {} }); await settleClient();
  const active = h.window.__wsGetActiveConnections();
  const appConnection = active.find(c => c.ws === app);
  const sameConnection = active.find(c => c.ws === sameFile);
  const otherConnection = active.find(c => c.ws === otherFile);
  otherConnection.fileKey = 'another-file';
  const cloudMessages = [];
  const cloud = { fileKey: 'test-file', fileRegistered: true,
    serverInfo: { hrtechVersion: '4.33', bridgeProtocol: 1, mcpClient: { name: 'Codex' } },
    ws: { readyState: 1, send: data => cloudMessages.push(JSON.parse(data)) },
  };
  h.window.__wsGetActiveConnections = () => [cloud, appConnection, otherConnection, sameConnection];
  h.repair(cloud);
  assert.equal(cloudMessages.length, 0, 'an explicit nonlocal target is also refused');
  h.repair();
  assert.equal(h.window.__hrtechRepairSocket, sameFile);
  assert.equal(repairRequests(h).length, 1);
  assert.equal(otherFile.sent.filter(message => message.type === 'HRTECH_REPAIR').length, 0);
  assert.equal(cloudMessages.length, 0);
});

test('successful legacy repair refreshes only the initiating socket and waits for file identification', async () => {
  let pending;
  let requests = 0;
  const h = repairHarness({ sendPluginCommand() {
    requests++;
    if (requests <= 2) return Promise.resolve({ success: true, fileInfo: { fileKey: 'test-file' } });
    return new Promise(resolve => { pending = resolve; });
  } });
  finishScan(h.sockets.slice(), [9223, 9224]);
  await settleClient();
  const [a, b] = h.sockets;
  helloLegacy(a); helloLegacy(b);
  const target = h.window.__wsGetActiveConnections().find(c => c.ws === b);
  h.repair(target);
  h.window.__hrtechRepairResult({ finished: true, ok: true }, a);
  h.window.__hrtechRepairResult({ started: true }, b);
  assert.equal(requests, 2, 'wrong-socket and progress replies do not refresh');
  const beforeA = a.sent.filter(message => message.type === 'FILE_INFO').length;
  const beforeB = b.sent.filter(message => message.type === 'FILE_INFO').length;
  const done = h.window.__hrtechRepairResult({ finished: true, ok: true }, b);
  assert.equal(typeof done?.then, 'function');
  assert.equal(h.window.__hrtechRepairBusy, true);
  assert.notEqual(h.note(), 'Настройки восстановлены.', 'script exit alone is not file identification');
  pending({ success: true, fileInfo: { fileKey: 'test-file' } });
  await done;
  assert.match(h.note(), /файл[^.]*передан|файл[^.]*отправлен/i);
  assert.match(h.note(), /не подтверж|не сообщил[^.]*умени/i);
  assert.equal(h.window.__hrtechRepairBusy, false);
  assert.equal(h.window.__hrtechRepairSocket, null);
  assert.equal(a.sent.filter(message => message.type === 'FILE_INFO').length, beforeA);
  assert.equal(b.sent.filter(message => message.type === 'FILE_INFO').length, beforeB + 1);
  assert.equal(!!target.legacyFileVerified, false, 'local refresh does not fabricate an assistant probe');
});

test('failed repair or failed file refresh never reports success even when another bridge remains live', async () => {
  for (const scenario of ['script-failed', 'file-unidentified', 'read-rejected']) {
    let calls = 0;
    const h = repairHarness({ sendPluginCommand() {
      calls++;
      if (calls <= 2) return Promise.resolve({ success: true, fileInfo: { fileKey: 'test-file' } });
      return scenario === 'read-rejected' ? Promise.reject(new Error('Plugin timed out')) : Promise.resolve({ success: true });
    } });
    finishScan(h.sockets.slice(), [9223, 9224]);
    await settleClient();
    const [legacy, modern] = h.sockets;
    helloLegacy(legacy);
    confirmFile(modern, { hrtechVersion: '4.32', bridgeProtocol: 1, mcpClient: { name: 'Codex' } });
    h.repair(h.window.__wsGetActiveConnections().find(c => c.ws === legacy));
    await h.window.__hrtechRepairResult({ finished: true, ok: scenario !== 'script-failed' }, legacy);
    await settleClient();
    assert.match(h.note(), /Не удалось/, `${scenario}: unrelated live bridges cannot turn repair failure into success`);
    assert.equal(h.window.__hrtechRepairBusy, false, scenario);
    assert.equal(modern.readyState, 1, 'another assistant session is preserved');
    if (scenario === 'script-failed') assert.equal(calls, 2, 'failed script does not initiate a refresh');
  }
});

test('file refresh reports false for absent or disconnected sockets without invoking the plugin worker', async () => {
  let calls = 0;
  const h = clientHarness({ sendPluginCommand() { calls++; return Promise.resolve({ success: true, fileInfo: { fileKey: 'test-file' } }); } });
  assert.equal(await h.window.__wsRefreshFile({ readyState: 1 }), false);
  assert.equal(calls, 0);
  finishScan(h.sockets.slice());
  await settleClient();
  h.sockets[0].close();
  assert.equal(await h.window.__wsRefreshFile(h.sockets[0]), false);
  assert.equal(calls, 1);
});

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
  confirmFile(replacement);
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
  confirmFile(confirmed);
  const deadline = h.window.__wsGetActiveConnections()[0].handshakeTimer;
  h.window.__wsManualScan();
  const replacement = h.sockets.findLast(s => s.url.endsWith(':9223'));
  assert.notEqual(replacement, silent);
  assert.equal(silent.readyState, 3);
  assert.equal(deadline.canceled, true);
  assert.equal(h.window.__wsGetActiveConnections()[0].ws, confirmed);
  assert.equal(h.sockets.filter(s => s.url.endsWith(':9224')).length, 1);
  replacement.open();
  confirmFile(replacement);
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
  confirmFile(replacement);
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
  confirmFile(current.ws);
  current.ws.close();
  const before = attempts.length;
  h.advance(1000);
  assert.equal(h.sockets.filter(s => s.url.endsWith(':9223')).length, before + 1, 'file registration resets the retry budget');
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
      confirmFile(socket);
    } else socket.close();
  } });
  h.advance(30000);
  assert.equal(h.window.__wsGetActiveConnections().length, 0);
  available = true;
  h.advance(4000);
  assert.equal(h.window.__wsGetActiveConnections().length, 1);
  assert.equal(h.window.__wsGetActiveConnections()[0].fileRegistered, true);
});

test('product status is notified immediately on identity, dropout, pause and retry', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice());
  assert.equal(h.changes.at(-1), 0, 'TCP open is not a confirmed bridge');
  h.sockets[0].message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.27', skills: [] } });
  assert.equal(h.changes.at(-1), 0, 'server identity alone does not confirm file registration');
  h.sockets[0].message({ type: 'FILE_REGISTERED', data: { fileKey: 'test-file' } });
  assert.equal(h.changes.at(-1), 1, 'file registration is visible before the periodic UI tick');
  h.sockets[0].close();
  assert.equal(h.changes.at(-1), 0, 'dropout is visible before the periodic UI tick');
  const count = h.changes.length;
  h.window.__wsDisconnectAll();
  assert.equal(h.changes.length, count + 1);
  h.window.__wsManualScan();
  assert.equal(h.changes.length, count + 2);
});

test('a failed file identity request reconnects instead of leaving a false confirmed connection', async () => {
  let requests = 0;
  const h = clientHarness({ sendPluginCommand() {
    requests++;
    return requests === 1 ? Promise.reject(new Error('Plugin worker timed out'))
      : Promise.resolve({ success: true, fileInfo: { fileKey: 'test-file' } });
  } });
  finishScan(h.sockets.slice());
  h.sockets[0].message({ type: 'SERVER_HELLO', data: { fileRegistrationAck: true, mcpClient: { name: 'Codex' } } });
  assert.equal(h.changes.at(-1), 0);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(h.window.__wsGetActiveConnections().length, 0);
  h.advance(1000);
  const replacement = h.sockets.findLast(socket => socket.url.endsWith(':9223'));
  replacement.open();
  await Promise.resolve();
  assert.equal(requests, 2);
  assert.ok(replacement.sent.some(message => message.type === 'FILE_INFO' && message.data.fileKey === 'test-file'));
  confirmFile(replacement, { mcpClient: { name: 'Codex' } });
  assert.equal(h.changes.at(-1), 1);
});

test('a bridge ACK is required for registration and must identify the expected file', async () => {
  for (const failure of ['missing', 'mismatch']) {
    const h = clientHarness();
    finishScan(h.sockets.slice());
    await Promise.resolve();
    const socket = h.sockets[0];
    socket.message({ type: 'SERVER_HELLO', data: { fileRegistrationAck: true, mcpClient: { name: 'Codex' } } });
    assert.equal(h.changes.at(-1), 0);
    if (failure === 'missing') {
      h.advance(19999);
      assert.equal(h.window.__wsGetActiveConnections().length, 1);
      h.advance(1);
    } else {
      socket.message({ type: 'FILE_REGISTERED', data: { fileKey: 'other-file' } });
    }
    assert.equal(h.window.__wsGetActiveConnections().length, 0, failure);
    assert.equal(h.changes.at(-1), 0, failure);
  }
});

test('an older bridge stays reachable for update without being reported as a registered file', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice());
  const socket = h.sockets[0];
  socket.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.30', bridgeProtocol: 1, mcpClient: { name: 'Codex' } } });
  h.advance(30000);
  assert.equal(socket.readyState, 1);
  assert.equal(h.window.__wsGetActiveConnections()[0].serverInfo.mcpClient.name, 'Codex');
  assert.equal(h.changes.at(-1), 0);
  h.window.__wsManualScan();
  assert.equal(socket.readyState, 3, 'manual retry is available for unregistered transport');
});

test('a late message from a departed socket cannot restore stale host metadata', () => {
  const h = clientHarness();
  finishScan(h.sockets.slice());
  const socket = h.sockets[0];
  confirmFile(socket, { skills: [] });
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
const serverClass = ts.transpileModule(
  serverSource.slice(serverSource.indexOf('export class FigmaWebSocketServer')).replace('export class', 'class'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
function serverHarness() {
  const context = vm.createContext({
    EventEmitter, WebSocket: { OPEN: 1, CONNECTING: 0 },
    logger: { info() {}, warn() {}, debug() {}, error() {} },
    setTimeout(fn, delay) { return { fn, delay }; }, clearTimeout() {},
    setInterval() {}, clearInterval() {},
  });
  const Server = vm.runInContext(serverClass + '\nFigmaWebSocketServer;', context);
  const server = new Server({ port: 0 });
  const socket = () => ({
    readyState: 1, sent: [],
    send(message) { this.sent.push(JSON.parse(message)); },
    close() { this.readyState = 2; },
  });
  return { server, socket };
}

test('FILE_INFO registers initial and refreshed selection, and remains compatible with old plugins', () => {
  const { server, socket } = serverHarness();
  const first = socket();
  const selected = [{ id: '1:2', name: 'Selected frame', type: 'FRAME' }];
  server.handleMessage({ type: 'FILE_INFO', data: { fileKey: 'A', fileName: 'Design', currentPage: 'Page', selection: selected, selectionCount: 1 } }, first);
  assert.deepEqual(server.getCurrentSelection().nodes, selected);
  assert.equal(server.getCurrentSelection().count, 1);
  assert.equal(server.getCurrentSelection().page, 'Page');
  assert.deepEqual(first.sent.find(m => m.type === 'FILE_REGISTERED'), { type: 'FILE_REGISTERED', data: { fileKey: 'A', fileName: 'Design' } });
  assert.deepEqual(first.sent.find(m => m.type === 'PIN_STATE'), { type: 'PIN_STATE', data: { pinned: false, fileKey: 'A', fileName: 'Design', pinSource: null } });

  const replacement = socket();
  server.handleMessage({ type: 'FILE_INFO', data: { fileKey: 'A', fileName: 'Design', currentPage: 'Page 2', selection: [], selectionCount: 0 } }, replacement);
  assert.equal(server.getCurrentSelection().count, 0, 'reconnect replaces stale selection even when selection becomes empty');
  assert.equal(server.getCurrentSelection().page, 'Page 2');
  assert.equal(server.isClientConnected(), true);

  const legacy = socket();
  server.handleMessage({ type: 'FILE_INFO', data: { fileKey: 'B', fileName: 'Legacy plugin' } }, legacy);
  assert.equal(server.getConnectedFileInfo().fileKey, 'B');
  assert.equal(server.isClientConnected(), true, 'no client-side ACK is required from older plugins');
});

test('late identity from a retired socket cannot evict its live replacement', () => {
  const { server, socket } = serverHarness();
  const old = socket(), replacement = socket();
  const identity = { type: 'FILE_INFO', data: { fileKey: 'A', fileName: 'Design' } };
  server.handleMessage(identity, old);
  server.handleMessage(identity, replacement);
  assert.equal(old.readyState, 2);
  server.handleMessage(identity, old);
  assert.equal(server.clients.get('A').ws, replacement);
  assert.equal(replacement.readyState, 1);
  // Retirement is authoritative even if a delayed callback still sees OPEN.
  old.readyState = 1;
  server.handleMessage(identity, old);
  assert.equal(server.clients.get('A').ws, replacement);
  assert.equal(server.isClientConnected(), true);
});

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

test('connection summary includes every bridge version and friendly confirmed MCP names', () => {
  const context = vm.createContext({ hrtechReadyConnections: () => [
    { port: 9223, fileRegistered: true, serverInfo: { hrtechVersion: '5.0.0', mcpClient: { name: 'codex-mcp-client' } } },
    { port: 9224, serverInfo: { hrtechVersion: '4.25' } },
    { port: 9225, fileRegistered: true, serverInfo: { hrtechVersion: '5.0.0', mcpClient: { name: 'antigravity-client' } } },
    { port: 9226, fileRegistered: true, serverInfo: { hrtechVersion: '5.0.0', mcpClient: { name: 'cursor-vscode' } } },
    { port: 9227, fileRegistered: true, serverInfo: { hrtechVersion: '5.0.0', mcpClient: { name: 'claude-code' } } },
  ] });
  for (const name of ['hrtechFormatClientName', 'hrtechAssistantNames', 'hrtechConnectionVersions']) {
    vm.runInContext(productStatement(name), context);
  }
  assert.equal(context.hrtechAssistantNames().join(','), 'Codex,Antigravity,Cursor,Claude Code');
  const versions = context.hrtechConnectionVersions();
  assert.match(versions, /Codex v5\.0\.0 \(:9223\)/);
  assert.match(versions, /Мост v4\.25 \(:9224\)/);
  assert.match(versions, /Antigravity v5\.0\.0 \(:9225\)/);
});

test('published plugin updates an older packaged bridge once, without touching git installs or newer bridges', () => {
 const requests=[],window={};let connections=[];
 const context=vm.createContext({window,HRTECH_UI_VERSION:'5.0.0',HRTECH_BRIDGE_VERSION:'5.0.0',hrtechReadyConnections:()=>connections,hrtechRepair:c=>requests.push(c)});
 for (const name of ['hrtechVersionOlder', 'hrtechAutoUpdate']) vm.runInContext(productStatement(name), context);
 const attempt=()=>context.hrtechAutoUpdate();
 const connection=(version,distribution='terminal',client={name:'Codex'})=>({fileKey:'test-file',serverInfo:{hrtechVersion:version,distribution,bridgeProtocol:1,mcpClient:client}});
 const unidentified=connection('4.33');delete unidentified.fileKey;connections=[unidentified];attempt();assert.equal(requests.length,0);
 for(const candidate of [connection('5.0.0'),connection('5.1.0'),connection('4.33','git'),connection('4.33','terminal',null)]){connections=[candidate];attempt();}
 assert.equal(requests.length,0);
 const eligible=connection('4.33');connections=[eligible];attempt();attempt();
 assert.equal(requests.length,1);assert.equal(requests[0],eligible);
 window.__hrtechRepairBusy=true;connections=[connection('4.28')];attempt();assert.equal(requests.length,1);
 assert.equal(context.hrtechVersionOlder('4.9','4.30'),true);
 assert.equal(context.hrtechVersionOlder('4.37','5.0.0'),true);
 assert.equal(context.hrtechVersionOlder('broken','5.0.0'),false);
});

test('plugin-only 4.34 release targets bridge 4.33 and does not trigger an update loop for an already current engine', () => {
  const requests = [];
  let connections = [];
  const context = vm.createContext({ window: {}, HRTECH_UI_VERSION: '4.34', HRTECH_BRIDGE_VERSION: '4.33',
    hrtechReadyConnections: () => connections, hrtechRepair: connection => requests.push(connection),
  });
  for (const name of ['hrtechVersionOlder', 'hrtechAutoUpdate']) vm.runInContext(productStatement(name), context);
  const attempt = () => context.hrtechAutoUpdate();
  const bridge = (version, distribution) => ({ fileKey: 'test-file', serverInfo: {
    hrtechVersion: version, distribution, bridgeProtocol: 1, mcpClient: { name: 'codex-mcp-client' },
  } });
  for (const candidate of [bridge('4.33', 'terminal'), bridge('4.33', 'app'), bridge('4.34', 'app'), bridge('4.32', 'git')]) {
    connections = [candidate]; attempt(); attempt();
  }
  assert.equal(requests.length, 0, 'a newer plugin UI is not an available engine update');
  const outdated = bridge('4.32', 'terminal'); connections = [outdated]; attempt(); attempt();
  assert.equal(requests.length, 1);
  assert.equal(requests[0], outdated);
});

const searchSkills = [{ name: 'hrtech-figma-search' }];
function helloCheckedBridge(socket, overrides = {}) {
  confirmFile(socket, { hrtechVersion: versionMeta.bridgeVersion, bridgeProtocol: 1, repairCheck: true,
    distribution: 'terminal', mcpClient: { name: 'Codex', version: '1' }, skills: searchSkills, ...overrides });
}
function checkRequest(socket) { return socket.sent.findLast(m => m.type === 'HRTECH_CHECK_CONNECTION'); }
function checkedReply(socket, request = checkRequest(socket), overrides = {}) {
  assert.ok(request, 'the UI must send a check request first');
  socket.message({ type: 'HRTECH_CONNECTION_CHECK_RESULT', data: {
    requestId: request.requestId, fileKey: 'test-file', fileOk: true,
    client: { name: 'Codex', version: '1' }, skillAvailable: true, ...overrides,
  } });
}
async function repairedModern(h, socket) {
  h.repair(h.window.__wsGetActiveConnections().find(c => c.ws === socket));
  socket.message({ type: 'HRTECH_REPAIR_RESULT', data: { finished: true, ok: true, skills: searchSkills, distribution: 'terminal' } });
  await settleClient();
  socket.message({ type: 'FILE_REGISTERED', data: { fileKey: 'test-file' } });
  return checkRequest(socket);
}

test('advertised connection check waits for file registration and checks all three facts', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
  const socket = h.sockets[0];
  socket.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.33', bridgeProtocol: 1,
    fileRegistrationAck: true, repairCheck: true, mcpClient: { name: 'Codex' }, skills: [] } });
  assert.equal(checkRequest(socket), undefined);
  assert.equal(h.element('hrtech-repair').textContent, 'Починить');
  assert.equal(h.element('hrtech-connect').hidden, true, 'one repair button for an identified bridge');
  socket.message({ type: 'FILE_REGISTERED', data: { fileKey: 'test-file' } });
  checkedReply(socket);
  const conn = h.window.__wsGetActiveConnections()[0];
  assert.equal(conn.connectionCheck.fileOk, true);
  assert.equal(h.context.hrtechHasSearchSkill(conn), true, 'the returned check supersedes the earlier skill list');
  assert.equal(h.element('hrtech-repair').textContent, 'Обновить');
  assert.match(h.report(), /Обмен с файлом: подтверждён/);
  assert.equal(socket.sent.filter(m => m.type === 'HRTECH_REPAIR').length, 0);
});

test('check responses are correlated by socket, request and file; duplicates and retired sockets cannot change proof', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice(), [9223, 9224]); await settleClient();
  const [a, b] = h.sockets; helloCheckedBridge(a); helloCheckedBridge(b);
  const requestA = checkRequest(a), requestB = checkRequest(b);
  checkedReply(b, requestA);
  checkedReply(a, { requestId: 'unknown-request' });
  assert.ok(h.window.__wsGetActiveConnections().every(c => !c.connectionCheck));
  checkedReply(a, requestA);
  checkedReply(a, requestA, { fileOk: false, skillAvailable: false });
  assert.equal(h.window.__wsGetActiveConnections().find(c => c.ws === a).connectionCheck.fileOk, true);
  checkedReply(b, requestB, { fileKey: 'another-file' });
  assert.equal(h.window.__wsGetActiveConnections().find(c => c.ws === b).connectionCheck.fileOk, false);
  a.close(); checkedReply(a, requestA);
  assert.match(h.report(), /Обмен с файлом: ожидает подтверждения/);
  assert.doesNotMatch(h.report(), /Связь с файлом подтверждена.*Умение поиска установлено/);
});

test('repair success requires file, MCP client and search skill, not just successful script exit', async () => {
  for (const [override, message] of [
    [{ fileOk: false }, /Связь с этим файлом не подтверждена/],
    [{ client: null, skillAvailable: false }, /Подключение помощника не подтверждено/],
    [{ skillAvailable: false }, /Не удалось подтвердить умение поиска для Codex/],
    [{ fileKey: 'other-file' }, /Связь с этим файлом не подтверждена/],
    [{}, /Связь с файлом подтверждена.*Умение поиска установлено/],
  ]) {
    const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
    const socket = h.sockets[0]; helloCheckedBridge(socket);
    const oldRequest = checkRequest(socket);
    const request = await repairedModern(h, socket);
    assert.notEqual(request.requestId, oldRequest.requestId);
    assert.equal(h.window.__hrtechRepairBusy, true);
    assert.match(h.element('hrtech-repair').textContent, /Восстанавливаю|Проверяю/);
    checkedReply(socket, oldRequest);
    assert.equal(h.window.__hrtechRepairBusy, true, 'a pre-repair response cannot finish the operation');
    checkedReply(socket, request, override);
    assert.match(h.note(), message);
    assert.equal(h.window.__hrtechRepairBusy, false);
    assert.doesNotMatch(h.note(), /Обновление установлено/);
    if (!override.client && 'client' in override) assert.doesNotMatch(h.note(), /умени[ея].*(нет|найден)/);
  }
});

test('modern check timeout ignores late success and copied diagnostics retain the failure', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
  const socket = h.sockets[0]; helloCheckedBridge(socket);
  const request = await repairedModern(h, socket);
  h.advance(10000);
  assert.equal(h.window.__hrtechRepairBusy, false);
  assert.match(h.note(), /не ответил на проверку/);
  assert.match(h.element('bun-connection-title').textContent, /связь с файлом не подтвержд[её]на/i, 'the main heading updates on timeout without waiting for the periodic refresh');
  checkedReply(socket, request);
  assert.match(h.note(), /не ответил на проверку/);
  assert.match(h.element('bun-connection-title').textContent, /связь с файлом не подтвержд[её]на/i, 'late success cannot restore a successful main heading');
  assert.equal(h.element('hrtech-repair').textContent, 'Починить');
  const report = h.report();
  assert.match(report, /Установка: порт 9223: terminal/);
  assert.match(report, /Обмен с файлом: ожидает подтверждения/);
  assert.match(report, /Восстановление: порт 9223: Настройки восстановлены/);
  assert.match(report, /Проверка: порт 9223: Мост не ответил/);
  socket.close();
  assert.doesNotMatch(h.report(), /Настройки восстановлены|Мост не ответил/);
});

test('a client initialized after the first automatic check receives one new check', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
  const socket = h.sockets[0]; helloCheckedBridge(socket, { mcpClient: null });
  checkedReply(socket, undefined, { client: null, skillAvailable: false });
  const count = socket.sent.filter(m => m.type === 'HRTECH_CHECK_CONNECTION').length;
  h.context.hrtechSyncBridgeState(); h.context.hrtechSyncBridgeState();
  assert.equal(socket.sent.filter(m => m.type === 'HRTECH_CHECK_CONNECTION').length, count);
  socket.message({ type: 'HRTECH_MCP_STATUS', data: { client: { name: 'Codex', version: '1' } } });
  assert.equal(socket.sent.filter(m => m.type === 'HRTECH_CHECK_CONNECTION').length, count + 1);
  checkedReply(socket);
  assert.match(h.report(), /Обмен с файлом: подтверждён/);
});

test('legacy repair reports a sent file independently of search availability and uses only the completed reply skill list', async () => {
  for (const { distribution, helloSkills, completedSkills, expected, progressSkills } of [
    { distribution: 'git', helloSkills: [], completedSkills: searchSkills, expected: 'installed' },
    { distribution: 'git', helloSkills: searchSkills, completedSkills: [], expected: 'missing' },
    { distribution: 'app', helloSkills: searchSkills, completedSkills: [], expected: 'missing' },
    { distribution: 'git', helloSkills: searchSkills, completedSkills: undefined, expected: 'unknown' },
    { distribution: 'git', helloSkills: [], completedSkills: undefined, expected: 'unknown', progressSkills: searchSkills },
    { distribution: 'git', helloSkills: searchSkills, completedSkills: { name: 'hrtech-figma-search' }, expected: 'unknown' },
  ]) {
    const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
    const socket = h.sockets[0]; helloLegacy(socket, { skills: helloSkills });
    socket.message({ type: 'HRTECH_HOST_STATUS', data: { distribution } });
    const before = socket.sent.filter(message => message.type === 'FILE_INFO').length;
    h.repair();
    if (progressSkills) socket.message({ type: 'HRTECH_REPAIR_RESULT', data: { started: true, skills: progressSkills } });
    socket.message({ type: 'HRTECH_REPAIR_RESULT', data: { finished: true, ok: true, distribution,
      ...(completedSkills === undefined ? {} : { skills: completedSkills }) } });
    await settleClient();
    const conn = h.window.__wsGetActiveConnections()[0];
    assert.equal(h.window.__hrtechRepairBusy, false);
    assert.equal(checkRequest(socket), undefined);
    assert.equal(h.copied(), 0);
    assert.equal(socket.sent.filter(message => message.type === 'FILE_INFO').length, before + 1);
    assert.equal(!!conn.legacyFileVerified, false);
    assert.equal(conn.serverInfo.mcpClient, undefined);
    assert.equal(h.context.hrtechAssistantNames().length, 0);
    assert.doesNotMatch(h.note(), /Связь с файлом подтверждена|установщик|введите/);
    if (distribution === 'git') assert.doesNotMatch(h.note(), /Терминал/);
    assert.match(h.note(), /файл[^.]*передан|файл[^.]*отправлен/i, `${distribution}/${expected}: local file transmission is its own fact`);
    assert.doesNotMatch(h.note(), /(?:Codex|Claude|помощник|клиент)[^.]*подключ[её]н/i);
    if (expected === 'installed') assert.match(h.note(), /(?:поиск|умени)[^.]*(?:установлен|найден)|(?:установлен|найден|наш[её]л)[^.]*поиск/i);
    else {
      assert.match(h.note(), /не найден|не наш[её]л|не подтверж|отсутств|нет умения|нужно обновить|для установки поиска|не сообщил[^.]*умени/i);
      assert.doesNotMatch(h.note(), /умение поиска установлено|умение поиска найдено|мост наш[её]л умение поиска/i, 'HELLO or a progress reply cannot supply the completed repair result');
    }
    if (distribution === 'app') assert.match(h.note(), /пакет|автоном|4\.27/i);
    assert.match(h.report(), new RegExp('Установка: порт 9223: ' + distribution));
    assert.match(h.report(), /файл[^\n]*передан|файл[^\n]*отправлен/i);
    assert.doesNotMatch(h.report(), /Обмен с файлом: подтвержд[её]н/);
  }
});

test('legacy repair preserves an actual earlier file roundtrip without inventing client identity', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
  const socket = h.sockets[0]; helloLegacy(socket, { distribution: 'git' });
  socket.message({ id: 'actual-earlier-query', method: 'GET_FILE_INFO', params: {} }); await settleClient();
  const conn = h.window.__wsGetActiveConnections()[0];
  assert.equal(conn.legacyFileVerified, true);
  h.repair();
  socket.message({ type: 'HRTECH_REPAIR_RESULT', data: { finished: true, ok: true, distribution: 'git', skills: searchSkills } });
  await settleClient();
  assert.equal(conn.legacyFileVerified, true, 'repair must not erase real proof for the same live socket and file');
  assert.equal(conn.serverInfo.mcpClient, undefined);
  assert.equal(h.context.hrtechAssistantNames().length, 0);
  assert.match(h.report(), /Обмен с файлом: подтвержд[её]н/);
  assert.match(h.note(), /файл[^.]*передан|файл[^.]*отправлен/i);
});

test('the real skill renderer shows the search example only for the current live connection with search installed', async () => {
  const h = repairHarness();
  for (const name of ['hrtechOffline', 'hrtechSkills']) vm.runInContext(productStatement(name), h.context);
  const render = () => { h.context.hrtechSkills(); return h.element('bun-figma-search-example').hidden; };
  assert.equal(render(), true, 'no connection has no installed search example');
  finishScan(h.sockets.slice(), [9223, 9224]); await settleClient();
  const [app, git] = h.sockets;
  helloLegacy(app, { distribution: 'app', skills: searchSkills });
  helloLegacy(git, { distribution: 'git', skills: [] });
  assert.equal(render(), false);
  h.repair(h.window.__wsGetActiveConnections().find(c => c.ws === app));
  app.message({ type: 'HRTECH_REPAIR_RESULT', data: { finished: true, ok: true, distribution: 'app', skills: [] } });
  await settleClient();
  assert.equal(render(), true, 'a fresh app result removes a stale HELLO example');
  h.repair(h.window.__wsGetActiveConnections().find(c => c.ws === git));
  git.message({ type: 'HRTECH_REPAIR_RESULT', data: { finished: true, ok: true, distribution: 'git', skills: searchSkills } });
  await settleClient();
  assert.equal(render(), false, 'the updated Git connection is current and exposes its installed search');
  git.close();
  assert.equal(render(), true, 'the remaining app cannot inherit search availability from a disconnected Git bridge');
  app.close();
  assert.equal(render(), true);
});

test('managed modern repair waits for its supervisor handover and validates the replacement without disturbing another assistant', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice(), [9223, 9224]); await settleClient();
  const [old, other] = h.sockets;
  helloCheckedBridge(old, { hrtechVersion: '4.32', repairCheck: false });
  helloCheckedBridge(other);
  h.repair(h.window.__wsGetActiveConnections().find(c => c.ws === old));
  old.message({ type: 'HRTECH_REPAIR_RESULT', data: { finished: true, ok: true, distribution: 'terminal', skills: searchSkills } });
  await settleClient();
  old.message({ type: 'FILE_REGISTERED', data: { fileKey: 'test-file' } });
  assert.equal(h.window.__hrtechRepairBusy, true, 'no premature legacy success before the supervisor poll');
  assert.match(h.note(), /Жду обновлённый мост/);
  old.close();
  checkedReply(other);
  assert.equal(h.window.__hrtechRepairBusy, true, 'another working session cannot complete this repair');
  h.advance(1000);
  const replacement = h.sockets.findLast(s => s.url.endsWith(':9223'));
  replacement.open(); await settleClient(); helloCheckedBridge(replacement);
  const request = checkRequest(replacement);
  assert.ok(request);
  assert.equal(h.window.__hrtechRepairSocket, replacement);
  checkedReply(old, { requestId: request.requestId });
  assert.equal(h.window.__hrtechRepairBusy, true);
  checkedReply(replacement, request);
  assert.equal(h.note(), 'Связь с файлом подтверждена. Умение поиска установлено.');
  assert.equal(h.window.__hrtechRepairBusy, false);
  assert.equal(other.readyState, 1);
  assert.equal(other.sent.filter(m => m.type === 'HRTECH_REPAIR').length, 0);
});

test('repair cannot rebind to another client or file and its overall deadline ignores late success', async () => {
  for (const mismatch of ['client', 'file']) {
    const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
    const old = h.sockets[0]; helloCheckedBridge(old);
    h.repair(); old.close(); h.advance(1000);
    const replacement = h.sockets.findLast(s => s.url.endsWith(':9223'));
    replacement.open(); await settleClient();
    if (mismatch === 'file') h.window.__wsGetActiveConnections()[0].fileKey = 'other-file';
    replacement.message({ type: 'SERVER_HELLO', data: { hrtechVersion: '4.33', repairCheck: true, fileRegistrationAck: true,
      bridgeProtocol: 1, mcpClient: { name: mismatch === 'client' ? 'Claude Code' : 'Codex' }, skills: searchSkills } });
    replacement.message({ type: 'FILE_REGISTERED', data: { fileKey: mismatch === 'file' ? 'other-file' : 'test-file' } });
    assert.equal(checkRequest(replacement), undefined, mismatch);
    assert.equal(h.window.__hrtechRepairSocket, old, mismatch);
    h.advance(89000);
    assert.equal(h.window.__hrtechRepairBusy, false, mismatch);
    assert.match(h.note(), /Восстановление не подтверждено/);
    old.message({ type: 'HRTECH_REPAIR_RESULT', data: { finished: true, ok: true, skills: searchSkills } });
    assert.match(h.note(), /Восстановление не подтверждено/);
  }
});

async function repairHandover(h) {
  finishScan(h.sockets.slice()); await settleClient();
  const old = h.sockets[0]; helloCheckedBridge(old);
  h.repair(); old.close(); h.advance(1000);
  const socket = h.sockets.findLast(s => s.url.endsWith(':9223'));
  socket.open(); await settleClient(); helloCheckedBridge(socket);
  return { old, socket };
}

test('a replacement engine retries temporary missing client or skill without replaying repair', async () => {
  for (const temporary of [{ client: null, skillAvailable: false }, { skillAvailable: false }]) {
    const h = repairHarness();
    const { old, socket } = await repairHandover(h);
    const first = checkRequest(socket);
    checkedReply(socket, first, temporary);
    assert.equal(h.window.__hrtechRepairBusy, true);
    assert.doesNotMatch(h.note(), /Связь с файлом подтверждена.*Умение поиска установлено/);
    h.advance(1499);
    assert.equal(checkRequest(socket), first);
    h.advance(1);
    const second = checkRequest(socket);
    assert.notEqual(second.requestId, first.requestId);
    checkedReply(socket, first);
    assert.equal(h.window.__hrtechRepairBusy, true, 'the old request cannot finish the retry');
    checkedReply(socket, second);
    assert.equal(h.note(), 'Связь с файлом подтверждена. Умение поиска установлено.');
    assert.equal(h.window.__hrtechRepairBusy, false);
    assert.equal(old.sent.filter(m => m.type === 'HRTECH_REPAIR').length, 1);
    assert.equal(socket.sent.filter(m => m.type === 'HRTECH_REPAIR').length, 0);
  }
});

test('handover retries end at the original repair deadline and late positive replies cannot claim success', async () => {
  const h = repairHarness(); const { socket } = await repairHandover(h);
  let request = checkRequest(socket);
  checkedReply(socket, request, { skillAvailable: false });
  for (let i = 0; i < 59; i++) {
    h.advance(1500);
    const next = checkRequest(socket);
    assert.notEqual(next.requestId, request.requestId);
    request = next;
    checkedReply(socket, request, { skillAvailable: false });
    assert.equal(h.window.__hrtechRepairBusy, true);
  }
  h.advance(500);
  assert.equal(h.window.__hrtechRepairBusy, false);
  assert.match(h.note(), /Восстановление не подтверждено.*умение поиска для Codex/);
  const count = socket.sent.filter(m => m.type === 'HRTECH_CHECK_CONNECTION').length;
  h.advance(10000); checkedReply(socket, request);
  assert.equal(socket.sent.filter(m => m.type === 'HRTECH_CHECK_CONNECTION').length, count);
  assert.doesNotMatch(h.note(), /Связь с файлом подтверждена.*Умение поиска установлено/);
});

test('an already successful legacy EXECUTE_CODE establishes proof only after a local matching file read', async () => {
  let executed = 0, identified = 0;
  const h = repairHarness({ sendPluginCommand(method) {
    if (method === 'EXECUTE_CODE') { executed++; return Promise.resolve({ success: true, result: 'existing work' }); }
    if (method === 'GET_FILE_INFO') { identified++; return Promise.resolve({ success: true, fileInfo: { fileKey: 'test-file' } }); }
    throw new Error('Unexpected plugin method: ' + method);
  } });
  finishScan(h.sockets.slice()); await settleClient();
  const socket = h.sockets[0]; helloLegacy(socket);
  assert.equal(identified, 1);
  assert.equal(h.window.__wsGetActiveConnections()[0].legacyFileVerified, undefined);
  socket.message({ id: 'existing-command', method: 'EXECUTE_CODE', params: { code: 'already requested by assistant' } });
  await settleClient();
  assert.equal(executed, 1, 'the UI must never execute an extra command to manufacture proof');
  assert.equal(identified, 2);
  assert.equal(socket.sent.find(m => m.id === 'existing-command').result.success, true);
  assert.equal(h.window.__wsGetActiveConnections()[0].legacyFileVerified, true);
  assert.equal(h.context.hrtechAssistantNames().length, 0);
});

test('failed legacy execution or a changed/disconnected file cannot acquire proof from a late local read', async () => {
  for (const scenario of ['execute-failed', 'mismatch', 'read-failed', 'closed']) {
    let reads = 0, resolveRead;
    const h = repairHarness({ sendPluginCommand(method) {
      if (method === 'EXECUTE_CODE') return Promise.resolve({ success: scenario !== 'execute-failed' });
      reads++;
      if (reads === 1) return Promise.resolve({ success: true, fileInfo: { fileKey: 'test-file' } });
      return new Promise(resolve => { resolveRead = resolve; });
    } });
    finishScan(h.sockets.slice()); await settleClient();
    const socket = h.sockets[0]; helloLegacy(socket);
    const conn = h.window.__wsGetActiveConnections()[0];
    socket.message({ id: 'existing-command', method: 'EXECUTE_CODE', params: {} });
    await settleClient();
    if (scenario === 'execute-failed') assert.equal(reads, 1);
    else {
      if (scenario === 'closed') socket.close();
      resolveRead({ success: scenario !== 'read-failed', fileInfo: { fileKey: scenario === 'mismatch' ? 'other-file' : 'test-file' } });
      await settleClient();
    }
    assert.equal(!!conn.legacyFileVerified, false, scenario);
    assert.doesNotMatch(h.report(), /Обмен с файлом: подтверждён/);
  }
});

test('replaced tab shows explicit state and one-click reclaim restores the file connection', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
  const socket = h.sockets[0]; helloCheckedBridge(socket); checkedReply(socket);
  socket.close(1000, 'Replaced by same file reconnection');
  assert.deepEqual(Array.from(h.window.__wsGetReplacedPorts()), [9223]);
  assert.equal(h.element('bun-connection-title').textContent, 'Открыто в другой вкладке');
  assert.equal(h.element('hrtech-reclaim').hidden, false);
  const before = h.sockets.length;
  h.context.hrtechReclaim();
  assert.deepEqual(Array.from(h.window.__wsGetReplacedPorts()), []);
  finishScan(h.sockets.slice(before)); await settleClient();
  const next = h.window.__wsGetActiveConnections()[0].ws;
  helloCheckedBridge(next); checkedReply(next);
  assert.equal(h.element('bun-connection-title').textContent, 'Файл подключён');
  assert.equal(h.element('hrtech-reclaim').hidden, true);
});

test('repair failure surfaces redacted errorDetail in both the UI note and diagnostics report', async () => {
  const h = repairHarness(); finishScan(h.sockets.slice()); await settleClient();
  const socket = h.sockets[0]; helloCheckedBridge(socket); checkedReply(socket);
  h.repair();
  socket.message({ type: 'HRTECH_REPAIR_RESULT', data: { finished: true, ok: false, errorDetail: 'connect-mcp: не удалось подключить Codex' } });
  assert.match(h.note(), /connect-mcp: не удалось подключить Codex/);
  assert.match(h.report(), /Последняя ошибка обновления: connect-mcp: не удалось подключить Codex/);
});

test('PIN_STATE updates the lock switch and respects tool-owned session locks', async () => {
  const h = repairHarness();
  for (const name of ['hrtechSendPin', 'hrtechToggleLock', 'window.__hrtechSetLock']) {
    vm.runInContext(productStatement(name), h.context);
  }
  finishScan(h.sockets.slice()); await settleClient();
  const socket = h.sockets[0]; helloCheckedBridge(socket); checkedReply(socket);
  h.context.hrtechToggleLock();
  assert.equal(h.window.__hrtechLocked, true);
  assert.equal(h.element('hrtech-lock-toggle').getAttribute('aria-pressed'), 'true');
  assert.ok(socket.sent.some(m => m.type === 'PIN_FILE'));
  socket.message({ type: 'PIN_STATE', data: { pinned: true, pinSource: 'tool' } });
  assert.equal(h.element('hrtech-lock-toggle').disabled, true);
  h.context.hrtechToggleLock();
  assert.equal(h.window.__hrtechLocked, true, 'UI click must not unlock a tool-owned session pin');
});
