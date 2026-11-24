# Календарь, сотрудники и доступность в YTeam

Проверено чтением исходников 13 ноября 2026. Это карта возможностей конкретного checkout, а не доказательство раскатки в production. Ветка YTeam содержит локальные эксперименты Mars/V5; её HEAD нельзя называть эталоном production. Эффективные серверные конфиги, права аккаунта и версия доставленной веб-статики отдельно не проверялись.

## Три источника, которые нельзя смешивать

Все пути ниже отсчитываются от `/Users/artsaverin/projects/hr-plugin/yandex-team-ios-research/workspace/`. В ссылках A на Kotlin опущен префикс `shared/src/commonMain/kotlin/ru/yandex/team/app/shared/`; пути iOS начинаются с `iosApp/`.

- **A — оболочка YTeam:** `hrtech/mobile/yteam-app/`. iOS — `iosApp/Calendar/Features/Tabs/Calendar`; общие сценарии — `shared/src/commonMain/kotlin/ru/yandex/team/app/shared/`.
- **M — настоящий фронтенд Календаря (Maya):** `yandex360/frontend/services/maya/`. Корпоративный и внешний календарь разделяют код с условиями `isCorp`, `isYteamApp`, `isYteamNewEventForm`, `isMobileApp` и флагами. Папка `hrtech/frontend/services/calendar` содержит тесты, это не фронтенд сервиса.
- **P — Анкета сотрудника:** `hrtech/frontend/services/profile/`. Мобильный профиль — React/HRDS с серверным составом виджетов, встроенный в native-стек. Профиль не реализован целиком нативным экраном YTeam.

M найден точечным кодпоиском `ya tool cs -l -F TouchGridNewEvent` (индекс r22099273), затем файлы прочитаны локально. При изменении M сначала читать его AGENTS и профильные документы. Упомянутый в M AGENTS скилл `agent-workflow` отсутствует в проверенной локальной `.ai/skills`; это не основание выдумывать его правила или менять приложение.

`MARS_DESIGN_PREVIEW` — отдельная экспериментальная ветка поведения. A `TabsViewDeeplinkReducer.swift` в `.onOpenUrl` распознаёт `PrototypeV5Kind`, а в `openBrowser` перехватывает сервисы `aai`/`mars` и соответствующие URL, если `isDesignPrototypeAvailable`. Это открывает локальный V5 через `openDesignPrototype`; обычные календарные и Gap-сценарии ниже описаны отдельно от этих перехватов. Отсутствие macro около обычного кода подтверждает лишь конфигурацию исходника, не его раскатку.

## Смысл основных объектов

**Событие календаря** — договорённость о времени, участниках, месте/видеосвязи и доступности. **Статус/отсутствие** — когда и откуда человек работает, отсутствует или доступен. **Материалы завершённой встречи** — запись, расшифровка, итоги; в текущем эксперименте это отдельный V5, а не данные существующего CalendarWidget.

На Главной список «N встреч» составлен из `currentEvents + nextEvents`, сообщает о текущих и ближайших событиях. В его DTO нет контракта готовности расшифровки/итогов. Поэтому привязать произвольный V5 `m3` к реальному календарному событию нельзя. В исходниках M уже есть настройка автосуммаризации Телемоста, но это не доказательство готовности материалов конкретного события и не контракт связи с V5.

Источники: A `features/calendar/ui/CalendarFormatter.kt::format`, `features/calendar/domain/HomeCalendarWidgetData.kt`; M `client/features/eventForm/components/TouchEventTelemostSummarizationField/TouchEventTelemostSummarizationField.tsx`.

## Входы и возвраты календаря

