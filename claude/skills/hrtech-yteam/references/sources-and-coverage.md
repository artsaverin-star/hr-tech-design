# Источники, актуальность и покрытие

## Дата и статус

Карта составлена 13.11.2026 чтением кода. Локальная iOS-сборка — отдельное свидетельство
внешнего вида некоторых экранов, не проверка всех сценариев и не production-эталон.
Аналитика использования, персональная серверная конфигурация, актуальная App Store-версия,
флаги аккаунтов и полный Android navigation flow не исследовались.

Рабочая копия приложения: ветка `codex/yteam-mars-design`, HEAD
`fda04be97870ee0eda316477e6be211ecf60ab40` плюс незакоммиченные изменения.
Этот HEAD содержит наши эксперименты. Нельзя считать любой код без compile flag штатным:
например `WebService.mars` тоже добавлен в этой ветке.

Важные опорные файлы Home/Search/таббара сравнены с trunk
`8ba6216e693c34488f3ac21c670ddc5f1ddc9c29`. Совпадение исходников подтверждает базовое
поведение этих файлов, но не раскатку. Для Календаря кодпоиск имел индекс r22099273;
после поиска прочитаны сами файлы. Версия реально поставленной календарной статики не установлена.

## Где искать

| Продукт / слой | Корень в Аркадии | Начальная точка проверки |
|---|---|---|
| Мобильная оболочка Тим | `hrtech/mobile/yteam-app` | AGENTS.md; iOS TabsViewSystem, AppMainReducer; shared features |
| Календарь Maya | `yandex360/frontend/services/maya` | AGENTS.md; `client/features/app/components/TouchApp/TouchApp.tsx`, TouchEventForm; mobile docs |
| Профиль / Анкета | `hrtech/frontend/services/profile` | `src/components/AppRoutes/mobile/AppRoutes.tsx`, mobile widget models |
| Этушка | `hrtech/frontend/services/atushka` | `orbit/components/App/App.routes.tsx`; PostPage, NotificationsPage |
| Карты офисов | `hrtech/frontend/services/office-maps` | `src/app/lib/getRoutes.tsx`; booking search and process containers |
| Бенефиты | `hrtech/frontend/services/benefits` | `src/application/router`; user access mapper |
| Скидки | `hrtech/frontend/services/discounts` | `src/router.ts`; PageMain, DiscountDrawer |
| Мои встречи | `hrtech/products/efficiency_service/efficiency-service-www` | `src/app/model/WithAppRouterProvider/AppRouter.tsx`; pages/features/widgets |
| Веб-оболочка интранета | `hrtech/frontend/services/orbit` | layout/header/sidebar и контракт embedded/app; это не native оболочка Тима |
| Маршруты/сервисы интранета | `hrtech/products/orbit/orbit-configs` | routes.yaml/services.yaml; не путать с мобильным LM-каталогом |
| Пользовательские прототипы | `hrtech/products/prototipnitsa/prototipnitsa-www` | CONTEXT.md + текущий исполняемый сценарий; не доказательство production |

`APP_ROOT` означает первый корень таблицы; `ARC_ROOT` — корень доступного checkout.
На Mac этой задачи `ARC_ROOT=/Users/artsaverin/projects/hr-plugin/yandex-team-ios-research/workspace`.
На другой машине сначала найди checkout, не считай этот абсолютный путь обязательным.
Справочники могут сокращать Kotlin-префикс до
`shared/src/commonMain/kotlin/ru/yandex/team/app/shared/` — рядом указан alias.

Для поиска сначала используй известный файл/узкую папку. Если местоположение неизвестно,
используй `ya tool cs -l -F '<известный символ>'`, затем читай найденный источник.
Не обходи всю FUSE-Аркадию и не ищи текст внутри многомегабайтных bundled HTML/build/generated.
В рабочем checkout доступен `ARC_ROOT/ya`; старый alias ~/arcadia может отсутствовать.
Для исторической проверки используй read-only `arc show <revision>:<arcadia-path>`.

## Что означает покрытие

