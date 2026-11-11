import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = path.join(root, 'bulochka-v4-26', 'setup-tests');
fs.mkdirSync(scratch, { recursive: true });

function write(file, source, executable = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Never follow a test symlink when replacing its fake executable.
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) fs.unlinkSync(file);
  fs.writeFileSync(file, source);
  if (executable) fs.chmodSync(file, 0o755);
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(scratch, 'case-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repo = path.join(dir, 'project with spaces');
  const userDir = path.join(dir, 'user');
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(userDir, { recursive: true });
  for (const script of ['agent-paths.sh', 'connect-mcp.sh', 'link-knowledge.sh', 'repair.sh']) {
    let source = fs.readFileSync(path.join(root, 'scripts', script), 'utf8');
    // These are CLI-only fixtures; never discover the host's real Claude.app.
    if (script === 'agent-paths.sh') source += '\nCLAUDE_DESKTOP_APP=""\n';
    write(path.join(repo, 'scripts', script), source);
  }
  write(path.join(repo, 'setup.sh'), fs.readFileSync(path.join(root, 'setup.sh')));
  write(path.join(repo, 'scripts/install-next-steps.sh'), '#!/bin/bash\necho "✓ Булочка настроена на компьютере"\necho NEXT_STEPS\n');
  write(path.join(repo, 'runtime/bin/bridge.mjs'), '// fixture');
  const env = {
    PATH: `${bin}:/usr/bin:/bin`, HOME: userDir, CODEX_HOME: path.join(userDir, '.codex'),
    BULOCHKA_TEST_CALLS: path.join(dir, 'calls'), BULOCHKA_TEST_STATE: path.join(dir, 'codex-state'),
    BULOCHKA_REPAIR_LOG: path.join(dir, 'repair.log'),
  };
  fs.mkdirSync(bin, { recursive: true });
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  write(path.join(bin, 'pgrep'), '#!/bin/bash\nexit 1\n', true);
  for (const agent of ['codex', 'claude']) {
    write(path.join(bin, agent), `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
const agent = '${agent}';
fs.appendFileSync(process.env.BULOCHKA_TEST_CALLS, agent + ':' + args.join(' ') + '\\n');
if (args[0] === 'mcp' && args[1] === 'remove') {
  if (agent === 'codex') fs.rmSync(process.env.BULOCHKA_TEST_STATE, { force: true });
  process.exit(0);
}
if (args[0] === 'mcp' && args[1] === 'add') {
  if (process.env['BULOCHKA_TEST_FAIL_' + agent] === '1') {
    console.error('cannot write configuration: ' + args.join(' '));
    process.exit(1);
  }
  if (agent === 'codex') {
    const split = args.indexOf('--');
    const saved = { name: 'figma-hrtech', enabled: true, transport: {
      type: 'stdio', command: args[split + 1], args: args.slice(split + 2),
    } };
    fs.writeFileSync(process.env.BULOCHKA_TEST_STATE, JSON.stringify(saved));
  }
  process.exit(0);
}
if (agent === 'codex' && args[0] === 'mcp' && args[1] === 'get') {
  const mode = process.env.BULOCHKA_TEST_GET;
  if (mode === 'fail') { console.error('configuration unavailable'); process.exit(1); }
  if (mode === 'malformed') { console.log('not json'); process.exit(0); }
  const saved = JSON.parse(fs.readFileSync(process.env.BULOCHKA_TEST_STATE, 'utf8'));
  if (mode === 'wrong-command') saved.transport.command = '/wrong/node';
  if (mode === 'wrong-args') saved.transport.args = ['/previous-clone/bridge.mjs'];
  if (mode === 'disabled') saved.enabled = false;
  console.log(JSON.stringify(saved));
  process.exit(0);
}
process.exit(1);
`, true);
  }
  return { dir, repo, userDir, bin, env };
}

function run(f, script, extra = {}) {
  return spawnSync('/bin/bash', [path.join(f.repo, 'scripts', script)], {
    cwd: f.repo, env: { ...f.env, ...extra }, encoding: 'utf8', timeout: 10000,
  });
}