| Сценарий | Вход → действие → результат → возврат | Подтверждение |
|---|---|---|
| Посмотреть свой план | Вкладка Календарь → стартовая страница Maya → день или список расписания, в зависимости от настройки → вкладка остаётся Календарём | A `iosApp/Calendar/Features/Tabs/Calendar/Tab/CalendarTabView.swift`, `CalendarTabSystem.swift`; M `client/features/app/components/TouchApp/TouchApp.tsx::routerConfig` |
| Открыть ближайшее событие с Главной | Нажать строку события → `${calendar}/event/<id>` → календарная карточка в текущем стеке → возврат в исходный контекст Главной | A `features/home/ui/HomeViewModel.kt::onCalendarClick`; `iosApp/Calendar/Features/Tabs/TabsView/Reducer/TabsViewDeeplinkReducer.swift::openCalendar` |
| Открыть расписание с Главной | Нажать заголовок календарного виджета → корневой календарный URL → календарь внутри текущего стека | Те же источники; заголовок передаёт `event=null` |
| Открыть событие извне | Deep link / push → выбор Calendar-tab; непустой путь кладёт карточку в стек → закрытие карточки; корневой URL очищает путь Calendar-tab | A `TabsViewDeeplinkReducer.swift::openCalendar`, `CalendarWKWebView.swift` обработчик `close` |
| Перейти из карточки календаря в связанный сервис | Веб-экран отправляет `externalLink` → native deeplink-router выбирает приложение/сервис → возвращение зависит от владельца текущего стека | A `CalendarWKWebView.swift::addDelegate`; M `client/utils/applicationInterface` |
| Вернуться из специальной карточки | Если CalendarWebView создан с `customURL`, `close` вызывает `goBackInCurrentTab`; если карточка открылась внутри корневого календаря, загружается стартовый URL | A `CalendarWKWebView.swift`, обработчик `close` |

Не ставить второй глобальный Back поверх уже существующего Back веб-экрана без разделения ответственности. В календаре уже есть контракт «закрыть текущий web-сценарий» vs «вернуться в native-стек». Он отличается от навигации V5 и должен быть сохранён.

## Мобильные сценарии Maya

