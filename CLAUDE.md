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
- **`hrtech-arcadia`** — исходники живых сервисов как источник правды: где лежит фронт (два корня,
  `frontend/services` и `products/<x>/<x>-www`), кодпоиск `ya tool cs` вместо grep по FUSE, три
  устройства текстов, разворот токенов в числа, ЭТАЛОННЫЕ СКРИНШОТЫ прямо в репозитории,
  соответствие «компонент HRDS в Figma → компонент в коде», оболочка интранета Orbit.
  Правило: **если продукт существует — тексты, состояния и цифры берём из кода, а не придумываем.**

Скилы собраны из разборов реальных задач; правило то же, что у остального: **фактов не выдумывать** —
ключ, id или число попадают в скил, только если подтверждены источником.

## How the system works

- **Plugin** (`figma-desktop-bridge/`): runs in desktop Figma, talks to the bridge over WebSocket
  (ports 9223–9232). Виджет показывает статус подключения (Мост · Связь · Вход), лимиты, прогресс,
  Stop и панель настроек (токен + список скилов). Кнопок-действий, которые кладут задачу в очередь,
  в виджете НЕТ с версии 2.1 — обработчик `HRTECH_ACTION` в `code.js` жив, но продюсера у него нет;
  дизайнер ставит задачу словами в терминале.
- **Bridge server** (`runtime/bin/bridge.mjs` у дизайнеров, `dist/local.js` при локальной отладке;
  MCP `figma-hrtech`): executes `figma_execute` (arbitrary Plugin API JS) in desktop Figma where
  YS Text loads — no cloud font wall.
- **Auto-runner** (`scripts/hrtech-watch.sh`): стартует из LaunchAgent при входе в систему. Держит мост
  живым (`hrtech-driver.mjs`), подключает знания (`link-knowledge.sh`) и опрашивает очередь — но очередь
  сейчас никто не наполняет (см. выше), поэтому Claude он на практике не запускает. Hard Stop работает.

## Editing rules to teach the system

1. Edit `claude/commands/hrtech.md` (task rules) or `claude/commands/hrds-knowledge.md` (component/pattern reference).
2. Bump the version в **ТРЁХ** файлах И **пересобрать бандл** — иначе виджет навсегда покажет «Починить движок»:
   - `figma-desktop-bridge/code.js` (`hrtechVersion`)
   - `figma-desktop-bridge/ui.html` (`hrtech-ver-badge`, `HRTECH_UI_VERSION`)
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
npm run build:server   # esbuild → runtime/bin/bridge.mjs — ЭТОТ файл коммитится и едет дизайнерам
npm run build:local    # tsc → dist/local.js — локальная отладка, dist/ в .gitignore
```

Правка в `src/` доезжает до дизайнеров ТОЛЬКО через `build:server` и коммит `runtime/bin/bridge.mjs`.
Не нужно ни для правок виджета (`figma-desktop-bridge/`), ни для правок правил и знаний.

## Distribution

`setup.sh` installs for a designer: проверяет node/claude → подключает готовый бандл
`runtime/bin/bridge.mjs` через `claude mcp add -s user` → спрашивает Figma-токен
(`~/.hrtech/figma-token`) → зовёт `scripts/link-knowledge.sh` (команды, база, скилы) → ставит
LaunchAgent автозапуска помощника. Ту же линковку делает кнопка «Починить движок» и старт помощника,
поэтому новый скил доезжает без действий дизайнера.
Plugin import: Figma → Plugins → Development → Import from `figma-desktop-bridge/manifest.json`.
See `ONBOARDING.md` (designers) and `HRDS-CONTRIBUTION.md` (how to extend HRDS itself).
