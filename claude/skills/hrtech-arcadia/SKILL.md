---
name: hrtech-arcadia
description: Когда нужно узнать, как что-то устроено НА САМОМ ДЕЛЕ в живом сервисе HR Tech — «как это сделано на проде», «найди исходники», «какой там текст на самом деле», «прототип должен совпадать с продом», «какие там состояния», «какие отступы», «какой это компонент в коде», «где лежит этот сервис», а также перед тем как придумывать тексты, состояния или размеры для продукта, который УЖЕ СУЩЕСТВУЕТ. Учит искать в Аркадии: карта фронтендов, кодпоиск, тексты, токены, эталонные скриншоты, соответствие HRDS↔React, оболочка интранета. НЕ для сборки борда (это hrtech-spec) и не для правки ДС-компонентов (это hrtech-audit).
---

## Примеры

- «как это сделано на проде»
- «прототип должен совпадать с продакшеном»
- «найди настоящие тексты этого экрана»
- «какие у этой таблицы состояния на самом деле»

# Аркадия как источник правды

ДС отвечает на вопрос «из чего собрать». Аркадия отвечает на вопрос «как это уже собрано»:
настоящие тексты, настоящий набор состояний, настоящие отступы и настоящие эталонные скриншоты.

**Главное правило: если продукт существует — тексты, состояния и цифры берём из кода, а не
придумываем.** Строки в интерфейсе прошли редактора; сочинить «примерно такую же» подпись —
это молча подменить редакторское решение своим. То же с состояниями: в коде их всегда больше,
чем помнит заказчик (скелетон, пусто-с-фильтрами против пусто-без-фильтров, ошибка догрузки,
отозванный доступ). Тот же запрет, что и в [[use-only-ds-components]], только про содержание.

**Второе правило, добытое болью: цифру разворачивай по сборке токенов, а не по картинке и не по
документации.** Этот скил уже дважды ловил себя на нарушении — сначала «`--hr-space-xl` = 40»
(померили по скриншоту; на самом деле 24, а 40 — это `3-xl`), потом «gap у ButtonGroup 4px»
(взяли из `.mdc`; на самом деле 8). Источник числа — только `Theme/build/*.css`.

## 1. Где лежит фронтенд

Два корня, и по имени продукта не угадать:

- `hrtech/frontend/services/<имя>` — фронтенд-монорепо, **99 сервисов**.
- `hrtech/products/<продукт>/` — продуктовая вертикаль целиком: бэк, гейтвей, балансер, воркфлоу,
  и рядом фронт, если продукт заводился недавно: `*-www`, `*-fe`, `*-client`, `*-web`, `*_frontend`.

**Порядок поиска:** сначала `ls ~/arcadia/hrtech/frontend/services/<имя>`, если нет —
`ls ~/arcadia/hrtech/products/<продукт>/`. Опирайся не на список бэковых суффиксов (их пишут как
попало: `review_be` и `review_awacs` через подчёркивание, `headcount-backend` вместо `-be`, сбоку
библиотеки вроде `hr-fincab-mail-lib`), а на **отсутствие фронтового**: нет ни одной папки
с `-www|-fe|-client|-web|_frontend` — значит фронт в `frontend/services`.

**Имя фронта может отличаться от имени продукта:** `products/hr-fincab` → `frontend/services/fincab`
(без `hr-`), `products/review` → `services/review-frontend`, `products/intfeed` → `services/feedback-new`.