| Работа пользователя | Что действительно есть в коде | Условия и состояния | Основные исходники M |
|---|---|---|---|
| Выбрать день, посмотреть занятость | Дневная сетка, свайпы между днями, выбор даты через date-input, кнопка «Сегодня», переход в событие | На смене дня загружаются события; есть loading и offline-bar; создание скрывается в readOnly | `client/features/grid/components/TouchGrid/TouchGrid.tsx`, `TouchGridHeader/TouchGridHeader.tsx`, `TouchGridDay` |
| Посмотреть расписание своё/коллеги | Отдельный TouchSchedule; `/schedule`, `/schedule/:login`; чужой профиль ведёт сюда | Корневой экран выбирается `isScheduleEnabled`. `/week`, `/month` в мобильном TouchApp перенаправляются на `/`, а `/week/:login`, `/month/:login`, `/person/:login` — на `/schedule/:login` | `client/features/app/components/TouchApp/TouchApp.tsx`; `client/features/schedule/components/TouchSchedule`, `TouchScheduleRange` |
| Найти событие | Внутренний календарный маршрут `/search`, TouchSearchSuggest; вариант шапки с поиском | `isSearchEnabled`; это поиск событий внутри календаря, не универсальный Search-tab Тима | `TouchApp.tsx`, `client/features/grid/components/TouchGrid/TouchGrid.tsx::_renderHeader`, `client/features/search/components/TouchSearchSuggest` |
| Создать событие | Кнопка «+» → `/event` → `EventFormCreateContainer` → TouchEventForm → сохранение | В YTeam-ветке `isYteamNewEventForm` передаёт переход в host через `externalLink`; в другой ветке меню EventType.User/Task. Это разные конфигурации, не надо обещать обе текущему пользователю | `client/features/grid/components/TouchGridNewEvent/TouchGridNewEvent.tsx`; `client/features/events/components/TouchEventPage/TouchEventPage.tsx` |
| Прочитать и изменить событие | `/event/:id` → просмотр → редактирование → submit; название, описание, время, весь день, участники, организатор, календарь/цвет, место, вложения | `readOnly`, `canEdit`, `canInvite`, `canChangeOrganizer`, `hiddenElements`, тип события; есть отдельные NotFound/Error/Loading | `client/features/events/components/TouchEventPage/TouchEventPage.tsx`; `client/features/eventForm/components/TouchEventForm/TouchEventForm.tsx` и одноимённые поля |
| Ответить на приглашение | Yes / Yes online / Maybe / No; принятие или отказ имеют свои модальные сценарии | Online-кнопка только при `enableYesOnlineDecision`; действия зависят от `canAccept/canReject`, readOnly и текущего решения | `TouchEventDecisionButtons`, `TouchEventDecision`, `TouchEventDecisionAcceptModal`, `TouchEventDecisionRejectModal` в `client/features/eventForm/components/` |
| Изменить повторяющееся событие / серию | Выбор области изменения; режим редактирования, диалог серии, удаление события/серии | `isSeriesActionsEnabled`, `isSeries/isRecurrence`, scope, `canDetach`; выход из dirty-формы имеет подтверждение отмены | `TouchEventForm.tsx`, `TouchEventSeriesEditDialog`, `TouchEventEditingModeDialog`, `TouchEventFormDelete`; `docs/series.md` |
| Найти переговорную | Поле ресурсов → TouchResourcesPicker → добавить/удалить переговорку; просмотр карточки комнаты | `canEdit/canInvite`, ограничение добавления, область серии; ошибки ресурсов показываются пользователю; есть autofit-ветка | `TouchEventResourcesField`, `TouchResourcesPicker`, `client/features/roomCard/components/TouchRoomCard` |
| Добавить видеовстречу | Включение Telemost; существующая ссылка; параметры доступа/комнаты ожидания | Domain config enableTelemost/enableZoom, наличие ссылки, загрузка user info, readOnly и права; `TouchEventRoomField` — **комната ожидания Телемоста**, не офисная переговорная | `TouchEventVideoField`, `TouchEventTelemostField`, `TouchEventRoomField`; `TouchEventForm.tsx::_maybeRenderVideo` |
| Включить автосуммаризацию Телемоста | Переключатель `isAutoSummarizationEnabled` | Только `enableSummaryByTelemostInfo`, наличие `addTelemostLink` и `canUseSummarization`; редактирование ограничено Telemost permissions. Подтверждена настройка, не выдача готового summary/записи | `TouchEventTelemostSummarizationField/TouchEventTelemostSummarizationField.tsx`, `TouchEventForm.tsx::_maybeRenderTelemostSummarization` |
| Настроить напоминания | Список напоминаний с временем и каналом; редактирование через TouchNotificationsField | Мобильный канал может быть недоступен; интерфейс объясняет необходимость обновить приложение или включить уведомления; для scope=future есть ограничение редактирования | `TouchEventNotificationsField`, `client/features/notificationsField/components/TouchNotificationsField` |
| Указать занятость и видимость | Busy/Available; кто видит событие | «В организации» добавляется только B2B; обычный набор everyone/participants. Режим календаря free влияет на показываемую занятость | `TouchEventAvailabilityField`, `TouchEventVisibilityField` |
| Написать участникам / скопировать ссылку | Отдельные действия TouchEventFormWriteInvitees и EventCopyLinkButton | Передача внешнего mailto/URL в native host; доступность зависит от текущей формы | `TouchEventForm.tsx`, `TouchEventFormWriteInvitees`; `docs/mobile-mail.md` |
| Управлять отображаемыми календарями | Боковое меню календаря: свои календари, подписки, праздники/интересные календари, настройки, задачи, помощь | Флаги влияют на пункты; account management/desktop mode/logout скрываются в mobile app. Нельзя путать это меню с Services-tab Тима | `client/features/aside/components/TouchAsideMenu/TouchAsideMenu.tsx`, `TouchAsideLayers`, `TouchEditLayer` |

Указанные компоненты Touch относятся к mobile-web, встроенному в iOS; это не обещание наличия всех режимов на текущем аккаунте. Не переносить desktop-возможности Maya (например week/month) в описание мобильного Тима автоматически. Шаблон M использует ORB/свои UI-компоненты; унификация новых HR Tech экранов через HRDS не означает замену всей существующей календарной оболочки.

## Сотрудник и рабочая доступность