test('MCP registration preserves paths with spaces and updates Codex without removing it', t => {
  const f = fixture(t);
  write(f.env.BULOCHKA_TEST_STATE, 'previous config');
  const result = run(f, 'connect-mcp.sh');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const calls = fs.readFileSync(f.env.BULOCHKA_TEST_CALLS, 'utf8');
  assert.match(calls, /codex:mcp add figma-hrtech/);
  assert.match(calls, /codex:mcp get figma-hrtech --json/);
  assert.doesNotMatch(calls, /codex:mcp remove/);
  assert.match(calls, /claude:mcp add figma-hrtech -s user/);
  assert.doesNotMatch(calls, /claude:mcp get/);
  assert.ok(calls.includes(path.join(f.repo, 'runtime/bin/bridge.mjs')));
});

test('a Codex registration failure is reported even when Claude succeeds; token stays hidden', t => {
  const f = fixture(t);
  const token = 'figd_fixture-secret';
  write(path.join(f.userDir, '.hrtech/figma-token'), token);
  const result = run(f, 'connect-mcp.sh', { BULOCHKA_TEST_FAIL_codex: '1' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /cannot write configuration/);
  assert.match(result.stdout, /токен скрыт/);
  assert.ok(!result.stdout.includes(token));
  assert.doesNotMatch(result.stdout, /нужен вход в аккаунт/);
});

test('failed Codex upsert leaves its previous configuration intact', t => {
  const f = fixture(t);
  // Do not let the unrelated Claude stub touch this Codex-only fixture state.
  write(path.join(f.bin, 'claude'), '#!/bin/bash\nexit 0\n', true);
  write(f.env.BULOCHKA_TEST_STATE, 'previous config');
  const result = run(f, 'connect-mcp.sh', { BULOCHKA_TEST_FAIL_codex: '1' });
  assert.equal(result.status, 1);
  assert.equal(fs.readFileSync(f.env.BULOCHKA_TEST_STATE, 'utf8'), 'previous config');
});

for (const mode of ['fail', 'malformed', 'wrong-command', 'wrong-args', 'disabled']) {
  test(`Codex registration fails if saved configuration is ${mode}`, t => {
    const f = fixture(t);
    const result = run(f, 'connect-mcp.sh', { BULOCHKA_TEST_GET: mode });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(fs.readFileSync(f.env.BULOCHKA_TEST_CALLS, 'utf8'), /codex:mcp get figma-hrtech --json/);
    assert.doesNotMatch(result.stdout, /Настройка сохранена: Codex/);
  });
}

test('executable discovery supports a bundled CLI outside PATH, including spaces', t => {
  const f = fixture(t);
  const bundled = path.join(f.userDir, 'Applications/Codex.app/Contents/Resources/codex');
  write(bundled, '#!/bin/bash\nexit 0\n', true);
  const helper = path.join(f.repo, 'scripts/agent-paths.sh');
  const result = spawnSync('/bin/bash', ['-c', '. "$1"; bulochka_find_executable nonexistent-bulochka-cli "$2"', 'test', helper, bundled], {
    env: f.env, encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), bundled);
  assert.match(fs.readFileSync(helper, 'utf8'), /\/Applications\/Codex\.app\/Contents\/Resources\/codex/);
});

function addKnowledge(f) {
  write(path.join(f.repo, 'claude/skills/hrtech/SKILL.md'), '---\nname: hrtech\n---\nFixture');
  for (const file of ['hrtech.md', 'hrtech-digest.md', 'hrds-knowledge.md']) {
    write(path.join(f.repo, 'claude/commands', file), 'Fixture');
  }
  write(path.join(f.repo, 'claude/knowledge/team-notes.md'), 'Fixture');
}

test('completion guide uses the Yandex catalog and does not open a manifest or another app', t => {
  const f = fixture(t);
  write(path.join(f.repo, 'scripts/install-next-steps.sh'), fs.readFileSync(path.join(root, 'scripts/install-next-steps.sh')));
  write(path.join(f.bin, 'open'), '#!/bin/bash\ntouch "$HOME/unexpected-open"\n', true);
  const result = run(f, 'install-next-steps.sh');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Plugins → From Yandex → Bulochka/);
  assert.match(result.stdout, /Назови файл и выделенный экран, ничего не меняй/);
  assert.ok(result.stdout.indexOf('Полностью закройте') < result.stdout.indexOf('From Yandex'));
  assert.doesNotMatch(result.stdout, /Import plugin|manifest\.json|Community|Терминал/);
  assert.ok(!fs.existsSync(path.join(f.userDir, 'unexpected-open')));
  assert.ok(!fs.existsSync(f.env.BULOCHKA_TEST_CALLS));
});

