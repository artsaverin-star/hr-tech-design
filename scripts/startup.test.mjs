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
async function startup(outcomes, { evict = false } = {}) {
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
    cleanupStalePortFiles() {}, cleanupOrphanedProcesses() { orphanScans++; return 0; },
    evictOldestInstance() { evictions++; return evict; },
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
