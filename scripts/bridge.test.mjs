// Регрессия того, что осталось продуктом после сноса конвейера очереди (4.13):
// мост Figma↔помощник, замок файла и установка/линковка знаний.
// Тесты очереди удалены вместе с самой очередью — здесь их наследники.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const setupSource = fs.readFileSync(new URL('../setup.sh', import.meta.url), 'utf8');
const installSource = fs.readFileSync(new URL('../install.sh', import.meta.url), 'utf8');
const repairSource = fs.readFileSync(new URL('./repair.sh', import.meta.url), 'utf8');
const connectMcpSource = fs.readFileSync(new URL('./connect-mcp.sh', import.meta.url), 'utf8');
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
    assert.match(localServerSource, /if \(fileKey && wasPinned !== fileKey\)/);
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

test('setup wires the bridge and knowledge for every supported agent', () => {
    // Помощник может быть любым из поддерживаемых: мост и умения обязаны доезжать до обоих,
    // иначе у половины команды установка молча не работает.
    // Сама регистрация MCP живёт в connect-mcp.sh — её зовут и setup.sh, и кнопка «Обновить».
    assert.match(setupSource, /scripts\/connect-mcp\.sh/);
    assert.match(connectMcpSource, /"\$CODEX_BIN" mcp add figma-hrtech/);
    assert.match(connectMcpSource, /"\$CLAUDE_BIN" mcp add figma-hrtech -s user/);
    // Официальный установщик Codex CLI кладёт бинарь в ~/.local/bin — без этого пути
    // установка молча пропускает Codex и дизайнер остаётся без моста.
    assert.match(connectMcpSource, /\$HOME\/\.local\/bin\/codex/);
    assert.match(connectMcpSource, /\/Applications\/ChatGPT\.app\/Contents\/Resources\/codex/);
    // Перед add обязателен remove: иначе «already exists» роняет установку с кодом 1.
    assert.match(connectMcpSource, /mcp remove figma-hrtech[\s\S]*?mcp add figma-hrtech/);
    // bash 3.2 (штатный на macOS) падает на "${ARR[@]}" с пустым массивом под set -u.
    assert.doesNotMatch(connectMcpSource, /^set -u/m);
    assert.match(setupSource, /if \[ -z "\$CODEX_BIN" \] && \[ -z "\$CLAUDE_BIN" \]; then/);
    assert.match(setupSource, /scripts\/link-knowledge\.sh/);
    // Codex CLI ставим только когда помощника нет вообще — не доустанавливать второго агента.
    assert.match(installSource, /https:\/\/chatgpt\.com\/codex\/install\.sh/);
    assert.match(installSource, /! command -v claude >\/dev\/null 2>&1 && \\/);
    assert.match(linkKnowledgeSource, /CODEX_SKILLS_ROOT="\$\{CODEX_HOME:-\$HOME\/\.codex\}\/skills"/);
    assert.match(linkKnowledgeSource, /CLAUDE_SKILLS_ROOT="\$HOME\/\.claude\/skills"/);
    assert.match(linkKnowledgeSource, /CLAUDE_COMMANDS_ROOT\/hrtech\.md"/);
});

test('both install paths fully evict the retired background runner', () => {
    // Раннера в репозитории больше нет: если оставить только `launchctl unload`,
    // plist со старой установки продолжит указывать на удалённый скрипт.
    for (const [name, source] of [['setup.sh', setupSource], ['repair.sh', repairSource]]) {
        assert.match(source, /LEGACY_LABEL="design\.hrtech\.bulochka\.runner"/, `${name} must target the legacy label`);
        assert.match(source, /launchctl bootout "gui\/\$\(id -u\)\/\$LEGACY_LABEL"/, name);
        assert.match(source, /rm -f "\$LEGACY_PLIST"/, name);
        assert.match(source, /pkill -f hrtech-watch\.sh/, name);
        assert.match(source, /pkill -f hrtech-driver\.mjs/, name);
    }
    // Кнопка «Обновить» — единственный путь, по которому миграция доедет до дизайнера.
    assert.match(repairSource, /scripts\/link-knowledge\.sh/);
    // ...и единственный, которым дизайнер чинит «помощник не видит мост», не открывая терминал.
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
    // Правила работы с Figma, на которые ссылаются скилы, обязаны пережить чистку.
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
