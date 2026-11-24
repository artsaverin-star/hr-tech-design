# Булочка · HR TECH DESIGN — HR Tech skills, Figma bridge & knowledge base

This repo packages HR Tech skills for each designer's own agent (Codex, Claude Code, Antigravity or Cursor), the Figma
bridge those skills use, and the single source of truth for the HRDS conversion knowledge base. Work
is created, followed and stopped in the designer's own agent task. Bulochka's Figma UI is only the
connection and configuration surface; it is not an agent host or execution center. All
supported agents use `figma-hrtech` and the same skill sources. Each designer runs their own local
bridge with their own account; no connection to the maintainer's machine or shared server is needed.

**5.0 product summary:** Булочка подключает помощника (Codex, Claude Code, Antigravity, Cursor) к открытому Figma-файлу и знаниям HR Tech.
Установка и восстановление идут через одну команду Терминала (`install.sh`); плагин запускается из
**Figma → Plugins → From Yandex → Bulochka**. Это каталог организации, не Community.

## Knowledge base (always in context here)

The full HRDS component/pattern reference is the authoritative spec:

@claude/commands/hrds-knowledge.md

Shared team knowledge (verified recipes, component keys, fixes — designers edit this file directly;
the plugin's sync buttons were removed in 2.1) lives here and is also always in context:

@claude/knowledge/team-notes.md

The shared task playbook (zone-graph algorithm, blueprints and no-fabrication rule) lives in
`claude/commands/hrtech.md`. The directory name is historical: both agents' skills use this file as
their common protocol. Edit source files in this repo, never generated user-scope copies.

## Skills (load on demand, unlike the two files above)

`claude/skills/<name>/SKILL.md` — исходники умений HR Tech. Имя каталога историческое. Установка
экспонирует эти директории помощнику дизайнера как локальные skills (Codex — `~/.agents/skills`,
Claude Code — `~/.claude/skills`); помощник сначала видит имя и `description`, а полный `SKILL.md`
загружает только при совпадении задачи или явном вызове по имени.
Относительные ссылки всегда разрешаются от директории конкретного умения.
Codex поддерживает ссылки на каталоги skills — см. [официальную документацию](https://learn.chatgpt.com/docs/build-skills).
Миграция удаляет старую ссылку Булочки из `~/.codex/skills` только после успешной установки в новый
каталог. Существующие реальные папки и сторонние ссылки сохраняются с сообщением о конфликте.

- **`hrtech-figma-search`** — поиск файлов, страниц, экранов и текстов по каталогу Figma команды
  HR Tech: точные ссылки на результаты, сведения о покрытии и обновление индекса.
- **`hrtech-spec`** — сборка спеки-борда сценариев: грамматика в цифрах, ромбы, веер, гребёнка,
  светофор статуса, три канонические формы conn-вектора, аудит связности после перекладки.
- **`hrtech-mobile`** — десктоп → мобилка 375: каркас и честный вьюпорт, карта «десктопный элемент →
  мобильный эквивалент», настоящий `Drawer [mobile]` со скримом, типографика на ДС-стилях.
- **`hrtech-audit`** — проверка на ДС и починка: чек-лист нарушений, ограниченный скан без подвешивания
  песочницы, правка МАСТЕРА вместо оверрайда, снятие залипших оверрайдов, список ложных срабатываний.
- **`hrtech-arcadia`** — исходники живых сервисов как источник правды: где лежит фронт (два корня,
  `frontend/services` и `products/<x>/<x>-www`), кодпоиск `ya tool cs` вместо grep по FUSE, три
  устройства текстов, разворот токенов в числа, ЭТАЛОННЫЕ СКРИНШОТЫ прямо в репозитории,
  соответствие «компонент HRDS в Figma → компонент в коде», оболочка интранета Orbit.
  Правило: **если продукт существует — тексты, состояния и цифры берём из кода, а не придумываем.**
- **`hrtech-yteam`** — продуктовый контекст Яндекс Тима: роли вкладок, сценарии главной,
  календаря, поиска, сервисов и профиля, права, ошибки, возвраты и границы встроенных продуктов.
  Читать перед изменением пользовательского пути или встраиванием нового сервиса в Тим;
  исходный код, серверные условия и локальные эксперименты в карте разделены.
- **`hrtech-prototipnitsa`** — Figma-спека → живой прототип в Прототипнице (Arcadia-витрина,
  `hrtech/products/prototipnitsa/prototipnitsa-www`): устройство и жёсткий регламент витрины
  (lifecycle только через CLI `ya tool nots run` + Startrek-тикет), локальный запуск с четырьмя
  затыками, рецепт «спека → код на `@yandex-int/hr-components`», спек-манифест `src/spec.ts`,
  конвенции CONTEXT.md / SPEC-VS-PROD.md, публикация PR + Beta.
- **`hrtech-proto-spec`** — обратное направление: живой прототип КАК спека — `?spec=map` «Карта»
  (борд из снимков по грамматике Figma: прямые, веер вниз, гребёнка, ссылки «→ 05.1»; состав —
  `spec-sections.ts`, приёмка — скрипт; клик по кадру открывает это состояние в прототипе; открывается на «00»
  с задачей версии — «Проблема» и «Что делаем» из БТ; не про задачу — снимается с карты по слову владельца). Вида
  «Сценарий» (`?spec=1`) нет и НИКОГДА не делать (владелец 6.10.2026); рецепты `?seed=` для состояний, которые открываются только кликами; комплект кода в
  `references/kit/`; стройка/синк кадров спеки в Figma ИЗ кода прототипа, правило «прод — истина».

Скилы собраны из разборов реальных задач; правило то же, что у остального: **фактов не выдумывать** —
ключ, id или число попадают в скил, только если подтверждены источником.

## How the system works

- **The designer's own agent (Codex or Claude Code)**: this is the product's execution surface. The
  designer describes work in their own agent task; the agent selects a matching HR Tech skill implicitly
  or by an explicit call by name. Account, model, effort, approvals, context, progress and Stop all
  remain in that agent. Neither agent is a fallback for the other — texts and setup treat them equally.
- **Bulochka Figma UI** (`figma-desktop-bridge/`), version 4.26:
  - One connection-status line remains visible below the navigation on both screens: connected
    after `SERVER_HELLO`, connecting, disconnected, paused or version mismatch. Keep this line
    visible without restoring a separate homepage connection card.
  - «Главная»: a short purpose and a plain list of six example requests, each with one line explaining
    what it produces. No connection card, file card or copy-task action on the homepage.
    The designer selects a screen in Figma and writes the request in the Codex or Claude Code chat.
  - «Настройки»: connection status and recovery instructions once, current file, version, detected
    agents, installed HR Tech skill count, optional token details, «Обновить Булочку»,
    «Скопировать отчёт» and diagnostics. Connection help leads to the local app installer,
    full agent restart, the organization plugin catalog and a new chat. Never substitute a demo name for a real file.
  Progress, approvals and Stop belong to the agent chat. Examples do not launch tasks.
  Do not claim the agent or skills are missing merely because the bridge has not connected:
  without the bridge, the Figma plugin cannot inspect the host installation.
- **Bridge server** (`runtime/bin/bridge.mjs` у дизайнеров, `dist/local.js` при локальной отладке;
  MCP `figma-hrtech`): executes `figma_execute` (arbitrary Plugin API JS) in desktop Figma where
  YS Text loads — no cloud font wall. `setup.sh` registers this MCP server for every supported agent
  found on the machine.
- **Knowledge and skills**: common rules stay versioned in this repo; installation/update makes the same
  current version discoverable by each designer's local agent. There is no team execution queue and no
  shared agent account.
- **Who actually starts a task — there is exactly one path.** The designer describes the work in their own
  agent, the agent calls `figma-hrtech`, done. Bulochka has no task queue, no dispatcher, no background
  runner and no task-launch buttons: the whole pipeline (widget action buttons, `HRTECH_ACTION`, the
  `task_queue` document slot, `scripts/hrtech-watch.sh` and the `design.hrtech.bulochka.runner` LaunchAgent)
  was removed in 4.13 because it kept breaking while the value of the product was elsewhere. Do not
  reintroduce a producer without a consumer: a queued task with nothing draining it is a button that
  silently does nothing. `setup.sh` and `scripts/repair.sh` now *evict* the old LaunchAgent (bootout +
  delete the plist + kill leftover processes) instead of merely unloading it.

## Editing rules to teach the system

1. Edit `claude/commands/hrtech.md` (shared task rules),
   `claude/commands/hrds-knowledge.md` (component/pattern reference) or the relevant skill.
2. Версия управляется из **единого источника правды** `bulochka.version.json`:
   - обнови `bulochka.version.json`, `src/core/websocket-server.ts` (`HRTECH_VERSION`) и `figma-desktop-bridge/code.js` (`hrtechVersion`, `PLUGIN_VERSION`);
   - запусти **`npm run build:all`** — это соберёт `figma-desktop-bridge/ui.html` из модульных исходников `src/plugin-ui/`, пересоберёт `runtime/bin/engine.mjs`, обновит `update-manifest.json` и прогонит `scripts/check-plugin-ui.mjs`;
   - `runtime/bin/engine.mjs`, `figma-desktop-bridge/ui.html` и `update-manifest.json` **коммитятся в репо**: у дизайнеров нет тулчейна сборки.
   - `scripts/check-plugin-ui.mjs` автоматически сверяет все места с `bulochka.version.json` — рассинхрон невозможен.

   Исходники UI плагина живут в `src/plugin-ui/` (`template.html`, `styles.css`, `rpc-bridge.js`, `ws-client.js`, `app.js`, `keep-alive.js`) — не правь сгенерированный `figma-desktop-bridge/ui.html` напрямую, редактируй `src/plugin-ui/` и запускай `npm run build:plugin-ui`.
   Версия плагина публикуется отдельно в каталоге организации Yandex.
3. Installed skills are symlinks back to the versioned source directories in this repo (`scripts/link-knowledge.sh`
   links every `claude/skills/*` into `~/.agents/skills` and `~/.claude/skills`, plus the commands and
   knowledge files into `~/.claude/commands`); do not maintain a second hand-copied source. Keep the
   historical `claude/` paths until a deliberate migration updates every reference and installer together.
   Linking runs through `setup.sh` (including the app installer) and `scripts/repair.sh`; no login-time
   LaunchAgent distributes new knowledge. App installs receive new skills from a fresh installer.
   Git installs need relinking after pulling changes. After either path, fully restart the agent and
   open a new chat. Say so when shipping a new skill.
4. When the user approves a new screen type, distill it into a numeric BLUEPRINT in the rules (components by
   library key + spacing + order). Do NOT save references to canvas nodes — the system must stay file-independent.

## Build (only when changing the bridge server source)

```bash
npm run build:server   # esbuild → runtime/bin/bridge.mjs — ЭТОТ файл коммитится и едет дизайнерам
npm run build:local    # tsc → dist/local.js — локальная отладка, dist/ в .gitignore
```

Правка в `src/` доезжает до дизайнеров ТОЛЬКО через `build:server` и коммит `runtime/bin/bridge.mjs`.
Не нужно ни для правок Figma-приложения (`figma-desktop-bridge/`), ни для правок правил и знаний.

## Distribution

### Normal designer installation

The primary distribution is **«Установить Булочку.app»** for macOS 13.5+. It ships its own Node
runtime and payload, installs offline into `~/Library/Application Support/Bulochka`, and configures
both Codex and Claude Code when both are present. One supported agent is enough. Claude desktop's
**Code** tab is supported without requiring a separately installed CLI. If neither agent is installed,
the GUI offers download links and asks the user to return afterwards.

The normal completion flow is:

1. Fully quit and reopen the configured agent; use the Code tab in Claude desktop.
2. Open the work file in Figma and run **Plugins → From Yandex → Bulochka**.
3. In a new agent chat, ask it to name the open file and selected screen without changing anything.

No Terminal, Git, Homebrew, system Node installation, Community search or manual manifest import
belongs in this normal designer flow. Installing the Figma plugin alone does not install the local
MCP bridge or skills. Account sign-in remains in the agent; Figma organization access remains in Figma.

The current **4.26 universal installer is Developer ID signed and Apple notarized**. Apple accepted
submission `ea4c11de-b581-4ad4-8620-55267752dff0`. It includes three small illustrations of the original
mascot for welcome, connection and success. The release artifact for both Apple Silicon and Intel is
`bulochka-v4-26/installer/universal/Булочка-4.26-universal-notarized.zip`.
The owner confirmed publication of the Figma plugin to the Yandex organization catalog on 2026-11-09;
this is owner confirmation, not an independent publication check. A live 4.26 roundtrip on this Mac
passed on 2026-11-09 without changing the design. Installation on a colleague's clean Mac has not
been tested. Build/release instructions are in
`installer/mac/README.md`; each later build needs its own signing and notarization.

### App payload and repair

`installer/mac/install-local.sh` checks the OS, checksums, payload and installed agents, then copies
files and invokes `setup.sh` with `BULOCHKA_INSTALLER=1`. It uses a target lock and the marker
`.bulochka-install.json` (`schemaVersion: 1`, `distribution: "app"`). Old payloads are retained in sibling
backup directories. A failed first setup retains the installed runtime because MCP configuration may
already refer to it. An update failure restores usable old files while preserving the backup; do not
claim account configuration was completely rolled back.

`agent-paths.sh` prefers the compatible bundled `runtime/node/bin/node`. In an app installation,
`repair.sh` restores local skill/MCP settings **without Git or downloading an update**. A new package
version requires the fresh app installer. The Figma plugin version is distributed separately through
the Yandex organization catalog. Report repair failures honestly; starting a repair process is not success.

### MCP and skills

`setup.sh` registers `runtime/bin/bridge.mjs` for supported agents and links all shipped skills. It
never asks for a new Figma token; the optional token is added in plugin Settings. An existing
`~/.hrtech/figma-token` is preserved and passed to the agent's MCP configuration without claiming its
permissions have been verified.

**Registration lives in `scripts/connect-mcp.sh`; setup and repair both call it.** The shared
`agent-paths.sh` handles minimal Finder PATHs, bundled Codex CLIs, Claude CLI and Claude.app.
For Claude desktop, `configure-claude-desktop.mjs` merges the `figma-hrtech` configuration while
preserving unrelated entries and handling an existing legacy desktop override.

Codex `mcp add` updates an existing entry: do not remove it first. `mcp get --json` then verifies exact
command/arguments and enabled state without starting the bridge. Do not run Claude `mcp get` during
setup: its health check can start the bridge. Report actual configuration errors with tokens redacted;
a failed config write does not prove a sign-in problem. macOS bash 3.2 compatibility must be preserved.

The optional helper `scripts/install-next-steps.sh`, used by standalone setup and the legacy bootstrap,
prints restart → **From Yandex** → read-only verification once. It must not open Finder on a manifest
or start another agent. `BULOCHKA_INSTALLER=1` suppresses duplicate instructions from setup.

### Legacy Git workflow and plugin development

`install.sh` remains available for previous Git-based installations and developer workflows. It checks
Git and compatible Node, downloads the repository into `~/hr-tech-design`, then calls setup. Its
log is `~/.hrtech/install.log`. In this mode `repair.sh` may pull Git updates before repairing local
links; it returns failure if a required step fails. App installs do not use this path.

The supported system Node range follows bundled dependencies: `^20.19.0 || ^22.13.0 || >=24.0.0`.
The GUI installer supplies its own Node and does not install package managers on a designer's Mac.

For testing an **unpublished plugin build**, a developer can use Figma → Plugins → Development →
Import plugin from manifest… with `figma-desktop-bridge/manifest.json` from the working copy. Keep
this instruction in developer documentation only; ordinary users run the published organization plugin.

The retired queue dispatcher and `design.hrtech.bulochka.runner` LaunchAgent stay removed. Setup
and repair clean them up for old installations; do not reintroduce background task execution.

See `ONBOARDING.md` for designers and `HRDS-CONTRIBUTION.md` for contributing to HRDS.