test('completion guide routes Claude desktop to its Code tab', t => {
  const f = fixture(t);
  write(path.join(f.repo, 'scripts/install-next-steps.sh'), fs.readFileSync(path.join(root, 'scripts/install-next-steps.sh')));
  fs.appendFileSync(path.join(f.repo, 'scripts/agent-paths.sh'), '\nCODEX_BIN=""\nCLAUDE_BIN=""\nCLAUDE_DESKTOP_APP="/fixture/Claude.app"\n');
  const result = run(f, 'install-next-steps.sh');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /В приложении Claude выберите вкладку Code/);
  assert.match(result.stdout, /From Yandex/);
  assert.doesNotMatch(result.stdout, /закройте Codex/);
});

test('setup completes unattended with three steps, no token prompt and one next-steps guide', t => {
  const f = fixture(t);
  addKnowledge(f);
  const result = run(f, '../setup.sh');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /\[1\/3\] Проверяем компьютер/);
  assert.match(result.stdout, /\[2\/3\] Настраиваем помощника/);
  assert.match(result.stdout, /\[3\/3\] Добавляем умения HR Tech/);
  assert.match(result.stdout, /Булочка настроена на компьютере/);
  assert.match(result.stdout, /Figma-токен можно добавить позже/);
  assert.equal(result.stdout.match(/NEXT_STEPS/g)?.length, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /Вставь токен|Открыть страницу создания|\/dev\/tty|Figma подключена/);
  assert.ok(!fs.existsSync(path.join(f.userDir, '.hrtech/figma-token')));
  const source = fs.readFileSync(path.join(f.repo, 'setup.sh'), 'utf8');
  assert.doesNotMatch(source, /\/dev\/tty|read -r|TOKEN_URL/);
});

test('setup preserves an existing token without prompting or claiming its permissions were checked', t => {
  const f = fixture(t);
  addKnowledge(f);
  const token = 'figd_existing-test-token';
  const tokenFile = path.join(f.userDir, '.hrtech/figma-token');
  write(tokenFile, token);
  const result = run(f, '../setup.sh', { BULOCHKA_INSTALLER: '1' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(tokenFile, 'utf8'), token);
  assert.match(result.stdout, /Существующий Figma-токен учтён/);
  assert.ok(!result.stdout.includes(token));
  assert.doesNotMatch(result.stdout, /NEXT_STEPS|REST-инструменты включены|никуда не уходит/);
  assert.match(fs.readFileSync(f.env.BULOCHKA_TEST_CALLS, 'utf8'), /FIGMA_ACCESS_TOKEN=figd_existing-test-token/);
});

test('setup stops on failed MCP verification without skills or success message', t => {
  const f = fixture(t);
  addKnowledge(f);
  const result = run(f, '../setup.sh', { BULOCHKA_TEST_GET: 'wrong-args' });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout, /\[3\/3\]|Булочка настроена|NEXT_STEPS/);
  assert.ok(!fs.existsSync(path.join(f.userDir, '.agents/skills/hrtech')));
});

