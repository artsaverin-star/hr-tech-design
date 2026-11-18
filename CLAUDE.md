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
экспонирует эти директории помощнику дизайнера как локальные skills (Codex — `~/.agents/skills`,
Claude Code — `~/.claude/skills`); помощник сначала видит имя и `description`, а полный `SKILL.md`
загружает только при совпадении задачи или явном вызове по имени.
Относительные ссылки всегда разрешаются от директории конкретного умения.

- **`hrtech-figma-search`** — поиск файлов, страниц, экранов и текстов Figma по личному локальному каталогу; данные каталога не входят в публичный релиз.
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
- **`hrtech-proto-spec`** — обратное направление: живой прототип КАК спека — `?spec=map` «Карта»
  (борд из снимков по грамматике Figma: прямые, веер вниз, гребёнка, ссылки «→ 05.1»; состав —
  `spec-sections.ts`, приёмка — скрипт; клик по кадру открывает это состояние в прототипе; открывается на «00»
  с задачей версии — «Проблема» и «Что делаем» из БТ; не про задачу — снимается с карты по слову владельца). Вида
  «Сценарий» (`?spec=1`) нет и НИКОГДА не делать (владелец 6.10.2026); рецепты `?seed=` для состояний, которые открываются только кликами; комплект кода в
  `references/kit/`; стройка/синк кадров спеки в Figma ИЗ кода прототипа, правило «прод — истина».

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
2. Keep the Bulochka version aligned in `figma-desktop-bridge/code.js` (`hrtechVersion`),
   `figma-desktop-bridge/ui.html` (badge and `HRTECH_UI_VERSION`),
   `src/core/websocket-server.ts` (`HRTECH_VERSION`) and `scripts/check-plugin-ui.mjs`.
   Rebuild with `npm run build:server`: commit `runtime/bin/engine.mjs` and the regenerated
   `update-manifest.json`. Designers run `runtime/bin/bridge.mjs`, a stable supervisor
   that loads the bundled engine and applies verified package updates between commands.
3. `scripts/link-knowledge.sh` exposes versioned skills to each installed agent. Setup and
   package repair refresh these links; pulling source files alone does not install a new skill.
   Respect `CODEX_HOME` and `CLAUDE_CONFIG_DIR`. Keep source in `claude/skills/` and
   each designer's Figma catalog outside the package (`~/.hrtech/figma-catalog/` by default).
   Never put scanned Figma metadata, text or indexes in the public repository or manifest.
4. When the user approves a new screen type, distill it into a numeric BLUEPRINT in the rules (components by
   library key + spacing + order). Do NOT save references to canvas nodes — the system must stay file-independent.

## Build

```bash
npm run build:server   # esbuild → runtime/bin/engine.mjs + update-manifest.json
npm run build:local    # TypeScript → dist/local.js, for local debugging
npm test
npm run check:plugin-ui
```

Rebuild the engine after server changes, and regenerate the manifest after changes to any
shipped package file. Validate the actual manifest payload when changing installation or skills.

## Distribution

`install.sh` downloads a verified package and private Node runtime into
`~/Library/Application Support/Bulochka`, then configures installed Codex and/or Claude Code.
It requires neither system Node, Git nor Homebrew. It does not install another assistant.
`setup.sh` and `scripts/repair.sh` both call `scripts/connect-mcp.sh` and refresh skill links.
The optional personal Figma token stays in `~/.hrtech/figma-token`.

The «Обновить» button uses `scripts/repair.sh`; a newer published Figma plugin can also
update an older packaged bridge. The supervisor preserves MCP and file pins across engine
switches. A developer checkout is not silently updated. Setup and repair also remove the
obsolete task-queue LaunchAgent from installations predating 4.13.

GitHub `main` distributes the local bridge and skills. Publishing the Figma plugin is a
separate release through Figma Desktop, using `figma-desktop-bridge/manifest.json`.
Designers run **Plugins → From Yandex → Bulochka**; development import is for maintainers.
See `ONBOARDING.md` for installation and `HRDS-CONTRIBUTION.md` for extending HRDS.
