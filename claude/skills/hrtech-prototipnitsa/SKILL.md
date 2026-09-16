---
name: hrtech-prototipnitsa
description: Когда из спеки в Figma нужно сделать ЖИВОЙ прототип в Прототипнице — Arcadia-витрине прототипов HR Tech — или работать с самой витриной — «сделай прототип из спеки», «оживи макет в прототипнице», «заведи прототип», «подними прототипницу», «опубликуй прототип», «дай ссылку на Beta», «поправь существующий прототип». Учит устройству витрины, регламенту проекта и lifecycle-CLI, локальному запуску с четырьмя затыками, рецепту Figma → код на @yandex-int/hr-components, спек-манифесту src/spec.ts, конвенциям CONTEXT.md и SPEC-VS-PROD.md, публикации в PR + Beta. НЕ для чтения прода и поиска исходников — «как это на проде» — это hrtech-arcadia; НЕ для сборки борда-спеки в Figma (это hrtech-spec); НЕ для показа готового прототипа как спеки и переноса кода обратно в Figma (это hrtech-proto-spec).
---

## Примеры

- «сделай прототип из этой спеки»
- «оживи макет в прототипнице»
- «подними прототипницу локально»
- «опубликуй прототип и дай ссылку на Beta»

# Прототипница: Figma-спека → живой прототип

Здесь только направление Figma → код: что такое витрина, чей в ней устав, как её поднять и как
перенести спеку в работающий React-прототип. Как читать прод и разворачивать токены в числа —
hrtech-arcadia (словарь «компонент HRDS в Figma → компонент в коде» — его §6); ключи фигмовских
компонентов — `claude/commands/hrds-knowledge.md`; хелперы моста и правила работы с бордом —
`claude/commands/hrtech.md`; обратное направление (прототип как спека, код → Figma) —
hrtech-proto-spec.

## 1. Что такое Прототипница

Frontend-only витрина интерактивных прототипов HR Tech. Корень:
`~/arcadia/hrtech/products/prototipnitsa/prototipnitsa-www`. Стек — React 18 + Vite +
react-router-dom 7 + `@yandex-int/hr-components` (workspace-линк на
`frontend/packages/hr-components`); приложение обёрнуто в `HrdsSettings` и `LanguageProvider`.

**Масштаб — вся HR Tech, а не один продукт.** В витрине могут одновременно работать сотни
продуктов и дизайнеров. «Мои встречи» ниже — только проверенный референс реализации. Никогда не
подставляй его slugs, тексты, node-id или сценарии в другую задачу: block/product/feature/owner и
адреса Figma всегда берутся из привязанной MCP-сессии и текущего запроса пользователя. Реестр и lifecycle остаются
общими, а код и ассеты каждого прототипа изолированы его четырёхуровневым путём.

Канонический адрес — `https://prototipnitsa.local.yandex-team.ru:3000/`. **Запуск считается
успешным ТОЛЬКО после проверки этого URL курлом, а не после «команда стартовала».** Фолбэк
`start:localhost` существует, но молча сваливаться на него нельзя.

| Что | Где |
|---|---|
| код прототипа | `prototypes/<blockSlug>/<productSlug>/<featureSlug>/<prototypeSlug>/` |
| точка входа | `index.ts` прототипа — **ровно один default-экспорт** React-компонента (`PrototypeComponentProps` из `@prototypes/showcase-types`) |
| подхват | `prototypes/registry.ts`: `import.meta.glob('./*/*/*/*/index.ts')` + `React.lazy`; **slug = имя папки прототипа**, записи руками не добавляются |
| метаданные | `src/shared/model/data.ts` (blocks, products, features, people, prototypes; у прототипа обязательны `blockSlug`/`productSlug`/`featureSlug`/`ownerLogin`) |
| фуллскрин-роут | `/prototypes/:prototypeSlug` — вне `Layout`, без хрома витрины (`src/app/App.tsx`); URL стабилен при переносе папок |
| черновики | блок `experiment` (служебный продукт `experiments`) |

Витрина — лёгкие метаданные: страницы блоков/продуктов/людей НЕ импортируют код прототипов, код
грузится лениво только на фуллскрин-роуте. Тяжёлые ассеты держи рядом с прототипом, не в `src/`.

## 2. Чужой монастырь: контракт проекта читается ПЕРВЫМ