**Имя папки ≠ имя продукта.** `orbit` = «Каркас», `career-int` = «Space»
(README: «Продакшен: https://space.yandex-team.ru»), `lms` = «Квант», `pnd` = hr-id,
`talent-www` = пакет `@yandex-int/pdp`, живёт по адресу `/track/*` (по имени не угадать),
`structurushka-www` лежит внутри `products/team_space/`.

`efficiency_service` — это **встречи** (страницы `meeting`, `meeting-list`, `meeting-summary`,
`meeting-transcript`). «Заметки» — только URL-сегмент `/notes/*` и дев-хост `local.notes.test`;
отдельных страниц заметок в сервисе нет. Самих строк «Мои встречи» / «Заметки» в коде тоже нет —
заголовок рисует оболочка (см. раздел 7).

**Карта прод-адресов.** В README сервиса прод-URL обычно есть (career-int, lms, review-frontend,
staff), но бывает и один `*.local` (trip, headcount). Полная машинная карта —
`hrtech/products/orbit/orbit-configs/src/configs/routes.yaml` (путь → `serviceKey`) плюс
`services.yaml` (ключ → `src.production` / `src.development`). **Ключ ≠ имя папки**, держи обе колонки:

| путь на yandex-team.ru | serviceKey | папка |
|---|---|---|
| `/notes/*` | `efficiency_service` | `products/efficiency_service/efficiency-service-www` |
| `/gap/*` | `gap-api` | `frontend/services/gap` |
| `/trip/*` | `trip` | `frontend/services/trip` |
| `/review/*` | `review` | `frontend/services/review-frontend` |
| `/quantum/*` | `quantum` | `frontend/services/lms` |
| `/space/*` | `space` | `frontend/services/career-int` |
| `/aai/*` | `aai` | `products/aai/aai_frontend` |
| `/continuous-performance/employee/*` и `/head/*` | `continuous-performance` | `products/continuous-performance/continuous-performance-www` |
| `/structure/*` | `structurushka` | `products/team_space/structurushka-www` |

Смотри блок `environment` у роута: `production` может быть закомментирован (так сейчас у `/space/*`) —
тогда путь живёт только на beta/testing.

**Страницы лежат по-разному.** `src/pages` — самое частое, но: staff → `src/bundles`, ok → `src/views`,
headcount и fincab → `src/components/Page*`, trip → `src/routes/Route*.ts`, profile → вообще
`index.desktop.tsx` / `index.mobile.tsx`. Единой карты роутов нет: в части свежих FSD-сервисов она
в `src/app/model/WithAppRouterProvider/AppRouter.tsx` (нашлась в 2 из 14 проверенных —
efficiency-service-www и continuous-performance-www), у остальных ищи `router.ts`, `src/routes/`
или роутер прямо в `App.tsx`.

**Фронта Календаря в hrtech нет.** `frontend/services/calendar` — только Playwright-тесты.
Ближайшее к встречам: `meeting-form` (форма события) и `confroom-www` (планшеты переговорок).

## 2. Как искать: `ya tool cs`, а не grep

`~/arcadia` — FUSE-монтирование, и рекурсивный обход по нему **не заканчивается**. Замеры на одном
запросе: `ya tool cs` по всей Аркадии — 0.2–0.35 с; `rg` внутри уже прогретого сервиса — 0.18 с;
`rg` по двум холодным сервисам — **12.2 с**. `arc grep` не существует вовсе.

```
ya tool cs -F 'Суммаризация всех встреч'        # по русской строке с экрана → код
ya tool cs -l -F 'AutoSummarizationSetting'     # по имени компонента → все файлы
ya tool cs -F 'Route path=' -f 'hrtech.*Router' # по роуту
```

Флаги: `-F` литерал, `-l` только имена файлов, `-f 'RE2'` фильтр по пути, `-x` исключить,
`-m all` снять лимит в 30 совпадений, `-i` без регистра, `-w` целые слова, `-C N` контекст,
`-E` только текущая папка. Регекспы — RE2 (без lookahead).

- `cs` ходит в сеть (codesearch.yandex-team.ru) и требует ya-токен. Без VPN — не работает.
- `cs` ищет **всю** Аркадию независимо от `cd`; ограничивай `-E` или `-f`.
- Номера строк — из индексированной ревизии, могут разойтись с рабочей копией. Путь доверяй,
  номер перепроверяй.
- Лимит 30 совпадений по умолчанию: без `-m all` легко решить, что «больше нигде не используется».

Запасной вариант без сети — `rg` **строго внутри одной папки сервиса**, после `cd` в неё.
Никогда не запускай `rg`/`find`/`grep -r` по `~/arcadia` или по `hrtech/` целиком.

**Что читать первым в незнакомом сервисе:** `AGENTS.md` — он есть только у ~17 сервисов из 99,
но если есть, там команды и запреты (`nots` вместо npm, `arc` вместо git), иногда и прод-URL →
`README.md` (есть у 84, прод-адрес чаще всего именно здесь) → `docs/` → `package.json`
(по зависимостям видно подход к текстам) → карту роутов.

## 3. Тексты: три разных устройства

Промахнуться легко — в одних сервисах текст лежит в `.tsx`, в других там только ключ.

1. **react-intl с хэш-ключами** (efficiency_service). Русский текст лежит **прямо в `.tsx`**:
   `intl.formatMessage({ defaultMessage: 'Суммаризация всех встреч', description: '…' })`.
   Ключ (`OCJrvu`) — хэш содержимого, меняется вместе с текстом.
   **Что генерируется, а что нет:** `lang/default.json` (скрипт `i18n:extract`) и `lang/compiled/`
   (`i18n:compile`) — сгенерированные. А `lang/ru.json` и `lang/en.json` — **НЕ генерируются**,
   это переводческие словари, вход для компиляции (в них 213 ключей против 199 в `default.json`,
   часть протухшая). **Бонус: в `lang/default.json` у каждой строки есть `description` —
   редакторский контекст «что это за надпись».** Лучший источник смысла.
2. **`typedI18nFactory`** (talent-www): у компонента папка `i18n/{ru.ts,en.ts,index.ts}` — именно
   `index.ts`, `.tsx` только у общей фабрики `src/utils/i18n/model.tsx`. В коде — ключ
   с неймспейсом: `i18n('leave_confirm.title')`.
3. **`@yandex-int/i18n` с именованными ключами** (Этушка, orbit, gap, trip): папки
   `<Component>.i18n/{ru,en}.ts`, ключи вида `'sort.default'`, поддержка рода через `key@gender`.
   Встречается и общий `src/commonI18n/{ru,en}.ts`.

**Поэтому по видимой строке ищи всегда глобально (`cs -F`), а не в файле компонента.** Обратный
путь: нашёл ключ → `cs -F "'<ключ>'"` → место применения.

Ловушка: длинный `defaultMessage` в коде может быть разбит переносом на две строки, и точная фраза
не найдётся. Бери короткий уникальный фрагмент без пробела на границе переноса.

## 4. Цифры: токены, а не пиксели со скриншота

Три шага: `<Component>.module.css` рядом с компонентом → там только токены → развернуть токен в число.

**Разворачивать по `hrtech/frontend/packages/hr-components/src/Theme/build/root.css`** — это
единственный полный источник, все размерные токены готовыми `calc()` от базы 8px.
`src/Theme/source/sizes.json` — вложенный токен-JSON и покрывает только space/padding/radius/border:
control- и icon-размеров, `border-width-l` и `radius-round` в нём нет, зато есть space 5xl/6xl,
которых нет в сборке. **`.mdc`-файлы — документация, а не источник цифр** (в `ButtonGroup.mdc`
до сих пор написано «4px» там, где в сборке 8).

- `--hr-space-*`: 2-xs 4 · xs 8 · s 12 · m 16 · l 20 · **xl 24** · 2-xl 32 · **3-xl 40** · 4-xl 48
- `--hr-size-control-*`: 2-xs 16 · xs 24 · **s 32 · m 40 · l 48** · xl 56 · 2-xl 64 — ровно
  фигмовские Size S/M/L
- `--hr-size-icon-*`: 2-xs 8 · xs 12 · s 16 · m 20 · l 24 · xl 28 · 2-xl 32
- `--hr-border-radius-*`: 4 · 8 · 12 · 16 · 20 · 24 · 32 + `round` 100px (в Figma общего токена
  скругления нет, в коде есть)
- `--hr-border-width-s|m|l` = 1 · 2 · 4
- Типографика — **только `build/typography.css`**: captionM 12/16 · bodyS 14/20 · bodyM 16/24 ·
  bodyL 18/28 · titleS 20/24 · titleM 24/28 · titleL 28/32 · displayS 32 · displayM 48 · displayL 64.
  `source/typography.json` протух: в нём `title.m` = 28 (в сборке 24) и `display.l` line-height 64
  (в сборке 68) — цифры оттуда брать нельзя. `-compact` line-height есть только у `body-s/m/l`
  (18/20/22), у caption, title и display их нет.
- Шрифт: YS Text везде, **YS Display включается не токеном, а компонентом** — шорткаты
  `--hr-font-display-*` собраны на YS Text, а `font-family: var(--hr-font-family-display)` стоит
  только в `src/Text/_typography/Text_typography_display{S,M,L}.css`. То есть YS Display даёт
  `<Text typography="displayM">`, а не токен.
- Цвет: семантика в `build/hrLight/color.css` и `hrDark/color.css`, примитивы в `build/colors.css`.
  Подтверждается контринтуитивное из [[ds-tokens-dark-theme]]: `surface-0` = серый `#F5F5F5`,
  `surface-100` и `surface-200` = белые. Цвет ИИ `--hr-color-special-ai` = `#F8604A` зашит в токен.

Брейкпоинты сервиса — обычно `src/app/styles/media.css` (в efficiency_service: mobile ≤639,
tablet ≤1023, далее до extra-large ≥1920).

## 5. Состояния: четыре источника, последний — картинки

1. **Презентационный компонент** — самый честный. Где нужны данные, соблюдается пара
   «`Comp.container.tsx` = данные, `Comp.tsx` = вёрстка» — но не везде: в efficiency-service-www
   так у 26 папок-компонентов из 95. Чисто презентационные (`Empty`, `NothingFound`,
   `TableSkeleton`, `MeetingInfoSkeleton`, `AccessRevokedState`) идут **без** контейнера, вёрстка
   прямо в `Comp.tsx` — не ищи для них несуществующий файл. Хвост JSX презентационного файла
   перечисляет весь набор: скелетон при загрузке, «ничего не нашлось» при пустом с фильтрами,
   «пусто» без фильтров, обёртка ошибки.
2. **`<Component>.stories.tsx`** — состояния перечислены экспортами; в `play`-сценарии видно, что
   должно происходить по клику.
3. **ЭТАЛОННЫЕ СКРИНШОТЫ ЛЕЖАТ ПРЯМО В РЕПОЗИТОРИИ.** Полный путь без сокращений:
   `<Component>.screens/<Стори>/autoscreenshot_light/light/linux-chrome/plain.png`
   (и `autoscreenshot_dark/dark/…`). Имя папки стори — транслитерированный display-name, а не имя
   экспорта. Сервис поднимать не нужно, сторибук не нужен: открываешь PNG из Аркадии.
   В efficiency-service-www это **318 PNG в 49 папках `*.screens`** — 149 стори из 48 файлов
   `*.stories.tsx` (284 картинки называются `plain.png`, остальные 34 — ховеры и клики со своими
   именами). **Для дизайнера это самый быстрый способ увидеть, как экран выглядит на самом деле.**
   У самой ДС аналогично, но на уровень глубже — промежуточную `<Comp>.tests/` не пропускай, иначе
   глоб не раскроется:
   `hr-components/src/<Comp>/<Comp>.tests/<Comp>.spec.{ts,tsx}-snapshots/<Comp>-<Стори>-<1|2>-chromium-linux.png`
   (96 папок, 1251 PNG; темы кодируются номером 1/2, а не папкой).
4. **Фиче-флаги** — часть состояний спрятана за ними: `docs/feature-flags.md` +
   `src/shared/lib/featureFlags/featureFlagDefinitions.ts`. Экран, которого «нет на проде», может
   просто ждать флага.

## 6. ДС в коде: `@yandex-int/hr-components`

Исходники — `hrtech/frontend/packages/hr-components` (версия 13.4.0), документация — hrds.yandex-team.ru.
Дополняет [[hrds-knowledge]]: там фигмовские ключи, здесь — как это же называется в коде.

- **Рутового экспорта нет.** `import { Button } from '@yandex-int/hr-components'` не соберётся —
  только сабпасы: `@yandex-int/hr-components/HrButton` (153 ключа в `exports`, ключа `"."` среди них нет).
- **Две поколенческие ветки.** Папки с префиксом `Hr` — HrBadge, HrButton, HrInput, HrNumberInput,
  HrSelect, HrSuggest, HrTable, HrTag, HrTagGroup, HrTextarea — **новее**; одноимённые без префикса —
  прежнее поколение. Формального `@deprecated` в коде нет, правило зафиксировано в
  `tools/mcp/rule/hr-components.mdc`: «не останавливайся на первом найденном, обычно более новые
  имеют префикс Hr». У `HrInput` одноимённой пары нет вовсе — старые аналоги называются
  `Textinput` / `InputBase`.
- **Имя экспорта ≠ имя папки:** `HrButton` отдаёт `Button`, `HrTag` → `Tag`, `Menu2` → `Menu`,
  `HrSuggest` → `Suggest`, `HrTagGroup` → `TagGroup`, `HrBadge` → `Badge`.
- **Готовый ответ «какие у него пропы»** лежит не в типах, а в memory-bank: **64 файла**
  `src/<Папка>/<ИмяЭкспорта>.mdc` — таблица «prop / type / default / описание» плюс сценарии
  и антипаттерны. **Имя файла — по ЭКСПОРТУ, не по папке:** `HrButton/Button.mdc`, `HrTag/Tag.mdc`,
  `HrSuggest/Suggest.mdc`, `HrTagGroup/TagGroup.mdc`, `HrBadge/Badge.mdc`, `Menu2/Menu.mdc` —
  по шаблону `<Comp>/<Comp>.mdc` шесть самых ходовых не найдутся. И помни: `.mdc` — документация,
  числа сверяй с `Theme/build/root.css`.
- **Мост с Figma** — `src/<Папка>/<ИмяЭкспорта>.figma.tsx` (Code Connect): прямо перечисляет, какой
  вариант макета чему равен в коде. Подключено 11 компонентов: Accordion, Checkbox, HrButton,
  HrInput, HrNumberInput, HrTextarea, Icon (все глифы), Link, Menu2, Spinner, Switch.
  Осторожно: **дефолты замапплены в `undefined`** — отсутствие пропа значит «в Figma стоял дефолт»,
  а не «вариант не поддержан». Файл HRDS-компонентов — `BodHDPKvwUYhWM5XDahMja`,
  иконок — `R6Uj5cjBIjP4kTaQ5uRufC`.
- **Фигмовский «вариант» часто = значение пропа, а не отдельный компонент.** Input Password/Mail/
  Search/Phone = `type` у HrInput. Tag Dropdown/Toggle/Status/User = `type` у Tag. Icon Button =
  `Button` с `icon` и без `children`. Button Toggle = `isChecked`. FileUpload vs Dropzone = `inputView`.
- **Мобильные варианты — это проп `platform`**, а не отдельный компонент. `Drawer [mobile]` =
  `Drawer` с `direction="bottom"`; `Dropdown platform="mobile"` сам рендерит Drawer; у `ModalLayout`
  `platform` обязателен.
- **Оверлеи — контейнер + шаблон:** Dialog = `Modal` + `DialogLayout`, Modal = `Modal` + `ModalLayout`,
  `Popup` — низкоуровневый позиционируемый контейнер под всем остальным.
- **Таблиц две:** `Table` (презентационные ячейки, но собраны на легаси Tag и Button) и `HrTable`
  (виртуализированная, колоночная модель, фильтры).
- **Чего в коде НЕТ:** `Mark` (оценки ревью), `Tree-View`, отдельного `MultiSelect`, отдельного
  `Filter`, `Table Column Settings`. Если задача про них — в коде опереться не на что.
- **Чего есть в коде, но нет в hrds-knowledge:** семейство `AI` (AIBadge/AIBanner/AIButton/
  AIChatDrawer), `isThinking` у Button и Text, `Onboarding`/`StartPopup` (фигмовский Tour),
  `Stepper`, `CalendarTimeline`, `Messenger`, `Pagination`, `TabsMenu`.
- **Мелкие расхождения, о которые спотыкаешься:** `isDisabled` у одних, `disabled` у других;
  у `Dropdown` дефолтный триггер **hover** (в макетах — клик, почти всегда нужен `trigger="click"`);
  `captionS === captionM` и `labelS === bodyS` дают идентичный CSS; высота ячейки таблицы
  s/m/l = 40/48/56 (48 в hrds-knowledge отсутствует). А вот `gap` у ButtonGroup расхождения **не**
  даёт: единственное значение `'m'` = `--hr-space-xs` = 8px, как в Figma.
- **«Одна дизайн-система» на практике — восемь версий одновременно**, от 6.4.2 до 13.x. Прежде чем
  ссылаться на компонент, посмотри, какая версия у нужного сервиса в `package.json`.

## 7. Оболочка интранета: её рисует Orbit, а не ДС

Частый вопрос «почему на макете есть меню, а в прототипе нет». Ответ: рамку yandex-team.ru рисует
отдельный сервис `hrtech/frontend/services/orbit` («Каркас»), точка сборки —
`src/pages/layout/ui/Layout/Layout.tsx`: `SidebarContainer` в левой грид-колонке, `HeaderContainer`
и `Outlet` внутри `div.OrbitAppContent`; при `orbitRemoteSdk.isApp` оболочка не рисуется вовсе.
**В `hr-components` бокового меню НЕТ** — ни `Sidebar`, ни `NavMenu`, ни `SideNav`. Есть только
`PageHeader`, `IntranetSearch`, `Services`/`AllServices`, `PageFooter`.

- **Левое меню:** 300px развёрнуто, **64px компактно** (`--sidebar-width` в
  `shared/ui/Layout/GlobalStyles.module.css`, модификатор `.OrbitAppCollapsed`), 0 при ≤639px —
  там меню превращается в `Drawer direction="left"`. Фон не белый: `--hr-color-surface-team`
  `#f8f3f3` (тёмная тема `#171212`) — **это локальная переменная Orbit**, а не токен HRDS,
  в `hr-components/src/Theme` её нет, префикс `--hr-` обманывает.
- **Важная поправка к макетам:** развёрнутое меню по умолчанию только на экранах **≥1512px**.
  `getScreenSizeFromWidth`: `width < 1512 → COMPACT_DESKTOP` → `ViewMode.COMPACT`, и
  `$isCompactSidebar` стартует в `true`. То есть **на каноническом кадре 1440 человек видит
  свёрнутое меню 64px**, а рейл 300 — это уже осознанно раскрытое им состояние (пишется
  в localStorage).
- **Шапка: 72px** — константа `HEADER_HEIGHT` в `Layout.const.ts`, в CSS она приезжает переменной.
  `padding 16 24`, фон `surface-100`, нижняя граница — не бордер, а `box-shadow: inset 0 -1px 0`.
  Слева хлебные крошки (на мобилке бургер), справа поиск 320px (на ≤1023px — 280px) с плейсхолдером
  «Поиск» и колокольчик с бейджем (aria-label «Уведомления, N непрочитанных», при нуле — просто
  «Уведомления»; бейдж от 1000 показывает «999+»). **Аватара в шапке нет** — он в левом меню.
  Мессенджера в шапке Orbit тоже нет.
- **Структура меню сверху вниз:** шапка меню (круглое лого 40×40 + переключатель пространства) →
  «Поиск» с тегом `⌘+K` (на Windows/Linux тот же тег показывает `Alt+K` — `shared/lib/os/keyboard.ts`) →
  «Все продукты» → профиль пользователя → Divider → список сервисов → Divider → «Cвязаться с нами»,
  «Настройки», кнопка сворачивания. Активный пункт — белая «таблетка» `surface-100` на бежевом.
- **Список пунктов меню в коде не зашит** — приходит с бэка Layout Manager и меняется без релиза.
  Единственный полный набор с русскими подписями — аварийный фолбэк
  `shared/lib/const/pumpkinWidgets.ts`.
- **Контракт микрофронта узкий:** страница получает `appContainer` и `modalContainer`, а оболочке
  отдаёт крошки через `setHeaderOrbit`. `useBreadcrumbs([])` значит «своих крошек нет» — оболочка
  всё равно покажет крошку с названием сервиса, которое достаёт сама. Поэтому в коде страницы
  заголовка «Мои встречи» нет и искать его там бесполезно.

## 8. Чего из Аркадии НЕ брать

- **Стиль кода и архитектуру** — это чужая зона, дизайнерская задача так не решается.
- **Бэкенд, секреты, токены** — в прототипы и макеты не тащим.
- **Сгенерированные файлы** как источник истины: `lang/compiled/*`, `src/shared/api/generated/*`
  (например `review-frontend/src/shared/api/generated/review-gw` — «generated by Openapi Generator»,
  весь под `//@ts-nocheck`), `openapi.d.ts`, `a.yaml` («autogenerated by @yandex-int/ci-gen»).
  Правки в них перезатрутся. А вот `lang/ru.json` — НЕ генерируется, см. раздел 3.
- **Устаревшие сервисы** — femida-old, `services/pnd` при живом `products/pnd/hr-id`. Прежде чем
  копировать решение, проверь по `routes.yaml`, что именно этот сервис отвечает на проде.

## 9. Грабли

- Рекурсивный обход `~/arcadia` не завершается. Только `cs`, точечный `ls`, и `rg` внутри одной
  прогретой папки сервиса.
- `node_modules` и `dist` в hrtech-пакетах — **симлинки** в `~/.nots/nm_store`, а не папки в Аркадии.
  У большинства сервисов `node_modules` просто нет. Чтобы посмотреть, что внутри пакета, иди в
  `hrtech/frontend/packages/<pkg>/src`, а не в зависимости.
- Пакетный менеджер только `ya tool nots` (есть обёртки `nots npm` / `nots pnpm` / `nots bun`).
  Прямой `pnpm`/`npm`/`yarn` в рабочем checkout ломает виртуальный стор. Единственное
  задокументированное исключение — в README Orbit («Локальная e2m-сборка через pnpm»), и оно требует
  ОТДЕЛЬНОГО чистого checkout: команда сама падает, если находит симлинки Nots.
- Для чтения кода, текстов, отступов, состояний и эталонных скриншотов **сервис поднимать не надо
  вообще** — всё лежит файлами. Запуск нужен, только чтобы покликать живьём.
- Если всё же надо: `ya tool nots exec make-my-env` (`.env`, hosts-алиас, сертификаты) →
  `ya tool nots install` → `ya tool nots run start`. `nots exec` — это алиас `nots pnpm` (dlx),
  пакет тянется на лету, поэтому предварительный install ему не нужен и README Orbit ставит
  make-my-env первым шагом. Исключение — Прототипница: там `make-my-env` берётся из зависимостей
  и install обязателен ДО него, см. [[prototipnitsa-local-setup]].
- `timeout` на macOS нет — не оборачивай им `ya`-команды.