test('setup stops on conflicting skills without reporting success', t => {
  const f = fixture(t);
  addKnowledge(f);
  const existing = path.join(f.userDir, '.agents/skills/hrtech/SKILL.md');
  write(existing, 'User-owned skill');
  const result = run(f, '../setup.sh');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Не удалось настроить все умения/);
  assert.doesNotMatch(result.stdout, /Булочка настроена|NEXT_STEPS/);
  assert.equal(fs.readFileSync(existing, 'utf8'), 'User-owned skill');
});

test('setup rejects a missing runtime before changing assistant configuration', t => {
  const f = fixture(t);
  addKnowledge(f);
  fs.unlinkSync(path.join(f.repo, 'runtime/bin/bridge.mjs'));
  const result = run(f, '../setup.sh');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /нет готового моста/);
  assert.doesNotMatch(result.stdout, /Булочка настроена|NEXT_STEPS/);
  assert.ok(!fs.existsSync(f.env.BULOCHKA_TEST_CALLS));
});

test('setup rejects unsupported Node before changing assistant configuration', t => {
  const f = fixture(t);
  addKnowledge(f);
  write(path.join(f.bin, 'node'), '#!/bin/bash\nexit 1\n', true);
  const result = run(f, '../setup.sh');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Нужен Node\.js 20\.19\+, 22\.13\+ или 24\+/);
  assert.doesNotMatch(result.stdout, /Булочка настроена|NEXT_STEPS/);
  assert.ok(!fs.existsSync(f.env.BULOCHKA_TEST_CALLS));
});

test('Node support predicate matches dependency engine boundaries', t => {
  const f = fixture(t);
  const fakeNode = path.join(f.bin, 'version-node');
  for (const [version, allowed] of [
    ['18.20.0', false], ['20.18.9', false], ['20.19.0', true], ['21.7.0', false],
    ['22.12.0', false], ['22.13.0', true], ['23.1.0', false], ['24.0.0', true], ['25.0.0', true],
  ]) {
    write(fakeNode, `#!/bin/bash\nexec '${process.execPath}' -e 'Object.defineProperty(process.versions, "node", { value: "${version}" }); eval(process.argv[1]);' "$2"\n`, true);
    const result = spawnSync('/bin/bash', ['-c', '. "$1"; bulochka_node_supported "$2"', 'test', path.join(f.repo, 'scripts/agent-paths.sh'), fakeNode], {
      env: f.env, encoding: 'utf8',
    });
    assert.equal(result.status === 0, allowed, version);
  }
});

test('skills migrate to .agents, remove owned legacy link, and remain idempotent', t => {
  const f = fixture(t);
  addKnowledge(f);
  const legacy = path.join(f.userDir, '.codex/skills/hrtech');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  fs.symlinkSync('/previous-clone/claude/skills/hrtech', legacy);
  for (let i = 0; i < 2; i++) {
    const result = run(f, 'link-knowledge.sh');
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const canonical = path.join(f.userDir, '.agents/skills/hrtech');
  assert.equal(fs.readlinkSync(canonical), path.join(f.repo, 'claude/skills/hrtech'));
  assert.ok(!fs.existsSync(legacy));
  assert.equal(fs.readdirSync(path.join(f.repo, 'claude/skills/hrtech')).length, 1);
});

test('skills linking preserves existing real directories and reports the conflict', t => {
  const f = fixture(t);
  addKnowledge(f);
  const existing = path.join(f.userDir, '.agents/skills/hrtech');
  write(path.join(existing, 'SKILL.md'), 'User-owned instructions');
  const result = run(f, 'link-knowledge.sh');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Сохранена существующая папка/);
  assert.equal(fs.readFileSync(path.join(existing, 'SKILL.md'), 'utf8'), 'User-owned instructions');
  assert.deepEqual(fs.readdirSync(existing), ['SKILL.md']);
});

test('an incomplete package with no skills is a setup failure', t => {
  const f = fixture(t);
  const result = run(f, 'link-knowledge.sh');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /не найдены умения HR Tech/);
  assert.doesNotMatch(result.stdout, /Умения Булочки подключены/);
});