| Глубина | Области | Где описано |
|---|---|---|
| Путь в клиентском коде: данные/действие/экран/возврат/основные состояния | Home, Search, Services, нативные стеки, Gap, документы поездки, Pass, Settings, основные login/onboarding/push пути | home-search, calendar-people, services-shell |
| Мобильные компоненты и маршруты владеющего веб-продукта | Calendar Maya, профиль, материалы встреч | calendar-people, meetings-ai |
| Выборочный веб-проход: входы, маршруты, некоторые контейнеры/состояния | Этушка, Office Maps, Benefits, Discounts | services-shell; отдельные пробелы обозначены в секциях |
| Только вход/контракт назначения | Документница, OK, Helpy, некоторые виды трея/обучения/событий, внутренний полный процесс Trip | home-search/services-shell; читать owning service до изменения его сценария |
| Только интерфейс/контракт оболочки | Системный Passport UI/2FA, ОС-разрешения, часть native bridge, видео и аппаратные интеграции | services-shell; runtime не проверен |
| Эксперимент / мок | V5 Mars/Meetings, native preview adapters и размещение новых входов | meetings-ai; не переносить в базовую карту как выпущенное решение |

## Инвентаризация папок приложения

Все непосредственные feature-папки commonMain учтены ниже. Это контроль охвата областей,
не утверждение, что каждый метод и каждый серверный сценарий прочитан.

| Feature-папки | Пользовательская область / статус |
|---|---|
| `home`, `header`, `calendar`, `tray`, `approvals`, `badge`, `events`, `trip`, `announcements`, `lightning`, `banners`, `moodMap`, `vacations` | Главная и переходы к задачам. Глубокие web-операции отдельно; карта Home описывает видимость/назначение блоков |
| `search`, `person` | Поиск и данные сотрудника; интерфейс Анкеты принадлежит profile |
| `services` | Серверный каталог, formatter, переходы |
| `gap`, `changeStaffTimeZone` | Отсутствия/место работы и инфраструктура настройки timezone; не отдельная новая вкладка |
| `login`, `application`, `onboarding`, `settings` | Вход, lifecycle, вводные экраны и настройки |
| `pass` | Действие по специальному диплинку; не вся система пропусков |
| `aiAssistant` | Существующий условный баннер-вход AI; полный Mars не содержится в этой папке |
| `appVersions`, `hardUpdate`, `softUpdate` | Версии и обязательное/необязательное обновление |
| `appRating`, `assessment`, `surveys` | Оценка, обратная связь и опросы; отдельные data/trigger части не равны самостоятельному разделу |
| `clipboard`, `share`, `keyboard`, `confetti`, `error`, `staffCSRFToken` | Поддерживающие механизмы действий и состояний; не самостоятельные продуктовые сценарии |

Нативные feature-папки: `Tabs`, `HRWebView`, `MultiplatformScreen`, `SafariView`,
`LaunchScreen`, `LogoutAlert`, `Notifications`, `Onboarding`, `HardUpdateScreen`, `VPNScreen`,
`Surveys`, `AppRating`, `Buttefly`, `EditText`, `VconfPlayerViewController`, `IndoorNavigation`.
Они сопоставлены оболочке/восстановлению/настройкам или профильным сценариям; полный аудит
каждого bridge-метода, медиаплеера и аппаратного пути не выполнен.

## Локальные V5 и исходники задачи

Прототипы пользователя:

- [Марс V5](https://prototipnitsa.yteam.yandex-team.ru/prototypes/intranet-orbit-artsaverin-vstrecha-v-chate-mars-versiya-5/).
- [Мои встречи V5](https://prototipnitsa.yteam.yandex-team.ru/prototypes/intranet-moi-vstrechi-artsaverin-redaktirovanie-rasshifrovki-versiya-5/).

Их исходники относительно Прототипницы:

- `prototypes/intranet/orbit/mars-v-prostranstve/intranet-orbit-artsaverin-vstrecha-v-chate-mars-versiya-5`.
- `prototypes/intranet/moi-vstrechi/redaktirovanie-rasshifrovki/intranet-moi-vstrechi-artsaverin-redaktirovanie-rasshifrovki-versiya-5`.

Локальная копия этих прототипов: `hr-plugin/mars-manager-scenarios/release-arcadia`.
Build-only адаптеры, состояние сборки и артефакты: `hr-plugin/yandex-team-ios-research`.
`design-integration.json` описывает эксперимент, а не утверждённую продуктовую спецификацию.
Скриншоты с данными текущего аккаунта не копировать в распространяемый скилл.

## Как поддерживать карту

При новой задаче проверить только затронутые источники, настройки и путь. Добавить недостающий
переход/состояние в соответствующий справочник, указать дату и доказательство. Если ранее
сделанное утверждение оказалось экспериментом или устарело — исправить основной текст,
а не наращивать рядом взаимоисключающие советы. Новые пользовательские исследования и
аналитику обозначать отдельно от чтения кода. Не называть карту исчерпывающей, пока остаются
перечисленные границы удалённых сервисов и платформ.