У Прототипницы свой регламент для агента, и он главнее привычек Булочки. Порядок чтения:
`AGENTS.md` → `.agents/README.md` → нужное из `.agents/rules/*` (`lifecycle-boundaries.md`,
`creator-flow.md`, `context-memory.md`) → `.agents/skills/*/SKILL.md`.

В `.agents/skills/` — **35 собственных агент-скилов** (на 09.2026): `setup-and-run`,
`create-prototype`, `continue-prototype`, `copy-prototype`, `edit-prototype`, `publish-changes`,
`hrds-figma-prototype`, `hrds-component-picker`, `hrds-component-checker`, `hrds-token-checker`,
`author-guide` и другие. **Этот скил их не подменяет — он велит их читать**: `creator-flow.md`
содержит таблицу «намерение → skill», выбирай по ней и соблюдай входные данные и критерий
завершения выбранного скила целиком, а не сокращай его до одной команды.

**Перед правками — полная ссылка на Startrek-тикет** вида `https://st.yandex-team.ru/ORBIT-0123`:
из неё берётся ключ для ветки, коммита и PR. Придумывать тикет нельзя; новая задача может
продолжать тот же slug и URL — копия нужна только для самостоятельной версии.

**Правка общей витрины (`src/`) — только по явной просьбе юзера.** Automerge включён только для
изменений в отдельных прототипах (`prototypes/a.yaml`); общий код (`prototypes/shared/a.yaml`)
идёт без него.

## 3. Lifecycle только через CLI

Сущности (блоки, продукты, фичи, прототипы, сотрудники) создаются и копируются **только** штатными
сценариями — CLI валидирует связи и пишет `data.ts` атомарно:

```bash
ya tool nots run prototype:create                          # новый прототип (строгий интерактивный flow)
ya tool nots run prototype:create -- -- --machine \
  --input-json /path/to/prototype-create.json --json       # headless: только существующая ветка сущностей
ya tool nots run prototype:copy                            # копия существующего
ya tool nots run prototype:check                           # metadata, иерархия, CONTEXT.md, registry, entry points
ya tool nots run prototype:context -- -- --slug <slug>     # цепочка CONTEXT.md блок→продукт→фича→прототип
ya tool nots run person:init                               # новый сотрудник
ya tool nots run block:split                               # разделить ПУСТОЙ рабочий блок
```

Обрати внимание на **двойной `-- --`** у `prototype:context`; агентский вариант — с `--agent-json`.

| НЕЛЬЗЯ руками | МОЖНО руками |
|---|---|
| создавать папки в `prototypes/*`, копировать/переименовывать/переносить/удалять прототипы | всё ВНУТРИ существующей папки прототипа: компоненты, экраны, моки, ассеты, стили, навигация |
| добавлять lifecycle-записи в `src/shared/model/data.ts`, править `people` | обновлять СУЩЕСТВУЮЩИЙ `CONTEXT.md` ближайшего уровня |
| создавать/переносить/удалять `CONTEXT.md` | опциональный `README.md` прототипа |
| менять `prototypes/registry.ts` ради прототипа | |

Нет нужного CLI-сценария (переименовать, заархивировать) — **остановись и опиши, какой flow нужен**,
а не подменяй его ручной правкой структуры.

## 4. Локальный запуск: порядок и четыре затыка

Дистиллировано из реального первого запуска (01.09.2026) — каждый затык останавливает его насмерть.

```bash
arc status                            # чекаут чистый? «Not a mounted arc repository» → сначала arc mount
arc pull --ff-only                    # на trunk
ya tool nots install --frozen-lockfile   # СТРОГО ДО make-my-env!
ya tool nots exec make-my-env         # .env, запись в /etc/hosts, certs/
ya tool nots run start                # держать процесс живым
curl -sS -o /dev/null -w "%{http_code}" https://prototipnitsa.local.yandex-team.ru:3000/
```

Успех = `200`, в теле `<title>Прототипница HR Tech</title>`; TLS проверяется без `-k`.

1. **`ya tool nots install` ПЕРЕД `make-my-env`.** `make-my-env` — бинарь из зависимостей; до
   install падает `Command "make-my-env" not found`. (У других сервисов hrtech порядок обратный —
   Прототипница исключение.)
2. **`/etc/hosts` принадлежит root** — `make-my-env` не может дописать
   `127.0.0.1 prototipnitsa.local.yandex-team.ru`. Лечится `sudo chown $USER /etc/hosts`, причём
   выполнять должен ЮЗЕР в настоящем терминале: из инструмента Bash sudo пароль не спросит
   («a terminal is required to read the password»).