test('repair propagates update failures while still attempting local connection repair', t => {
  const f = fixture(t);
  addKnowledge(f);
  write(path.join(f.bin, 'git'), '#!/bin/bash\necho offline >&2\nexit 1\n', true);
  write(path.join(f.bin, 'pgrep'), '#!/bin/bash\nexit 1\n', true);
  const result = run(f, 'repair.sh');
  assert.equal(result.status, 1);
  assert.match(fs.readFileSync(f.env.BULOCHKA_REPAIR_LOG, 'utf8'), /обновление завершилось с ошибками/);
  assert.match(fs.readFileSync(f.env.BULOCHKA_TEST_CALLS, 'utf8'), /codex:mcp add/);
});

test('repair succeeds only when update, skills and connection all succeed', t => {
  const f = fixture(t);
  addKnowledge(f);
  write(path.join(f.bin, 'git'), '#!/bin/bash\nexit 0\n', true);
  write(path.join(f.bin, 'pgrep'), '#!/bin/bash\nexit 1\n', true);
  const result = run(f, 'repair.sh');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(fs.readFileSync(f.env.BULOCHKA_REPAIR_LOG, 'utf8'), /обновление готово/);
});

test('command links preserve all existing real files and prevent setup success', t => {
  const f = fixture(t);
  addKnowledge(f);
  const names = ['hrtech.md', 'hrtech-digest.md', 'hrds-knowledge.md', 'team-notes.md'];
  for (const name of names) write(path.join(f.userDir, '.claude/commands', name), `Personal ${name}`);
  const result = run(f, '../setup.sh');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /Сохранён существующий файл или папка/);
  assert.doesNotMatch(result.stdout, /Булочка настроена|NEXT_STEPS/);
  for (const name of names) {
    const file = path.join(f.userDir, '.claude/commands', name);
    assert.ok(fs.lstatSync(file).isFile());
    assert.equal(fs.readFileSync(file, 'utf8'), `Personal ${name}`);
  }
});

test('command linking preserves directories and foreign broken links without nesting or pruning', t => {
  const f = fixture(t);
  addKnowledge(f);
  const commands = path.join(f.userDir, '.claude/commands');
  write(path.join(commands, 'hrtech.md/personal.txt'), 'Preserve directory');
  fs.symlinkSync('/personal/notes.md', path.join(commands, 'team-notes.md'));
  fs.symlinkSync('/personal/claude/commands/hrtech.md', path.join(commands, 'hrds-knowledge.md'));
  // An unrelated project may use the same directory name as Bulochka.
  fs.symlinkSync('/personal/claude/commands/custom.md', path.join(commands, 'custom.md'));
  const result = run(f, 'link-knowledge.sh');
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.deepEqual(fs.readdirSync(path.join(commands, 'hrtech.md')), ['personal.txt']);
  assert.equal(fs.readlinkSync(path.join(commands, 'team-notes.md')), '/personal/notes.md');
  assert.equal(fs.readlinkSync(path.join(commands, 'hrds-knowledge.md')), '/personal/claude/commands/hrtech.md');
  assert.equal(fs.readlinkSync(path.join(commands, 'custom.md')), '/personal/claude/commands/custom.md');
});

test('owned command and knowledge links migrate from previous clones and remain idempotent', t => {
  const f = fixture(t);
  addKnowledge(f);
  const commands = path.join(f.userDir, '.claude/commands');
  fs.mkdirSync(commands, { recursive: true });
  fs.symlinkSync('/old-clone/claude/commands/hrtech.md', path.join(commands, 'hrtech.md'));
  fs.symlinkSync('/old-clone/claude/knowledge/team-notes.md', path.join(commands, 'team-notes.md'));
  for (let i = 0; i < 2; i++) {
    const result = run(f, 'link-knowledge.sh');
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  assert.equal(fs.readlinkSync(path.join(commands, 'hrtech.md')), path.join(f.repo, 'claude/commands/hrtech.md'));
  assert.equal(fs.readlinkSync(path.join(commands, 'team-notes.md')), path.join(f.repo, 'claude/knowledge/team-notes.md'));
});
