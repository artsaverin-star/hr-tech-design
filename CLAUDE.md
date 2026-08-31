# HR TECH DESIGN — bridge plugin & knowledge base

This repo is BOTH the Figma↔Claude bridge plugin AND the single source of truth for the HRDS
conversion knowledge base. Open a terminal session **in this folder** to converse with the full
knowledge base always in context. Designers use the plugin's buttons for routine work (no terminal).

## Knowledge base (always in context here)

The full HRDS component/pattern reference is the authoritative spec:

@claude/commands/hrds-knowledge.md

Shared team knowledge (verified recipes, component keys, fixes — designers edit this file directly;
the plugin's sync buttons were removed in 2.1) lives here and is also always in context:

@claude/knowledge/team-notes.md

The task playbook (zone-graph algorithm, blueprints, no-fabrication rule, status protocol) lives in
`claude/commands/hrtech.md` — it is the body of the `/hrtech` slash command. Edit THESE two files to
teach the system; everything else (the user-scope `/hrtech`, headless runs) reads from them via symlink.

## Skills (load on demand, unlike the two files above)

`claude/skills/<name>/SKILL.md` — подгружаются САМИ, когда задача совпала с `description`, и поэтому
не едят контекст на каждой задаче (в отличие от `hrds-knowledge.md` и `team-notes.md`, которые
подключены всегда). `setup.sh` линкует каждую папку в `~/.claude/skills/`; новый скил подхватится
без правки установщика.

- **`hrtech-spec`** — сборка спеки-борда сценариев: грамматика в цифрах, ромбы, веер, гребёнка,
  светофор статуса, три канонические формы conn-вектора, аудит связности после перекладки.
- **`hrtech-mobile`** — десктоп → мобилка 375: каркас и честный вьюпорт, карта «десктопный элемент →
  мобильный эквивалент», настоящий `Drawer [mobile]` со скримом, типографика на ДС-стилях.
- **`hrtech-audit`** — проверка на ДС и починка: чек-лист нарушений, ограниченный скан без подвешивания
  песочницы, правка МАСТЕРА вместо оверрайда, снятие залипших оверрайдов, список ложных срабатываний.

Скилы собраны из разборов реальных задач; правило то же, что у остального: **фактов не выдумывать** —
ключ, id или число попадают в скил, только если подтверждены источником.

## How the system works

- **Plugin** (`figma-desktop-bridge/`): runs in desktop Figma, talks to the bridge over WebSocket
  (ports 9223–9232). Buttons queue tasks into `figma.root` shared plugin data; the live widget shows
  account, usage limits, model picker, progress, queue and Stop/Clear.
- **Bridge server** (`dist/local.js`, MCP `figma-hrtech`): executes `figma_execute` (arbitrary Plugin
  API JS) in desktop Figma where YS Text loads — no cloud font wall.
- **Auto-runner** (`scripts/hrtech-watch.sh`): polls the queue, runs `claude -p "/hrtech"` per task,
  model = the plugin's picker (Auto → Haiku for spelling, Sonnet for conversions). Hard Stop kills the run.

## Editing rules to teach the system

1. Edit `claude/commands/hrtech.md` (task rules) or `claude/commands/hrds-knowledge.md` (component/pattern reference).
2. Bump the version в **ТРЁХ** файлах И **пересобрать бандл** — иначе виджет навсегда покажет «Починить движок»:
   - `figma-desktop-bridge/code.js` (`hrtechVersion`)
   - `figma-desktop-bridge/ui.html` (`hrtech-ver`, `hrtech-ver-badge`, `HRTECH_UI_VERSION`)
   - `src/core/websocket-server.ts` (`HRTECH_VERSION`)
   - **`npm run build:server`** → `runtime/bin/bridge.mjs` **коммитится в репо**: у дизайнеров тулчейна нет,
     они запускают именно этот файл. Правка в `src/` без пересборки до них НЕ доедет.

   Виджет сравнивает версию моста из `SERVER_HELLO` со своей — расхождение зажигает баннер. Забыть
   пересборку хуже, чем забыть бамп: «Починить движок» делает `git pull` + перезапуск и подтягивает
   всё тот же старый бандл, то есть баннер становится неизлечимым.
3. The user-scope `/hrtech` is a symlink to the repo file — no copy step needed.
4. When the user approves a new screen type, distill it into a numeric BLUEPRINT in the rules (components by
   library key + spacing + order). Do NOT save references to canvas nodes — the system must stay file-independent.

## Build (only when changing the bridge server source)

```bash
npm run build:local    # tsc → dist/local.js ; not needed for plugin UI or rules edits
```

## Distribution

`setup.sh` installs for a designer (checks node/claude, builds dist, `claude mcp add` user-scope, symlinks
commands). Plugin import: Figma → Plugins → Development → Import from `figma-desktop-bridge/manifest.json`.
See `ONBOARDING.md` (designers) and `HRDS-CONTRIBUTION.md` (how to extend HRDS itself).
