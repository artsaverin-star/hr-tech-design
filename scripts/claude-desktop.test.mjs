import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { configureClaudeDesktop } from './configure-claude-desktop.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesRoot = path.join(project, 'bulochka-v4-26', 'tests');
fs.mkdirSync(fixturesRoot, { recursive: true });

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fixturesRoot, 'claude-desktop-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'designer');
  fs.mkdirSync(home);
  const serverPath = path.join(root, 'bridge.mjs');
  fs.writeFileSync(serverPath, 'export {};\n');
  const userFile = path.join(home, '.claude.json');
  const legacyFile = path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  const options = { home, nodePath: process.execPath, serverPath, configDir: '' };
  function write(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
  }
  function read(file = userFile) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  return { root, home, serverPath, userFile, legacyFile, options, write, read };
}

test('desktop-only configuration creates a user-scope stdio entry with absolute runtime paths', t => {
  const f = fixture(t);
  const result = configureClaudeDesktop(f.options);
  assert.deepEqual(f.read().mcpServers['figma-hrtech'], {
    type: 'stdio', command: process.execPath, args: [f.serverPath], env: {},
  });
  assert.equal(result.legacyOverrideUpdated, false);
  assert.equal(fs.statSync(f.userFile).mode & 0o777, 0o600);
  assert.equal(fs.existsSync(f.legacyFile), false);
});

test('existing unrelated settings, projects and MCP servers are preserved with a private backup', t => {
  const f = fixture(t);
  const original = {
    customSetting: true,
    projects: { '/designer/project': { hasTrustDialogAccepted: false } },
    oauthAccount: { placeholder: 'unchanged' },
    mcpServers: { unrelated: { command: '/bin/example' }, 'figma-hrtech': { command: '/old/node' } },
  };
  f.write(f.userFile, original);
  const originalBytes = fs.readFileSync(f.userFile, 'utf8');
  configureClaudeDesktop(f.options);
  const next = f.read();
  assert.deepEqual(next.projects, original.projects);
  assert.deepEqual(next.oauthAccount, original.oauthAccount);
  assert.deepEqual(next.mcpServers.unrelated, original.mcpServers.unrelated);
  assert.equal(next.customSetting, true);
  const backups = fs.readdirSync(f.home).filter(name => name.startsWith('.claude.json.bulochka-backup-'));
  assert.equal(backups.length, 1);
  const backup = path.join(f.home, backups[0]);
  assert.equal(fs.readFileSync(backup, 'utf8'), originalBytes);
  assert.equal(fs.statSync(backup).mode & 0o777, 0o600);
  assert.equal(fs.readdirSync(f.home).some(name => name.endsWith('.tmp')), false);
});

test('repeating a successful setup is idempotent', t => {
  const f = fixture(t);
  configureClaudeDesktop(f.options);
  const before = fs.readdirSync(f.home);
  const result = configureClaudeDesktop(f.options);
  assert.equal(result.changedFiles, 0);
  assert.deepEqual(fs.readdirSync(f.home), before);
});

test('existing legacy override is updated too, without adding or changing other integrations', t => {
  const f = fixture(t);
  f.write(f.legacyFile, { preferences: { keep: true }, mcpServers: { unrelated: { command: '/other' }, 'figma-hrtech': { command: '/stale' } } });
  const result = configureClaudeDesktop(f.options);
  assert.equal(result.legacyOverrideUpdated, true);
  assert.deepEqual(f.read(f.legacyFile).mcpServers['figma-hrtech'], f.read().mcpServers['figma-hrtech']);
  assert.deepEqual(f.read(f.legacyFile).preferences, { keep: true });
  assert.deepEqual(f.read(f.legacyFile).mcpServers.unrelated, { command: '/other' });
});

test('legacy config without a Bulochka entry is left byte-for-byte unchanged', t => {
  const f = fixture(t);
  f.write(f.legacyFile, { mcpServers: { unrelated: { command: '/other' } } });
  const before = fs.readFileSync(f.legacyFile, 'utf8');
  configureClaudeDesktop(f.options);
  assert.equal(fs.readFileSync(f.legacyFile, 'utf8'), before);
});

test('invalid user JSON is never overwritten and its contents are not exposed', t => {
  const f = fixture(t);
  const invalid = '{"private-test-value": "do-not-print", broken';
  fs.writeFileSync(f.userFile, invalid);
  assert.throws(() => configureClaudeDesktop(f.options), error => {
    assert.match(error.message, /некорректный JSON/);
    assert.doesNotMatch(error.message, /do-not-print/);
    return true;
  });
  assert.equal(fs.readFileSync(f.userFile, 'utf8'), invalid);
});

