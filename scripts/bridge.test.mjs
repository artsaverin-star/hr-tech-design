// Регрессия того, что осталось продуктом после сноса конвейера очереди (4.13):
// мост Figma↔помощник, замок файла, проверка подключения и установка/линковка знаний.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import ts from 'typescript';

const versionMeta = JSON.parse(fs.readFileSync(new URL('../bulochka.version.json', import.meta.url), 'utf8'));
const setupSource = fs.readFileSync(new URL('../setup.sh', import.meta.url), 'utf8');
const installSource = fs.readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const repairSource = fs.readFileSync(new URL('./repair.sh', import.meta.url), 'utf8');
const connectMcpSource = fs.readFileSync(new URL('./connect-mcp.sh', import.meta.url), 'utf8');
const agentPathsSource = fs.readFileSync(new URL('./agent-paths.sh', import.meta.url), 'utf8');
const linkKnowledgeSource = fs.readFileSync(new URL('./link-knowledge.sh', import.meta.url), 'utf8');
const writeToolsSource = fs.readFileSync(new URL('../src/core/write-tools.ts', import.meta.url), 'utf8');
const websocketConnectorSource = fs.readFileSync(new URL('../src/core/websocket-connector.ts', import.meta.url), 'utf8');
const websocketServerSource = fs.readFileSync(new URL('../src/core/websocket-server.ts', import.meta.url), 'utf8');
const localServerSource = fs.readFileSync(new URL('../src/local.ts', import.meta.url), 'utf8');
const hrtechCommandSource = fs.readFileSync(new URL('../claude/commands/hrtech.md', import.meta.url), 'utf8');