3. **Сертификаты требуют skotty.** Ошибка `Invalid RSA signature. Make sure to use skotty`;
   обычный `ssh-add ~/.ssh/id_ed25519` НЕ помогает. Ставить skotty через **Self Service** (в
   публичном brew его нет; Self Service кладёт launchd-сервис со связкой с keychain). Затем юзер
   САМ запускает `skotty setup --any-keyring` — flow интерактивный, из пайпа падает `fail: EOF`;
   без флага skotty ищет только Yubikey. На маке без Yubikey выбор — Secure Enclave.
4. **ГЛАВНАЯ ГОЧА: `SSH_AUTH_SOCK` в уже открытом шелле.** Шелл, запущенный до установки skotty,
   смотрит в старый агент, и `make-my-env` снова падает на подписи. В той же команде:
   `export SSH_AUTH_SOCK="$HOME/.skotty/sock/default.sock"`. Проверка: `ssh-add -l` показывает
   ключи `Skotty key … on Secure Enclave`.

## 5. Рецепт: Figma-спека → живой прототип

Порядок шагов; спека читается инструментами Булочки, код собирается по уставу Прототипницы.

1. **Прочитать спеку.** `figma_pin_file` на файл спеки (иначе мост уйдёт за другим активным
   файлом) → борд читать ТОЛЬКО штатными хелперами `hrtechScan(nodeId, {maxTexts})` и
   `hrtechDiff` из `claude/commands/hrtech.md` — свой tree-walker и `findAll` по странице
   ЗАПРЕЩЕНЫ, они вешают мост → `figma_capture_screenshot` каждой зоны как визуальная правда:
   дамп текстов не показывает оверлеи и порядок слоёв.
2. **Тикет.** Запросить у юзера полную ссылку на Startrek (§2). Без неё ветку не начинать.
3. **Завести прототип** через `ya tool nots run prototype:create` (§3), в flow выбрать или создать
   фичу. Для unattended-задачи, где автор и существующие block/product/feature уже пришли
   типизированными параметрами, подготовить JSON с полями `ownerLogin`, `blockSlug`, `productSlug`,
   `featureSlug`, `title`, `description` и запустить официальный `--machine --input-json ... --json`.
   Machine-режим не создаёт новые сущности; при отсутствии любой из них остановиться и попросить
   интерактивный запуск. Руками папку не создавать. Дальше — только внутри созданной папки.
4. **Прочитать контекст**: `prototype:context -- -- --slug <slug> --agent-json` → вся цепочка
   `CONTEXT.md` от блока до прототипа.
5. **Собрать UI только на `@yandex-int/hr-components`** — по словарю HRDS↔код из hrtech-arcadia §6
   (поколения Hr*, сабпасы-импорты, `platform`-пропы) и по build-time скилам самой Прототипницы
   (`hrds-component-picker` → после сборки `hrds-component-checker`/`hrds-token-checker`).
   Свои палитры, размерные шкалы и локальные токены не вводить.
6. **Тексты — в `src/texts.ts` с источником КАЖДОЙ строки** в комментарии: i18n-ключ прода
   (`/** OCJrvu — подпись тумблера */`) или Figma node-id кадра спеки. Своих формулировок не
   писать — строки прошли редактора; чего нет ни в проде, ни в спеке — вопрос юзеру.
7. **Мок-данные кодируют матрицу состояний.** Фикстуры в `src/data.ts` — не декорация: каждый
   кадр спеки (пусто, ошибка, «идёт сборка», отозванный доступ…) должен быть достижим на живых
   данных. Базовый объект + точечные оверрайды на запись.
8. **Deep-link параметры для адресуемости**: каждое показанное в спеке состояние открывается
   URL-параметром (`?meeting=m4`, `?parity`), а не только кликами. Это же кормит спек-манифест.
9. **СРАЗУ сгенерить спек-манифест `src/spec.ts`** (контракт в §6) — не «потом допишем».
10. **Проверки**: `ya tool nots run lint:ts` → `ya tool nots run prototype:check` → живьём на
    `https://prototipnitsa.local.yandex-team.ru:3000/prototypes/<slug>` пройти все кадры манифеста.
11. **Публикация — только по просьбе юзера** (§8).

## 6. Спек-манифест `src/spec.ts` — нормативный контракт