| Сценарий | Вход → действие → результат | Условия / возврат | Источник |
|---|---|---|---|
| Найти человека и открыть профиль | Search result или частый контакт → `staffOrbit/<login>` → мобильная Анкета | Native-service stack текущей вкладки; Home-аватар открывает свой `/profile/<login>`; конкретный host преобразуется service config | A `features/search/ui/SearchViewModel.kt::onItemClick/onContactClick`; `features/home/ui/HomeViewModel.kt`; `services/WebServiceUseCase/WebService.kt::profile` |
| Связаться с человеком | Профиль → «Написать» в основном мессенджере, рабочая почта, телефоны, другие контакты | Набор зависит от доступных контактов; основной мессенджер Telegram/Telemost; контакты редактируются отдельной формой согласно доступности | P `src/components/Contacts/mobile/Contacts.tsx` и `.container`; `src/models/staticWidgets/contacts` |
| Посмотреть подразделение, команды, QR и фото | Из профиля → отдельные мобильные маршруты departments/vteams/qr/gallery → обратно в профиль/host | Это реальные маршруты, но видимость конкретных кнопок и данных зависит от payload и прав | P `src/components/AppRoutes/mobile/AppRoutes.tsx`, `src/models/routes/mobile/init.ts` |
| Понять, когда коллега свободен | Виджет расписания профиля → `/schedule/<login>` → TouchSchedule | Таймзоны владельца и наблюдателя разделены; по умолчанию выбран tz наблюдателя | P `src/models/staticWidgets/calendar/mobile/init.ts`; `ProfileCalendar.container.tsx` |
| Назначить встречу с коллегой | Профиль → создать встречу → `${calendar}/event?invited=<login>` | В своей анкете URL без invited; возвращение через host nav stack | P `src/models/staticWidgets/calendar/mobile/init.ts::openCreateMeetingPageEvent` |
| Перейти в событие/видеозвонок из профиля | Событие → nav stack; конференция → внешний URL; копирование → clipboard/toast | Не смешивать запуск видеосвязи с просмотром записи завершённой встречи | P тот же файл, `onMeetingClickEvent/onConferenceClickEvent/onCopyEvent` |
| Понять статус человека | Статус Анкеты: актуальная встреча / отсутствие / место работы | MEETING показывается только в интервале события (для all-day — в дату); периодическое обновление и фокус страницы; office-prompt только owner и по условиям workMode/VPN/данных | P `src/models/staticWidgets/status/mobile/init.ts` |
| Создать/изменить отсутствие | Действие статуса → drawer, native Gap или web Gap в зависимости от SDK contract | `<6`/не-app — drawer; `6` — native; `>=7` — webview. Native YteamAppConfig здесь объявляет `version="7"`: нельзя описывать все действия актуального профиля как нативные | P `src/models/staticWidgets/status/mobile/init.ts`; A `iosApp/Calendar/Features/HRWebView/Services/AppConfig/YteamAppConfig.swift` |

Профиль собирается layout manager (`core.stores.$layoutSlug`/виджеты), поэтому нельзя обещать один и тот же набор блоков всем сотрудникам. `PersonRepository` в shared — источник данных человека, не каталог всех сценариев мобильной Анкеты.

## Нативный Gap: возможности существующего контракта

Эти экраны существуют и доступны по native router. Текущий мобильный профиль с contract >=7 чаще отдаёт web Gap; перед доработкой определить реальный вход, а не автоматически править KMP-форму.

| Работа | Маршрут и результат | Существенные состояния |
|---|---|---|
| Выбрать тип статуса | `yteam://gap/create[/<login>]` → GapList → форма | Список: отсутствие, удалённая работа, работа в офисе, отпуск, отгул, болезнь, учёба, командировка. Командировка передаётся отдельному trip-сценарию |
| Создать отсутствие/режим работы | Тип → EditGap; даты, комментарий и поля конкретного типа → Создать → toast → два Back (форма + выбор типа) | Пользователь по умолчанию текущий, возможно целевой login; это не доказательство разрешения редактировать любого сотрудника |
| Изменить статус | `yteam://gap/edit/<numericId>` → загрузка статуса и config владельца → Сохранить → toast → один Back | Loading/Error/Loaded; повтор загрузки, отсутствие сети |
| Повторяющаяся удалёнка/офис | Повтор каждую неделю, дни недели, конечная дата повторения | Для OfficeWork: выбор офиса и «забронировать место»; offices и subscriptions приходят в config |
| Удалить статус | Удалить → подтверждение → действие → возврат | Для повторяющейся удалёнки/офиса выбор удалить одно или все; обычный статус — одно подтверждение |
| Выбрать офис | Отдельный SelectOffice → актуальный config → выбор → возврат в форму с обновлённым officeId | Loading, Success, Error с повтором загрузки |