test('invalid legacy JSON fails before changing the valid user config', t => {
  const f = fixture(t);
  f.write(f.userFile, { keep: 'original' });
  fs.mkdirSync(path.dirname(f.legacyFile), { recursive: true });
  fs.writeFileSync(f.legacyFile, '{broken');
  const before = fs.readFileSync(f.userFile, 'utf8');
  assert.throws(() => configureClaudeDesktop(f.options), /некорректный JSON/);
  assert.equal(fs.readFileSync(f.userFile, 'utf8'), before);
  assert.equal(fs.readdirSync(f.home).some(name => name.includes('backup')), false);
});

test('failure to commit the legacy override restores the user config and keeps private backups', t => {
  const f = fixture(t);
  f.write(f.userFile, { keep: 'user-original' });
  f.write(f.legacyFile, { mcpServers: { 'figma-hrtech': { command: '/legacy-original' } } });
  const userBefore = fs.readFileSync(f.userFile, 'utf8');
  const legacyBefore = fs.readFileSync(f.legacyFile, 'utf8');
  const rename = fs.renameSync;
  fs.renameSync = function(from, to) {
    if (to === f.legacyFile) throw new Error('simulated write failure');
    return rename(from, to);
  };
  try { assert.throws(() => configureClaudeDesktop(f.options), /Не удалось сохранить настройки/); }
  finally { fs.renameSync = rename; }
  assert.equal(fs.readFileSync(f.userFile, 'utf8'), userBefore);
  assert.equal(fs.readFileSync(f.legacyFile, 'utf8'), legacyBefore);
  assert.equal(fs.readdirSync(f.home).some(name => name.endsWith('.tmp')), false);
});

test('optional token is stored only in the private MCP entry', t => {
  const f = fixture(t);
  const tokenPath = path.join(f.home, 'test-token');
  fs.writeFileSync(tokenPath, 'figd_test_credential_only\n');
  configureClaudeDesktop({ ...f.options, tokenPath });
  assert.equal(f.read().mcpServers['figma-hrtech'].env.FIGMA_ACCESS_TOKEN, 'figd_test_credential_only');
  assert.equal(fs.statSync(f.userFile).mode & 0o777, 0o600);
});

test('custom configuration locations are rejected rather than silently writing the wrong account', t => {
  const f = fixture(t);
  assert.throws(() => configureClaudeDesktop({ ...f.options, configDir: path.join(f.home, 'custom') }), /CLAUDE_CONFIG_DIR/);
  assert.equal(fs.existsSync(f.userFile), false);
});

test('symlinked configuration is preserved and reported as unsupported', t => {
  const f = fixture(t);
  const target = path.join(f.root, 'original.json');
  f.write(target, { keep: true });
  fs.symlinkSync(target, f.userFile);
  assert.throws(() => configureClaudeDesktop(f.options), /обычным файлом/);
  assert.equal(fs.lstatSync(f.userFile).isSymbolicLink(), true);
  assert.deepEqual(f.read(target), { keep: true });
});

test('connect-mcp configures desktop-only Claude without executing a CLI or a real user config', t => {
  const f = fixture(t);
  const scripts = path.join(f.root, 'scripts');
  const runtime = path.join(f.root, 'runtime', 'bin');
  fs.mkdirSync(scripts);
  fs.mkdirSync(runtime, { recursive: true });
  fs.copyFileSync(f.serverPath, path.join(runtime, 'bridge.mjs'));
  for (const file of ['connect-mcp.sh', 'configure-claude-desktop.mjs']) {
    fs.copyFileSync(path.join(project, 'scripts', file), path.join(scripts, file));
  }
  // Stub discovery, so this test cannot find or launch real applications.
  fs.writeFileSync(path.join(scripts, 'agent-paths.sh'), [
    'NODE_BIN="$BULOCHKA_TEST_NODE"',
    'CODEX_BIN=""',
    'CLAUDE_BIN=""',
    'CLAUDE_DESKTOP_APP="/test/Claude.app"',
    'bulochka_node_supported() { return 0; }',
  ].join('\n'));
  const result = spawnSync('/bin/bash', [path.join(scripts, 'connect-mcp.sh')], {
    cwd: f.root,
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin', HOME: f.home, BULOCHKA_TEST_NODE: process.execPath },
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /Claude Code/);
  assert.equal(f.read().mcpServers['figma-hrtech'].args[0], path.join(runtime, 'bridge.mjs'));
});