Каждый прототип, собранный из спеки, несёт машиночитаемую карту своих состояний. **Имена полей —
контракт, отступать нельзя** (его параллельно документирует hrtech-proto-spec):

```ts
// <папка прототипа>/src/spec.ts
export interface SpecFrame {
    id: string;                    // строчные: 'feed', 'feed-empty', 'k1'…'k7', 'nda-open' …
    title: string;                 // подпись кадра — как «подпись экрана» на борде в Figma
    caption?: string;              // 1–2 строки: что происходит на шаге
    zone: string;                  // зона борда: 'Лента', 'Страница встречи', 'Вердикт NDA', …
    platform: 'desktop' | 'mobile';
    url: string;                   // относительный deep-link живого состояния: '?meeting=m4'
    figmaNodeId?: string;          // соответствующий кадр в Figma-спеке (напр. из секции 17204:1485215)
    next?: SpecTransition[];       // v4: переходы из кадра — для стрелок-связей
    status?: SpecStatus;           // v3: светофор кадра на борде (необязательное)
}
export const SPEC_FRAMES: SpecFrame[];
/** Переход из кадра: строкой (= {to}) или объектом. */
export type SpecTransition = string | {
    to: string;
    kind?: 'user' | 'system';  // system → ПУНКТИРНОЕ ребро (переход инициировала система, не клик)
    label?: string;            // подпись на ребре
};
// v4: пунктир/холст «Карты» (пан-зум) — hrtech-proto-spec §1–2.

// v3: светофор, ромбы-развилки и раскладка «Карты» — рендер описан в hrtech-proto-spec §1–2.
export type SpecStatus = 'ready' | 'wip' | 'question';
export interface SpecDecision {
    id: string;                                   // 'd-success'
    question: string;                             // «Получилось?»
    branches: { label?: string; to: string; tone?: 'yes' | 'no' }[]; // to = id кадра или ромба
}
export interface SpecZoneLayout {
    zone: string;                                 // точно как SpecFrame.zone
    spine: string[];                              // id кадров/ромбов слева направо
    rows?: { title?: string; from?: string; frames: string[] }[]; // from = id узла-источника на дорожке
}
export const SPEC_DECISIONS: SpecDecision[] = [ … ];
export const SPEC_LAYOUT: SpecZoneLayout[] | null = [ … ];

// v2: адрес спеки в Figma — из него борд строит ссылки на секцию и узлы кадров.
// Экспорт обязателен (SpecView импортирует его безусловно), но nullable:
// нет Figma-спеки → SPEC_FIGMA = null (аннотацию типа сохрани), ссылки не рендерятся.
export const SPEC_FIGMA: { fileKey: string; sectionId?: string } | null = {
    fileKey: 'QG9C7P7CoJdRwGePwPYRdx',      // файл-ветка «Мобильная версия v2» (подтверждён мостом)
    sectionId: '17204:1485215',              // корневая секция «Мои встречи · спека»
};
```

Режим показа: `?spec=1` на URL прототипа → вместо прототипа рендерится `SpecView`
(`src/SpecView.tsx` прототипа): тёмный борд, кадры — масштабированные ленивые `<iframe>` с
`src` = текущий pathname + `frame.url`, сгруппированы по зонам, у каждого подпись (`title`) +
`caption` + номер шага; клик/кнопка открывает живое состояние в новой вкладке. Это «реальный
прототип в виде спеки как в Figma» — сам режим и перенос в Figma разбирает hrtech-proto-spec,
здесь твоя обязанность — чтобы `SPEC_FRAMES` существовал и покрывал ВСЕ кадры спеки.
С v2 режимов борда два — «Сценарий» (`?spec`/`?spec=1`) и «Карта» (`?spec=map`); переключалка,
шаринг режима через URL и ссылки в Figma по `SPEC_FIGMA` — hrtech-proto-spec §2.
С v3 карта = граф по раскладке `SPEC_LAYOUT` (`null`/пусто → колонки как в v2), детали — hrtech-proto-spec §2.

## 7. CONTEXT.md и SPEC-VS-PROD.md

**`CONTEXT.md`** — память уровня (block → product → feature → prototype), создаёт его CLI, ты
только обновляешь существующий. Конвенция (образец —
`prototypes/intranet/moi-vstrechi/skvoznoy-stsenariy/intranet-moi-vstrechi-artsaverin-moi-vstrechi-skvoznoy-stsenariy/CONTEXT.md`):

