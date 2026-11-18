import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/local.ts', import.meta.url), 'utf8');
const start = source.indexOf('// Start WebSocket bridge server with port range fallback.');
const end = source.indexOf('\n\t\t\tif (this.wsServer) {', start);
assert.ok(start > 0 && end > start, 'production bridge startup block must exist');
const executable = ts.transpileModule(`(async function() {${source.slice(start, end)} })`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;

// Run the production startup path with a fake socket binder. Never bind ports,
// inspect other processes, or modify the user's port advertisements in tests.
async function startup(outcomes, { evict = false, recovery } = {}) {
  const attempted = [], advertised = [];
  let evictions = 0, orphanScans = 0;
  const state = { wsServer: null, wsActualPort: null, wsStartupError: null };
  class Server {
    constructor({ port }) { this.port = port; }
    async start() {
      attempted.push(this.port);
      const outcome = outcomes[attempted.length - 1] ?? outcomes.at(-1);
      if (outcome) throw Object.assign(new Error(`${outcome} at localhost:${this.port}`), { code: outcome });
    }
    address() { return { port: this.port }; }
  }
  const run = vm.runInNewContext(executable, {
    Error, process: { env: {} }, DEFAULT_WS_PORT: 9223,
    getPortRange: port => Array.from({ length: 10 }, (_, i) => port + i),
    FigmaWebSocketServer: Server,
    cleanupStalePortFiles() { recovery?.cleanupStalePortFiles(); },
    cleanupOrphanedProcesses() { orphanScans++; return recovery?.cleanupOrphanedProcesses() ?? 0; },
    evictOldestInstance() { evictions++; return recovery?.evictOldestInstance() ?? evict; },
    advertisePort(port) { advertised.push(port); }, registerPortCleanup() {},
    refreshPortAdvertisement() {}, HEARTBEAT_INTERVAL_MS: 30000,
    setInterval() { return { unref() {} }; },
    logger: { info() {}, debug() {}, warn() {} },
  });
  await run.call(state);
  return { state, attempted, advertised, evictions, orphanScans };
}

for (const code of ['EACCES', 'EPERM', 'ENOTFOUND', 'EADDRNOTAVAIL']) {
  test(`${code} is preserved and never evicts another bridge`, async () => {
    const { state, attempted, evictions } = await startup([code], { evict: true });
    assert.deepEqual(attempted, [9223]);
    assert.equal(evictions, 0);
    assert.equal(state.wsServer, null);
    assert.equal(state.wsStartupError.code, code);
    assert.match(state.wsStartupError.message, new RegExp(code));
    assert.doesNotMatch(state.wsStartupError.message, /All ports/);
  });
}

test('a non-conflict error after a busy port reports the actual failing port', async () => {
  const { state, attempted, evictions } = await startup(['EADDRINUSE', 'EACCES'], { evict: true });
  assert.deepEqual(attempted, [9223, 9224]);
  assert.equal(evictions, 0);
  assert.equal(state.wsStartupError.port, 9224);
  assert.equal(state.wsStartupError.code, 'EACCES');
});

test('a free fallback port starts without a stale error', async () => {
  const { state, attempted, advertised, evictions } = await startup(['EADDRINUSE', null]);
  assert.deepEqual(attempted, [9223, 9224]);
  assert.deepEqual(advertised, [9224]);
  assert.equal(state.wsActualPort, 9224);
  assert.equal(state.wsStartupError, null);
  assert.equal(evictions, 0);
});

test('only a fully occupied range permits one eviction attempt', async () => {
  const { state, attempted, evictions } = await startup(['EADDRINUSE']);
  assert.equal(attempted.length, 10);
  assert.equal(evictions, 1);
  assert.equal(state.wsStartupError.code, 'EADDRINUSE');
  assert.equal(state.wsStartupError.message, 'All ports in range 9223-9232 are in use');
});

test('a different failure after eviction is preserved without further evictions', async () => {
  const { state, attempted, evictions } = await startup([
    ...Array(10).fill('EADDRINUSE'), 'EACCES',
  ], { evict: true });
  assert.equal(attempted.length, 11);
  assert.equal(evictions, 1);
  assert.equal(state.wsStartupError.code, 'EACCES');
});

test('successful retry after eviction clears all startup errors', async () => {
  const { state, advertised, evictions } = await startup([
    ...Array(10).fill('EADDRINUSE'), null,
  ], { evict: true });
  assert.equal(evictions, 1);
  assert.deepEqual(advertised, [9223]);
  assert.equal(state.wsActualPort, 9223);
  assert.equal(state.wsStartupError, null);
});


test('normal and permission-denied startup never run slow process scans before MCP initialization', async () => {
  for (const outcomes of [[null], ['EADDRINUSE', null], ['EACCES']]) {
    assert.equal((await startup(outcomes)).orphanScans, 0);
  }
  assert.equal((await startup(['EADDRINUSE'])).orphanScans, 1);
});

const portSource = fs.readFileSync(new URL('../src/core/port-discovery.ts', import.meta.url), 'utf8');
const portExecutable = ts.transpileModule(portSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

// Execute the real cleanup/recovery module with an in-memory filesystem and PID
// table. Even a regression that attempts SIGTERM cannot signal a real process.
function portHarness(entries, processStates = {}) {
  const files = new Map(entries.map(data => [`/fixture/figma-console-mcp-${data.port}.json`, JSON.stringify(data)]));
  const states = new Map(Object.entries(processStates).map(([pid, state]) => [Number(pid), state]));
  const signals = [], commands = [], intervals = [];
  const exports = {};
  const childProcess = {
    execSync(command) {
      commands.push(command);
      if (command.startsWith('lsof ')) return '100\n';
      if (command.includes('command=')) return 'node /fixture/dist/local.js';
      if (command.includes('etime=')) return '00:10:00';
      if (command === 'sleep 0.5') return '';
      throw new Error(`Unexpected command: ${command}`);
    },
  };
  const modules = {
    fs: {
      existsSync: file => files.has(file),
      readFileSync(file) {
        if (!files.has(file)) throw Object.assign(new Error('missing fixture'), { code: 'ENOENT' });
        return files.get(file);
      },
      writeFileSync: (file, data) => files.set(file, data),
      unlinkSync: file => files.delete(file),
      readdirSync: () => [...files.keys()].map(file => file.split('/').at(-1)),
    },
    path: { join: (...parts) => parts.join('/') },
    os: { tmpdir: () => '/fixture' },
    './logger.js': { createChildLogger: () => ({ info() {}, warn() {}, debug() {} }) },
    child_process: childProcess,
  };
  vm.runInNewContext(portExecutable, {
    exports,
    require(name) {
      assert.ok(name in modules, `unexpected module ${name}`);
      return modules[name];
    },
    process: {
      pid: 999, platform: 'darwin',
      kill(pid, signal) {
        signals.push({ pid, signal });
        const state = states.get(pid) || 'dead';
        if (state !== 'alive') throw Object.assign(new Error(state), { code: state === 'dead' ? 'ESRCH' : state });
        if (signal !== 0) states.set(pid, 'dead');
      },
    },
    Date, SharedArrayBuffer, Int32Array, Atomics: { wait() {} },
    setInterval(fn) { const timer = { fn, unref() {} }; intervals.push(timer); return timer; },
    clearInterval(timer) { timer.canceled = true; },
  });
  return { api: exports, files, signals, commands, intervals };
}

function advertisement(port, pid, { heartbeatAge = 0, startedAge = 600000, legacy = false } = {}) {
  return {
    port, pid, host: 'localhost', startedAt: new Date(Date.now() - startedAge).toISOString(),
    ...(!legacy ? { lastSeen: new Date(Date.now() - heartbeatAge).toISOString() } : {}),
  };
}

test('late heartbeats after sleep and old legacy sessions never authorize termination', () => {
  const h = portHarness([
    advertisement(9223, 100, { heartbeatAge: 600000 }),
    advertisement(9224, 101, { legacy: true, startedAge: 86400000 }),
  ], { 100: 'alive', 101: 'alive' });
  assert.equal(h.api.cleanupStalePortFiles(), 0);
  assert.equal(h.files.size, 2);
  assert.equal(h.api.discoverActiveInstances().length, 2);
  assert.deepEqual(h.signals.filter(({ signal }) => signal !== 0), []);
});

test('cleanup removes confirmed dead metadata and preserves an owner that rejects PID checks', () => {
  const h = portHarness([
    advertisement(9223, 100), advertisement(9224, 101), advertisement(9225, 102),
  ], { 100: 'dead', 101: 'EPERM', 102: 'alive' });
  assert.equal(h.api.cleanupStalePortFiles(), 1);
  assert.equal(h.files.has('/fixture/figma-console-mcp-9223.json'), false);
  assert.equal(h.api.readPortFile(9224).pid, 101);
  assert.equal(h.api.readPortFile(9225).pid, 102);
  assert.deepEqual(h.signals.filter(({ signal }) => signal !== 0), []);
});

test('a missing advertisement does not authorize terminating a live listener', () => {
  const h = portHarness([], { 100: 'alive' });
  assert.equal(h.api.cleanupOrphanedProcesses(), 0);
  assert.equal(h.api.evictOldestInstance(), false);
  assert.deepEqual(h.signals, []);
  assert.deepEqual(h.commands, []);
});

test('periodic cleanup after wake preserves a sleeping sibling and removes exited metadata', () => {
  const h = portHarness([
    advertisement(9223, 100, { heartbeatAge: 600000 }), advertisement(9224, 101),
  ], { 100: 'alive', 101: 'dead' });
  const stop = h.api.startPeriodicReaper();
  h.intervals[0].fn();
  assert.equal(h.files.has('/fixture/figma-console-mcp-9223.json'), true);
  assert.equal(h.files.has('/fixture/figma-console-mcp-9224.json'), false);
  assert.deepEqual(h.signals.filter(({ signal }) => signal !== 0), []);
  assert.deepEqual(h.commands, []);
  stop();
  assert.equal(h.intervals[0].canceled, true);
});

test('an eleventh bridge reports the occupied range and preserves all ten live sessions', async () => {
  const entries = Array.from({ length: 10 }, (_, i) => advertisement(9223 + i, 100 + i));
  const h = portHarness(entries, Object.fromEntries(entries.map(({ pid }) => [pid, 'alive'])));
  const { state, attempted, advertised } = await startup(['EADDRINUSE'], { recovery: h.api });
  assert.equal(attempted.length, 10);
  assert.equal(state.wsServer, null);
  assert.equal(state.wsStartupError.code, 'EADDRINUSE');
  assert.equal(state.wsStartupError.message, 'All ports in range 9223-9232 are in use');
  assert.deepEqual(advertised, []);
  assert.equal(h.files.size, 10);
  assert.deepEqual(h.signals.filter(({ signal }) => signal !== 0), []);
  assert.deepEqual(h.commands, []);
});
