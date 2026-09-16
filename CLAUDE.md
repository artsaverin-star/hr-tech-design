# Булочка · HR TECH DESIGN — HR Tech skills, Figma bridge & knowledge base

This repo packages HR Tech skills for each designer's own agent (Codex CLI or Claude Code), the Figma
bridge those skills use, and the single source of truth for the HRDS conversion knowledge base. Work
is created, followed and stopped in the designer's own agent task. Bulochka's Figma UI is only the
capabilities catalog and configuration surface; it is not an agent host or execution center. Both
supported agents are equal citizens: same `figma-hrtech` MCP server, same skill sources.

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
экспонирует эти директории помощнику дизайнера как локальные skills (Codex — `~/.codex/skills`,
Claude Code — `~/.claude/skills`); помощник сначала видит имя и `description`, а полный `SKILL.md`
загружает только при совпадении задачи или явном вызове по имени.
Относительные ссылки всегда разрешаются от директории конкретного умения.

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
- **`hrtech-prototipnitsa`** — Figma-спека → живой прототип в Прототипнице (Arcadia-витрина,
  `hrtech/products/prototipnitsa/prototipnitsa-www`): устройство и жёсткий регламент витрины
  (lifecycle только через CLI `ya tool nots run` + Startrek-тикет), локальный запуск с четырьмя
  затыками, рецепт «спека → код на `@yandex-int/hr-components`», спек-манифест `src/spec.ts`,
  конвенции CONTEXT.md / SPEC-VS-PROD.md, публикация PR + Beta.
- **`hrtech-proto-spec`** — обратное направление: живой прототип КАК спека — режим `?spec=1`
  (тёмный борд из живых iframe-состояний по манифесту), и стройка/синк кадров спеки в Figma
  ИЗ кода прототипа: тексты из `texts.ts`, мэппинг «экран → node-id» из SPEC-VS-PROD.md,
  правило «прод — истина».

Скилы собраны из разборов реальных задач; правило то же, что у остального: **фактов не выдумывать** —
ключ, id или число попадают в скил, только если подтверждены источником.

## How the system works

- **The designer's own agent (Codex CLI or Claude Code)**: this is the product's execution surface. The
  designer describes work in their own agent task; the agent selects a matching HR Tech skill implicitly
  or by an explicit call by name. Account, model, effort, approvals, context, progress and Stop all
  remain in that agent. Neither agent is a fallback for the other — texts and setup treat them equally.
- **Bulochka Figma UI** (`figma-desktop-bridge/`): the companion discovery and settings surface —
  «Умения» (what the agent can do, when it kicks in, how to ask) and «Настройки» (Связь · Умения ·
  Обслуживание: the pinned file, the found agent, the personal token, updates, version, support log).
  Progress and «Остановить» for the run happening right now live on top of it. Name a specific agent
  only where it is a fact of connection or an install instruction (e.g. a «Помощник: Codex CLI /
  Claude Code» status row) — and there both must be equal, never one pitched and one footnoted.
  Never show someone else's tasks or progress: everything is scoped to this designer and this file.
- **Bridge server** (`runtime/bin/bridge.mjs` у дизайнеров, `dist/local.js` при локальной отладке;
  MCP `figma-hrtech`): executes `figma_execute` (arbitrary Plugin API JS) in desktop Figma where
  YS Text loads — no cloud font wall. `setup.sh` registers this MCP server for every supported agent
  found on the machine.
- **Knowledge and skills**: common rules stay versioned in this repo; installation/update makes the same
  current version discoverable by each designer's local agent. There is no team execution queue and no
  shared agent account.
- **Who actually starts a task — there is exactly one path.** The designer describes the work in their own
  agent, the agent calls `figma-hrtech`, done. Bulochka has no task queue, no dispatcher, no background
  runner and no action buttons: the whole pipeline (widget action buttons, `HRTECH_ACTION`, the
  `task_queue` document slot, `scripts/hrtech-watch.sh` and the `design.hrtech.bulochka.runner` LaunchAgent)
  was removed in 4.13 because it kept breaking while the value of the product was elsewhere. Do not
  reintroduce a producer without a consumer: a queued task with nothing draining it is a button that
  silently does nothing. `setup.sh` and `scripts/repair.sh` now *evict* the old LaunchAgent (bootout +
  delete the plist + kill leftover processes) instead of merely unloading it.