- машиночитаемая шапка HTML-комментарием: `prototipnitsa-context:v1` + `level` / `slug` /
  `parent` / `priority`;
- разделы — закрытый список из `.agents/rules/context-memory.md` (белый список зашит в
  `scripts/prototype-structure.mjs`, чужой заголовок валит `repository-check` и сборку):
  optional — **Назначение** (одна фраза) · **Решения** (что и почему выбрано, с источниками) ·
  **Ограничения** (что осознанно не сделано / где отступили и почему) · **Открытые вопросы**
  (с именем и датой спросившего) · **Локальные инструкции**; обязателен ТОЛЬКО **Ссылки**
  (прямой URL, прод, тикет). Пункты списков — однострочные (тоже проверяется);
- только дельта уровня, без дублей родителя и без журнала действий; превышение ~8 пунктов
  в разделе / 4000 символов / 40 непустых строк — внутренний сигнал сжать, юзеру не показывается.

**`SPEC-VS-PROD.md`** — если прототип строится по существующему продукту, расхождения спеки с
продом собираются в таблицы (образец рядом с тем же CONTEXT.md). Минимум два раздела: «Править
спеку — прод прав» — колонки «Что · В спеке · На проде · Где в спеке», где «Где в спеке» —
**Figma node-id конкретного кадра**; «Впереди спека — прод догоняет» — колонки свои
(«Строка · В коде прода сейчас · В спеке (верно)»), без node-id. В образце есть и третий раздел
«Открыто у редактора» — открытые треды редактора, которые не чинят ни в одну сторону. Это готовая
задача на правку макетов, а не заметки на полях.

## 8. Публикация: PR + Beta

«Запушь», «создай PR», «покажи на Beta», «дай ссылку» — один полный сценарий скила
**`publish-changes`** Прототипницы: изменения в созданном/обновлённом Arcanum-PR по тикету, юзеру —
ссылка на PR, состояние стенда и ссылка на Beta:

```
https://pr-<PR-ID>-prototipnitsa.yteam.yandex-team.ru/prototypes/<prototypeSlug>
```

Commit или запушенная ветка без PR — не результат. Стенд ещё собирается — так и говорить
(«Beta готовится» + URL), не выдавать за готовый. Правки по фидбеку — в тот же открытый PR,
URL Beta не меняется.

## Гочи

- **Поиск по Аркадии — только `ya tool cs`**, никакого `grep -r`/`find` по `~/arcadia` (FUSE,
  обход не заканчивается). Карта двух корней фронтендов и флаги `cs` — hrtech-arcadia §1–2.
- **Пакетный менеджер — только `ya tool nots`** (`nots run`, `nots exec`). Прямой
  `npm`/`pnpm`/`yarn` ломает виртуальный стор; `node_modules` тут — симлинки в `~/.nots/nm_store`.
- **`timeout` на macOS нет** — не оборачивай им `ya`-команды.
- **Даты фикстур недетерминированы**: хелпер `at(daysAgo, hours, minutes)` в `data.ts` считает от
  «сейчас», чтобы группы дат были живыми, — скриншоты прототипа меняются день ото дня. Исключение —
  parity-режим (`?parity`): там фикстуры и дата зафиксированы из продовой сторис, иначе пиксельный
  дифф с эталоном бессмыслен.
- **Тексты выверены редактором — не перефразировать.** Сведение двух формулировок одного смысла —
  вопрос к редактору, а не к тебе; в `texts.ts` строка без источника в комментарии = кандидат
  на выдумку.
- **CLI-flow по умолчанию интерактивные** (`prototype:create`, `person:init`: completion по Tab,
  `:back`, `Esc`); из пайпа их не кормить. Единственное headless-исключение у `prototype:create` —
  полная комбинация `--machine --input-json <path> --json` со строгим JSON и только уже
  существующими автором/block/product/feature. `Ctrl+Z` в интерактивном flow — suspend процесса,
  а не «назад».
- **`prototype:check` не заменяет глаза**: он проверяет метаданные, иерархию и registry, но не
  то, что кадры манифеста реально открываются. Прогон deep-link'ов из `SPEC_FRAMES` — руками.
- **`a.yaml` не редактировать** — он генерируется (`.config/ci-gen/*` +
  `ya tool nots run generate:ci`).
- **Секретов нет by design**: сервис frontend-only, OAuth-токены и backend-секреты в `.env` не
  добавлять; локальный `.env` и `certs/` не коммитить.