Различия полей: у отсутствия — весь день; у отпуска — доступность на связи, за свой счёт, учебный; у болезни — доступность и больничный; у учёбы/отгула — доступность; у офисной/удалённой работы — повторение. Нормализация времени учитывает timezone человека. Ошибки отдельно различают network, нет отгулов, некорректную конечную дату, запрет бронирования в офисе с персональным столом, неизвестную ошибку. Некоторые ошибки предлагают «Понятно» и Back, другие — retry; не заменять их одним общим error-screen.

Источники A (все под `shared/src/commonMain/kotlin/ru/yandex/team/app/shared/`):

- `services/deeplinks/processors/DeeplinkGapProcessor.kt` — форматы ссылок.
- `features/gap/domain/GetGapListUseCase.kt`; `features/gap/ui/GapListViewModel.kt` — список и переход в trip.
- `features/gap/ui/EditGapViewModel.kt` — `loadForm`, `getEditGapDomainVO`, `onCreate`, `onSave`, `onDelete`, `onSubmitSuccess`, `set*Error`.
- `features/gap/ui/formatter/GapFormFormatter.kt`; `features/gap/domain/dto/GapDomain.kt` — поля и варианты.
- `features/gap/ui/dto/EditGapStateVO.kt`, `EditGapContentVO.kt`; `features/gap/data/GapException.kt` — состояния.
- `features/gap/ui/SelectOfficeViewModel.kt` — выбор офиса.
- Native stack: `iosApp/Calendar/Features/Tabs/TabsView/Reducer/TabsViewDeeplinkReducer.swift::openGap`.

## Что это меняет для «Моих встреч» и Марса

Это выводы из карты, а не утверждённое решение дизайна:

- Слово «встречи» уже означает событие/договорённость в Home, Calendar и профиле коллеги. Вход в материалы должен раскрывать иной результат действия, иначе одно название и иконка календаря создают ложное ожидание повторного расписания.
- У календаря есть пользовательский контекст до/во время события и доступность. У материалов — возвращение к содержанию после встречи. Связь логична через реальный идентификатор и готовность материалов, но отсутствие этого контракта нельзя маскировать моковыми данными.
- Находить материалы из каталога — отдельная работа пользователя от открытия результатов конкретной завершённой встречи. Наличие сервисного пункта не определяет целиком ни обнаружение, ни повседневный вход.
- Переход в Марс по конкретной расшифровке должен оставаться действием над материалами; универсальный календарь, профиль и их Back-контракты сохраняются.
- Автосуммаризация Телемоста уже имеет место в календарной форме. Новую настройку записи/AI нельзя добавлять независимо, не сверив доступность и смысл с владельцем этого existing flow.

## Покрытие и границы

Прочитаны: A Calendar tab/system/view/bridge/deeplink; Home CalendarFormatter/entry; shared Gap domain/UI/errors; Search profile entry; native WebService profile; native SDK config. M TouchApp routes, TouchGrid/navigation/header/new event, TouchEventPage, основные ветки TouchEventForm, поля RSVP/Telemost/суммаризации/переговорок/уведомлений/видимости/доступности, TouchAsideMenu, docs index/mobile/eventForm. P mobile routes, PageMainContainer/layout, Contacts mobile, ProfileCalendar integration, status/Gap routing.

Не подтверждены: версия Maya, фактически установленная у конкретного пользователя; активные серверные флаги и права; поведение серверного сохранения/приглашений и реальной брони переговорки; связь eventId ↔ сервис материалов; сценарии бэкенда выдачи записи/итогов; полный набор всех серверных виджетов Анкеты. Не проводились клики в production, просмотр чужих данных, создание встреч, бронирование, изменения отсутствий. Исходники подтверждают сценарии и ограничения, а не частоту использования.