test('bridge and personal agent protocol propagate immutable fileKey', () => {
    assert.match(writeToolsSource, /fileKey:\s*z[\s\S]*?Exact connected Figma fileKey/);
    assert.match(writeToolsSource, /executeCodeViaUI\([\s\S]*?Math\.min\(timeout, 300000\),[\s\S]*?fileKey/);
    assert.match(websocketConnectorSource, /executeCodeViaUI\(code: string, timeoutMs = 5000, fileKey\?: string\)/);
    assert.match(websocketConnectorSource, /sendCommand\([\s\S]*?'EXECUTE_CODE'[\s\S]*?fileKey/);
    assert.doesNotMatch(websocketConnectorSource, /\/tmp\/hrtech-exec\.log/);
    assert.match(localServerSource, /if \(fileKey && wasPinned !== fileKey\)/);
    assert.match(localServerSource, /process\.stdin\.on\("end"/);
    assert.match(localServerSource, /figmaTokenUpdated/);
    assert.match(hrtechCommandSource, /figma_pin_file\(\{fileKey\}\)/);
    assert.doesNotMatch(hrtechCommandSource, /figma_pin_file\(\{\}\)/);
    assert.match(hrtechCommandSource, /Call `figma_list_open_files`\. If exactly one file is connected/);
    assert.match(hrtechCommandSource, /If several[\s\S]*?ask which one;[\s\S]*?never guess/);
    assert.match(hrtechCommandSource, /figma_unpin_file\(\{fileKey: boundFileKey\}\)/);
    assert.match(hrtechCommandSource, /Pass `boundFileKey` to every `figma_execute`/);
    assert.match(hrtechCommandSource, /pin belongs only to this MCP process/);
});

test('a pinned MCP session cannot drift when another product connects or is navigated', () => {
    assert.match(
        websocketServerSource,
        /if \(!this\._pinnedFileKey \|\| this\._pinnedFileKey === fileKey\) \{\s*this\._activeFileKey = fileKey;/,
    );
    assert.match(
        websocketServerSource,
        /setActiveFile\(fileKey: string\): boolean \{\s*if \(this\._pinnedFileKey && this\._pinnedFileKey !== fileKey\)/,
    );
    assert.match(localServerSource, /status: "file_locked"/);
    assert.match(websocketServerSource, /pinFile\(found\.fileKey, 'ui'\)/);
    assert.match(websocketServerSource, /unpinFile\('ui'\)/);
    assert.match(
        websocketServerSource,
        /source === 'ui' && this\._pinSource === 'tool'[\s\S]*?this\._pinnedFileKey === fileKey\)[\s\S]*?return true;[\s\S]*?return false;/,
    );
    assert.match(
        websocketServerSource,
        /unpinFile\(source: 'tool' \| 'ui' = 'tool'\): boolean \{\s*if \(source === 'ui' && this\._pinSource === 'tool'\)/,
    );
    assert.match(
        websocketServerSource,
        /const preserveToolPin = this\._pinnedFileKey === fileKey && this\._pinSource === 'tool';[\s\S]*?this\._activeFileKey === fileKey && !preserveToolPin/,
    );
    assert.match(
        websocketServerSource,
        /const fileKey = targetFileKey \|\| this\._pinnedFileKey \|\| this\._activeFileKey;[\s\S]*?if \(!client \|\| client\.ws\.readyState !== WebSocket\.OPEN\) \{\s*reject/,
    );
});

test('setup wires the bridge and knowledge for every supported agent (Codex, Claude, Antigravity, Cursor)', () => {
    assert.match(setupSource, /scripts\/connect-mcp\.sh/);
    assert.match(connectMcpSource, /"\$CODEX_BIN" mcp add figma-hrtech/);
    assert.match(connectMcpSource, /configure-claude-desktop\.mjs" --client cli/);
    assert.match(connectMcpSource, /configure-claude-desktop\.mjs" --client antigravity/);
    assert.match(connectMcpSource, /configure-claude-desktop\.mjs" --client cursor/);
    assert.match(connectMcpSource, /configure-claude-desktop\.mjs" --client codex-toml/);
    assert.doesNotMatch(connectMcpSource, /"\$CLAUDE_BIN" mcp remove/);
    assert.doesNotMatch(connectMcpSource, /"\$CODEX_BIN" mcp remove/);
    assert.doesNotMatch(connectMcpSource, /^set -u/m);
    assert.match(agentPathsSource, /\$HOME\/\.local\/bin\/codex/);
    assert.match(agentPathsSource, /Codex\.app\/Contents\/Resources\/codex/);
    assert.match(agentPathsSource, /ChatGPT\.app\/Contents\/Resources\/codex-cli\/CodexCLI\.app\/Contents\/MacOS\/codex/);
    assert.match(agentPathsSource, /Antigravity\.app/);
    assert.match(agentPathsSource, /Cursor\.app/);
    assert.match(setupSource, /ANTIGRAVITY_DETECTED/);
    assert.match(setupSource, /CURSOR_DETECTED/);
    assert.match(setupSource, /scripts\/link-knowledge\.sh/);
    assert.doesNotMatch(installSource, /brew install|npm install -g|xcode-select --install/);
    assert.match(installSource, /bootstrap-package\.mjs/);
    for (const source of [setupSource, connectMcpSource]) {
        assert.match(source, /scripts\/agent-paths\.sh/);
    }
    assert.match(linkKnowledgeSource, /CODEX_SKILLS_ROOT="\$HOME\/\.agents\/skills"/);
    assert.match(linkKnowledgeSource, /CLAUDE_CONFIG_ROOT="\$\{CLAUDE_CONFIG_DIR:-\$HOME\/\.claude\}"/);
    assert.match(linkKnowledgeSource, /CLAUDE_SKILLS_ROOT="\$CLAUDE_CONFIG_ROOT\/skills"/);
    assert.match(linkKnowledgeSource, /ANTIGRAVITY_SKILLS_ROOT="\$HOME\/\.gemini\/config\/skills"/);
    assert.match(linkKnowledgeSource, /CURSOR_SKILLS_ROOT="\$HOME\/\.cursor\/skills"/);
    assert.match(linkKnowledgeSource, /CLAUDE_COMMANDS_ROOT\/hrtech\.md"/);
});

test('both install paths fully evict the retired background runner and repair holds its own lock', () => {
    for (const [name, source] of [['setup.sh', setupSource], ['repair.sh', repairSource]]) {
        assert.match(source, /LEGACY_LABEL="design\.hrtech\.bulochka\.runner"/, `${name} must target the legacy label`);
        assert.match(source, /launchctl bootout "gui\/\$\(id -u\)\/\$LEGACY_LABEL"/, name);
        assert.match(source, /rm -f "\$LEGACY_PLIST"/, name);
        assert.match(source, /pkill -f hrtech-watch\.sh/, name);
        assert.match(source, /pkill -f hrtech-driver\.mjs/, name);
    }
    assert.match(repairSource, /REPAIR_LOCK="\$DIR\/\.bulochka-repair\.lock"/);
    assert.match(repairSource, /scripts\/link-knowledge\.sh/);
    assert.match(repairSource, /scripts\/connect-mcp\.sh/);
});

test('the shared protocol no longer carries the queue playbook', () => {
    for (const dead of [
        /HRTECH_AUTORUN/,
        /hrtechQueueState/,
        /hrtechConfirmClaim/,
        /hrtechCompleteTask/,
        /hrtechFailTask/,
        /hrtechCancelActiveTask/,
        /task_queue/,
        /LEGACY AUTORUN/,
    ]) {
        assert.doesNotMatch(hrtechCommandSource, dead, `hrtech.md still mentions ${dead}`);
    }
    for (const kept of [
        /## KNOWN HRDS COMPONENTS/,
        /\*\*Mobile shell/,
        /0a2\. \*\*Version check/,
        /0a2c\. \*\*COMPONENT ATOMS ONLY/,
        /0a3\. \*\*NO FABRICATION/,
        /0b2\. \*\*Bounded scripts/,
        /0d\. \*\*Layout-sizing gotchas/,
        /hrtechScan\(nodeId, \{maxTexts\}\)/,
        /hrtechDiff\('<srcId>','<dstId>'\)/,
        /PATTERN BLUEPRINTS/,
        /timeout: 280000/,
        /documentAccess: dynamic-page/,
        /loadFontAsync/,
    ]) {
        assert.match(hrtechCommandSource, kept, `hrtech.md lost ${kept}`);
    }
});

// Execute the shipped TypeScript implementation with a controlled filesystem,
// sockets and timers. The check must never launch a device process or write data.
const skillHelpers = ts.transpileModule(
    websocketServerSource.slice(websocketServerSource.indexOf('let _skillsCache:'), websocketServerSource.indexOf("import { createChildLogger }")),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const bridgeClass = ts.transpileModule(
    websocketServerSource.slice(websocketServerSource.indexOf('export class FigmaWebSocketServer')).replace('export class', 'class'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const searchSkill = '---\nname: hrtech-figma-search\n---\n# Find a Figma design\nUse the local catalog.\n';
const codexSkill = '/designer/.agents/skills/hrtech-figma-search/SKILL.md';
const claudeSkill = '/designer/.claude/skills/hrtech-figma-search/SKILL.md';
const antigravitySkill = '/designer/.gemini/config/skills/hrtech-figma-search/SKILL.md';
const cursorSkill = '/designer/.cursor/skills/hrtech-figma-search/SKILL.md';

function connectionCheckHarness({ files = {}, env = {}, allowWrites = false, v6Error = null } = {}) {
    const reads = [], timers = [], writes = [], unlinks = [], listens = [];
    let websocketServer;
    class FakeWSS extends EventEmitter {
        constructor() { super(); this.clients = new Set(); websocketServer = this; }
        address() { return { port: 9223 }; }
        close(cb) { if (cb) cb(); }
    }
    const forbidden = () => assert.fail('Read-only connection check attempted a device command or filesystem write');
    const context = vm.createContext({
        EventEmitter, WSServer: FakeWSS, WebSocket: { OPEN: 1, CONNECTING: 0 },
        createHttpServer() {
            const http = new EventEmitter();
            http.address = () => ({ port: 9223 });
            http.close = (cb) => { if (cb) cb(); };
            http.listen = (port, host, done) => {
                listens.push({ port, host });
                if (host === '::1' && v6Error) {
                    queueMicrotask(() => http.emit('error', Object.assign(new Error(v6Error), { code: v6Error })));
                    return;
                }
                done();
            };
            return http;
        },
        logger: { info() {}, warn() {}, debug() {}, error() {} },
        process: { env, pid: 123, platform: 'darwin' },
        homedir: () => '/designer', join: path.join, delimiter: path.delimiter,
        readFileSync(file) { reads.push(file); if (!(file in files)) throw new Error('unreadable'); return files[file]; },
        readdirSync(root) { return [...new Set(Object.keys(files).filter(file => file.startsWith(root + '/')).map(file => file.slice(root.length + 1).split('/')[0]))]; },
        accessSync() { throw new Error('not executable'); }, fsConstants: { X_OK: 1 },
        mkdirSync: allowWrites ? () => {} : forbidden,
        writeFileSync: allowWrites ? (file, content) => { files[file] = content; writes.push({ file, content }); } : forbidden,
        unlinkSync: allowWrites ? (file) => { delete files[file]; unlinks.push(file); } : forbidden,
        spawn: forbidden,
        SERVER_VERSION: 'fixture', HRTECH_VERSION: websocketServerSource.match(/const HRTECH_VERSION = '([^']+)'/)[1],
        getHrtechDistribution: () => 'terminal',
        setTimeout(fn, delay) { const timer = { fn, delay, canceled: false }; timers.push(timer); return timer; },
        clearTimeout(timer) { if (timer) timer.canceled = true; }, setInterval() { return {}; }, clearInterval() {},
    });
    vm.runInContext(skillHelpers + '\n' + bridgeClass, context);
    const server = vm.runInContext('new FigmaWebSocketServer({port: 9223})', context);
    function socket() {
        const ws = new EventEmitter();
        ws.readyState = 1; ws.sent = [];
        ws.send = message => ws.sent.push(JSON.parse(message));
        ws.close = () => { ws.readyState = 3; };
        return ws;
    }
    function register(key, ws = socket()) {
        server.handleMessage({ type: 'FILE_INFO', data: { fileKey: key, fileName: 'Fixture file' } }, ws);
        ws.sent.length = 0;
        return ws;
    }
    return { server, socket, register, files, reads, writes, unlinks, listens, timers, context,
        wire: () => websocketServer,
        available: name => context.isFigmaSearchSkillAvailable(name === null ? null : { name, version: 'fixture' }),
        request(ws, requestId, extra = {}) { server.handleMessage({ type: 'HRTECH_CHECK_CONNECTION', requestId, ...extra }, ws); },
        response(ws, rpc, fileKey, extra = {}) { server.handleMessage({ id: rpc.id, result: { success: true, fileInfo: { fileKey }, ...extra } }, ws); },
    };
}
const checkResults = ws => ws.sent.filter(message => message.type === 'HRTECH_CONNECTION_CHECK_RESULT').map(message => message.data);
async function settleCheck() { for (let i = 0; i < 4; i++) await Promise.resolve(); }

test('HELLO advertises the read-only connection check and version from bulochka.version.json', async () => {
    const h = connectionCheckHarness();
    await h.server.start();
    const socket = h.socket();
    h.wire().clients.add(socket);
    h.wire().emit('connection', socket);
    const hello = socket.sent.find(message => message.type === 'SERVER_HELLO').data;
    assert.equal(hello.hrtechVersion, versionMeta.bridgeVersion);
    assert.equal(hello.repairCheck, true);
    assert.equal(hello.fileRegistrationAck, true);
    assert.equal(hello.bridgeProtocol, 1);
    assert.equal(hello.mcpClient, null);
    assert.deepEqual(h.listens, [{ port: 9223, host: '127.0.0.1' }, { port: 9223, host: '::1' }]);
});

test('localhost binds dual-stack loopback, rejects IPv6 EADDRINUSE, and degrades cleanly when IPv6 is unavailable', async () => {
    const conflict = connectionCheckHarness({ v6Error: 'EADDRINUSE' });
    await assert.rejects(() => conflict.server.start(), /EADDRINUSE/);

    const ipv4Only = connectionCheckHarness({ v6Error: 'EADDRNOTAVAIL' });
    await ipv4Only.server.start();
    assert.deepEqual(ipv4Only.listens, [{ port: 9223, host: '127.0.0.1' }, { port: 9223, host: '::1' }]);
    assert.equal(ipv4Only.server.address().port, 9223);
});

test('FILE_INFO emits FILE_REGISTERED and current PIN_STATE immediately', () => {
    const h = connectionCheckHarness();
    const ws = h.socket();
    h.server.handleMessage({ type: 'FILE_INFO', data: { fileKey: 'F1', fileName: 'Screen' } }, ws);
    assert.ok(ws.sent.some(m => m.type === 'FILE_REGISTERED' && m.data.fileKey === 'F1'));
    assert.ok(ws.sent.some(m => m.type === 'PIN_STATE' && m.data.fileKey === 'F1' && m.data.pinned === false));
});

test('SET_FIGMA_TOKEN saves, clears and emits figmaTokenUpdated for live hot-reload', () => {
    const env = {};
    const h = connectionCheckHarness({ env, allowWrites: true });
    const events = [];
    h.server.on('figmaTokenUpdated', payload => events.push(payload));
    const ws = h.register('A');
    const token = 'figd_1234567890abcdefghij';
    h.server.handleMessage({ type: 'SET_FIGMA_TOKEN', token }, ws);
    assert.equal(env.FIGMA_ACCESS_TOKEN, token);
    assert.deepEqual(JSON.parse(JSON.stringify(events)), [{ hasToken: true }]);
    assert.deepEqual(JSON.parse(JSON.stringify(ws.sent.at(-1))), { type: 'FIGMA_TOKEN_ACK', data: { ok: true, saved: true } });
    h.server.handleMessage({ type: 'SET_FIGMA_TOKEN', clear: true }, ws);
    assert.equal(env.FIGMA_ACCESS_TOKEN, undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(events)), [{ hasToken: true }, { hasToken: false }]);
    assert.deepEqual(JSON.parse(JSON.stringify(ws.sent.at(-1))), { type: 'FIGMA_TOKEN_ACK', data: { ok: true, cleared: true } });
});

test('connection check probes only its registered caller and preserves active file and session pin', async () => {
    const h = connectionCheckHarness({ files: { [codexSkill]: searchSkill } });
    const a = h.register('A'), b = h.register('B');
    h.server.setMcpClient({ name: 'codex-mcp-client', version: '1' });
    h.server.pinFile('B');
    h.request(a, 'caller-a', { fileKey: 'B', method: 'DELETE_NODE', code: 'forbidden input' });
    const rpc = a.sent.find(message => message.method);
    assert.equal(rpc.method, 'GET_FILE_INFO');
    assert.deepEqual(rpc.params, {});
    assert.equal(b.sent.length, 0);
    assert.equal(h.server._activeFileKey, 'B');
    assert.equal(h.server._pinnedFileKey, 'B');
    h.response(a, rpc, 'A', { text: 'private content must not escape', path: '/private/fixture' });
    await settleCheck();
    assert.deepEqual(checkResults(a), [{ requestId: 'caller-a', fileKey: 'A', fileOk: true,
        client: { name: 'codex-mcp-client', version: '1' }, skillAvailable: true }]);
    assert.equal(b.sent.length, 0);
    assert.equal(h.server._activeFileKey, 'B');
    assert.equal(h.server._pinnedFileKey, 'B');
});

test('unregistered, closed and malformed check requests never start an RPC', async () => {
    const h = connectionCheckHarness();
    const pending = h.socket();
    h.request(pending, 'pending');
    assert.equal(pending.sent.length, 0);
    const live = h.register('A');
    for (const requestId of [undefined, null, 0, {}, '', 'x'.repeat(129)]) h.request(live, requestId);
    assert.equal(live.sent.length, 0);
    live.readyState = 3;
    h.request(live, 'closed');
    await settleCheck();
    assert.equal(live.sent.length, 0);
    assert.equal(h.server.pendingRequests.size, 0);
});

test('file check validates file identity and reports worker failures without leaking errors or creating client identity', async () => {
    for (const scenario of ['mismatch', 'worker-failed', 'missing-file', 'error', 'timeout', 'success']) {
        const h = connectionCheckHarness({ files: { [codexSkill]: searchSkill, [claudeSkill]: searchSkill } });
        const ws = h.register('A');
        h.request(ws, scenario);
        const rpc = ws.sent.find(message => message.method);
        if (scenario === 'timeout') h.timers.find(timer => timer.delay === 3000 && !timer.canceled).fn();
        else if (scenario === 'error') h.server.handleMessage({ id: rpc.id, error: '/private/path: worker error' }, ws);
        else if (scenario === 'missing-file') h.server.handleMessage({ id: rpc.id, result: { success: true } }, ws);
        else h.response(ws, rpc, scenario === 'mismatch' ? 'B' : 'A', { success: scenario !== 'worker-failed' });
        await settleCheck();
        assert.deepEqual(checkResults(ws), [{ requestId: scenario, fileKey: 'A', fileOk: scenario === 'success', client: null, skillAvailable: false }]);
        assert.equal(h.server.mcpClient, null);
    }
});

test('concurrent file checks correlate out-of-order results and reject responses from another socket', async () => {
    const h = connectionCheckHarness();
    const a = h.register('A'), b = h.register('B');
    h.request(a, 'first'); h.request(a, 'second'); h.request(b, 'third');
    const [first, second] = a.sent.filter(message => message.method);
    const third = b.sent.find(message => message.method);
    h.response(b, first, 'A');
    await settleCheck();
    assert.equal(checkResults(a).length, 0, 'another socket cannot complete this RPC');
    assert.equal(h.server.pendingRequests.size, 3);
    h.response(a, second, 'A'); h.response(b, third, 'B'); h.response(a, first, 'A');
    await settleCheck();
    assert.deepEqual(checkResults(a).map(result => result.requestId), ['second', 'first']);
    assert.deepEqual(checkResults(b).map(result => result.requestId), ['third']);
    assert.ok([...checkResults(a), ...checkResults(b)].every(result => result.fileOk));
    assert.equal(h.server.pendingRequests.size, 0);
});

test('replacement, re-registration and disconnect cannot deliver stale check results to a different caller', async () => {
    for (const scenario of ['replacement', 'different-file', 'disconnect']) {
        const h = connectionCheckHarness();
        const old = h.register('A');
        h.request(old, 'old-request');
        const rpc = old.sent.find(message => message.method);
        let replacement;
        if (scenario === 'replacement') replacement = h.register('A');
        if (scenario === 'different-file') h.register('B', old);
        if (scenario === 'disconnect') old.readyState = 3;
        if (scenario === 'disconnect') h.timers.find(timer => timer.delay === 3000 && !timer.canceled).fn();
        else h.response(old, rpc, 'A');
        await settleCheck();
        assert.deepEqual(checkResults(old), [], scenario);
        if (replacement) assert.deepEqual(checkResults(replacement), [], 'no old result is sent to the new socket');
    }
});

test('skill availability is fresh and scoped to Codex, Claude Code, Antigravity and Cursor paths', () => {
    const h = connectionCheckHarness({ files: { [codexSkill]: searchSkill } });
    for (const name of ['Codex', 'codex-mcp-client', 'codex_cli_rs', 'Codex CLI', 'Codex Desktop']) assert.equal(h.available(name), true, name);
    for (const name of ['Claude Code', 'claude-code', 'ClaudeCode']) assert.equal(h.available(name), false, name + ' cannot borrow Codex skills');
    h.files[claudeSkill] = searchSkill;
    for (const name of ['Claude Code', 'claude-code', 'ClaudeCode']) assert.equal(h.available(name), true, name);
    for (const name of [null, 'Claude', 'claude-ai', 'Claude Desktop', 'Unknown', 'Codex Claude Code', 'not-codex']) assert.equal(h.available(name), false, String(name));
    delete h.files[codexSkill];
    assert.equal(h.available('codex-mcp-client'), false, 'availability is not cached from a previous check');
    assert.equal(h.available('claude-code'), true);
    assert.equal(h.available('antigravity'), false);
    assert.equal(h.available('cursor'), false);
    h.files[antigravitySkill] = searchSkill;
    for (const name of ['antigravity', 'Antigravity', 'agy', 'antigravity-client']) assert.equal(h.available(name), true, name);
    assert.equal(h.available('cursor'), false, 'Cursor cannot borrow Antigravity skills');
    h.files[cursorSkill] = searchSkill;
    for (const name of ['cursor', 'Cursor', 'cursor-vscode']) assert.equal(h.available(name), true, name);
});

test('custom assistant roots and real readable skill frontmatter are respected', () => {
    const customCodex = '/custom/codex/skills/hrtech-figma-search/SKILL.md';
    const customClaude = '/custom/claude/skills/hrtech-figma-search/SKILL.md';
    const h = connectionCheckHarness({ env: { CODEX_HOME: '/custom/codex', CLAUDE_CONFIG_DIR: '/custom/claude' },
        files: { [customCodex]: searchSkill, [claudeSkill]: searchSkill } });
    assert.equal(h.available('codex-mcp-client'), true);
    assert.equal(h.available('claude-code'), false, 'custom Claude profile must not borrow the standard profile');
    h.files[customClaude] = searchSkill;
    assert.equal(h.available('claude-code'), true);
    for (const invalid of ['', '# Wrong file', '---\nname: another-skill\n---\nInstructions', '---\nname: hrtech-figma-search\n---\n']) {
        h.files[customClaude] = invalid;
        assert.equal(h.available('claude-code'), false);
    }
    delete h.files[customClaude];
    assert.equal(h.available('claude-code'), false);
});

test('check reports current handshake identity after a concurrent MCP change, without inventing skill support', async () => {
    const h = connectionCheckHarness({ files: { [codexSkill]: searchSkill } });
    const ws = h.register('A');
    h.server.setMcpClient({ name: 'codex-mcp-client', version: '1' });
    h.request(ws, 'identity-change');
    const rpc = ws.sent.find(message => message.method);
    h.server.setMcpClient({ name: 'claude-ai', version: '2' });
    h.response(ws, rpc, 'A');
    await settleCheck();
    assert.deepEqual(checkResults(ws)[0], { requestId: 'identity-change', fileKey: 'A', fileOk: true,
        client: { name: 'claude-ai', version: '2' }, skillAvailable: false });
});