## Editing rules to teach the system

1. Edit `claude/commands/hrtech.md` (shared task rules),
   `claude/commands/hrds-knowledge.md` (component/pattern reference) or the relevant skill.
2. Bump the version в **ТРЁХ** файлах И **пересобрать бандл** — иначе приложение навсегда покажет «Починить движок»:
   - `figma-desktop-bridge/code.js` (`hrtechVersion`)
   - `figma-desktop-bridge/ui.html` (`hrtech-ver-badge`, `HRTECH_UI_VERSION`)
   - `src/core/websocket-server.ts` (`HRTECH_VERSION`)
   - **`npm run build:server`** → `runtime/bin/bridge.mjs` **коммитится в репо**: у дизайнеров тулчейна нет,
     они запускают именно этот файл. Правка в `src/` без пересборки до них НЕ доедет.

   Приложение сравнивает версию моста из `SERVER_HELLO` со своей — расхождение зажигает баннер. Забыть
   пересборку хуже, чем забыть бамп: «Починить движок» делает `git pull` + перезапуск и подтягивает
   всё тот же старый бандл, то есть баннер становится неизлечимым.
3. Installed skills are symlinks back to the versioned source directories in this repo (`scripts/link-knowledge.sh`
   links every `claude/skills/*` into both `~/.codex/skills` and `~/.claude/skills`, plus the commands and
   knowledge files into `~/.claude/commands`); do not maintain a second hand-copied source. Keep the
   historical `claude/` paths until a deliberate migration updates every reference and installer together.
   **Since 4.13 that linking runs only from `setup.sh` and from «Обновить» (`scripts/repair.sh`)** — the
   login-time LaunchAgent that used to relink on every boot is gone. A new skill therefore does NOT reach a
   designer by `git pull` alone: they must press «Обновить» (or run `./setup.sh`). Say so when you ship one.
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

`install.sh` provisions Node.js when needed and installs Codex CLI only if no supported agent is found
(a designer who already runs Claude Code must not get a second agent silently), then clones the repo and
calls `setup.sh`. `setup.sh` connects the ready `runtime/bin/bridge.mjs` as the `figma-hrtech` MCP server
for **whichever supported agents are installed** (Codex and/or Claude Code), links the versioned HR Tech
skills into their skill directories and asks for the optional personal Figma token
(`~/.hrtech/figma-token`). Updating or repairing refreshes those MCP and skill links from this repo.

**MCP registration lives in `scripts/connect-mcp.sh`, and BOTH `setup.sh` and `scripts/repair.sh` call it.**
The single most common designer breakage is «помощник не видит мост» — no `[mcp_servers.figma-hrtech]`
section in `~/.codex/config.toml`, or a section pointing at another clone / a `node` path that no longer
exists. Until 4.21 only `setup.sh` could fix that, i.e. only the terminal; the «Обновить» button did
`git pull` + skill relinking and left the bridge unconnected. Keep that call in `repair.sh`: the button is
the only repair path a designer who «only types in chat» can reach. `connect-mcp.sh` resolves `node`,
`codex` and `claude` by known install paths too, because `repair.sh` runs from the bridge process with a
minimal PATH, and it deliberately avoids `set -u` (macOS ships bash 3.2, where `"${ARR[@]}"` on an empty
array aborts). Note the propagation lag: a designer sitting on an older `repair.sh` gets the new files on
the first press and the actual reconnect on the second.

Nothing runs in the background. The old queue dispatcher and its `design.hrtech.bulochka.runner`
LaunchAgent were deleted in 4.13; `setup.sh` and `scripts/repair.sh` bootout the label, delete the leftover
plist and kill any surviving `hrtech-watch.sh` / `hrtech-driver.mjs` process, so machines with an old
installation are cleaned up on the next update. `scripts/repair.sh` is the path the «Обновить» button takes
(`src/core/websocket-server.ts` runs it), so migrations for designers must live there.

Plugin import: Figma → Plugins → Development → Import from `figma-desktop-bridge/manifest.json`.
See `ONBOARDING.md` (designers) and `HRDS-CONTRIBUTION.md` (how to extend HRDS itself).
