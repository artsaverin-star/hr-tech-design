# Календарное событие, материалы встречи и AI

## Три разные задачи

| Объект | Задача | Что нельзя автоматически предполагать |
|---|---|---|
| Событие календаря | Назначить время, пригласить людей, участвовать, изменить/отменить | Что есть запись, расшифровка, готовые итоги или право на них |
| Материалы встречи | Найти договорённость, проверить исходную реплику, получить/уточнить итоги, управлять доступом | Что это ещё одно расписание; что любой участник вправе изменить любой текст |
| Контекст AI | Обсудить материал или выполнить задачу, опираясь на доступные источники | Что поиск, разговор и действие в другом сервисе — одно и то же; что ответ в моках реально сгенерирован |

Название веб-продукта «Мои встречи» подтверждено в мобильном заголовке
`efficiency-service-www/src/features/meeting-filters/ui/MeetingFilters/MeetingFilters.tsx`.
Это не доказательство, что название понятно без контекста на любой поверхности Тима.

## Подтверждённые сценарии сервиса материалов

Корень `MEETINGS_ROOT`: `hrtech/products/efficiency_service/efficiency-service-www`.
Сведения ниже — о прочитанном коде, не о текущей rollout-конфигурации.

| Сценарий | Путь и результат | Существенные состояния / ограничения | Источник относительно MEETINGS_ROOT |
|---|---|---|---|
| Найти нужную встречу | Корень `/notes/` → список и фильтры → деталь | Поиск, участники, теги, даты, серия, роль; сброс отличается от пустого списка без фильтров | `src/pages/meeting-list/ui/MeetingListPage/MeetingListPage.tsx`; `src/features/meeting-filters/ui/MeetingFilters/MeetingFilters.tsx`; `src/widgets/meeting-list` |
| Читать итоги | Деталь → вкладка суммаризации | Не запущено, ожидание/обработка, готово, сбой, только расшифровка, слишком короткий текст; доступное действие зависит от DTO | `src/app/model/WithAppRouterProvider/AppRouter.tsx`; `src/entities/meeting/lib/getSummarizationPresentationState.ts` |
| Запустить получение материалов | «Суммаризировать»/состояние с действием → запрос → состояние обработки | `canRequestSummarization`, `hasAccess`, статусы summary/transcript; нельзя рисовать активную кнопку одинаково во всех состояниях | `src/pages/meeting/ui/MeetingInfoHeader/MeetingInfoHeader.container.tsx`; `src/pages/meeting-summary/ui/MeetingSummaryStatus/MeetingSummaryStatus.tsx` |
| Проверить исходную реплику | Расшифровка → поиск/переход к фрагменту | Пусто, ожидание, ошибка, удалённая реплика, ограниченный доступ — разные состояния | `src/pages/meeting-transcript`; `src/features/transcript-search`; `src/features/meeting-transcript` |
| Скорректировать расшифровку | Действие у разрешённой реплики → сессия правок → явное сохранение/отмена | Право `canEdit` на реплике, флаг обновлённого поведения; перед изменением читать текущую модель сессии и защиты при уходе | `src/features/transcript-edit-session/model/TranscriptEditSession.ts`; `src/features/meeting-transcript/ui/MeetingTranscript/useTranscriptEditNavigation.ts` |
| Управлять доступом | Действия встречи → доступы → конкретное изменение | `canManageAccess`; права организатора/участников и внешних людей не одинаковы; не вычислять доступ только по наличию имени в календаре | `src/pages/meeting/ui/MeetingInfoHeader/MeetingInfoHeader.container.tsx`; `src/features/meeting-access` |
| Получить текст вне приложения | Меню действий → `.txt`/`.xlsx` → загрузка | Файл/ошибка/загрузка; это не проигрыватель видеозаписи | `src/pages/meeting/ui/MeetingInfoHeader/MeetingInfoHeader.container.tsx`; `src/shared/lib/download-source/downloadSource.ts` |
| Работа с вложениями | Добавить/скачать/удалить файл | Лимиты файлов, слишком большой файл, недоступная ссылка, подтверждение удаления | `src/features/meeting-files/ui/MeetingFiles/MeetingFiles.tsx`; `src/features/meeting-files/ui/MeetingFileTag/MeetingFileTag.tsx` |
| Настроить автоматические итоги | Настройка в фильтрах списка | На телефоне открывается отдельно; наличие настройки не означает готовность итогов каждой встречи | `src/features/meeting-filters/ui/AutoSummarizationSetting`; `src/features/meeting-filters/ui/MeetingFilters/MeetingFilters.tsx` |
| Обсудить в AI | Деталь сообщает контекст выбранной встречи; список очищает контекст | SDK, источник чата и feature flag; ID и title — часть контракта | `src/shared/model/aai/context.ts`; `src/features/aai/ui/Aai/Aai.tsx`; `src/shared/api/aai/sdk.ts` |

Маршруты source frontend: `/` — список; `/meeting?/:id` — деталь с итогами по умолчанию,
`transcript` — расшифровка; остальное — not-found. Внешний префикс `/notes/` задаётся оболочкой.
Локальный iOS preview использует свои разрешённые `/notes/meeting/{id}/summary` команды;
не переносить эти адреса в реальный фронтенд без проверки роутера.

Флаги на дату чтения: `efficiency_service_front__aai_mars_enabled` и
`efficiency_service_front__transcript_editing_enabled`, оба с default false в
`src/shared/lib/featureFlags/featureFlagDefinitions.ts`. Их фактическое серверное значение не запрашивалось.
AI SDK выбирает `mars` или `legacy`, `agentSlug: efficiency`; это не доказывает одинаковую
передачу контекста для двух реализаций. Для изменения bridge нужно проследить фактический SDK.

## Связь с календарём

Сценарии календаря и настройка итогов Телемоста описаны в [calendar-people.md](calendar-people.md).
Виджет Home сам не содержит метаданных итогов или расшифровок. Для контекстного входа из
настоящего события нужен подтверждённый ID, наличие материалов и права, а не угадывание по названию.

Историческая техническая разведка находится в локальном `yandex-team-ios-research/meetings-native-research.md`.
В ней есть API-пути и предположения интеграции; навигационные рекомендации от 12.11 отменены.
Перед реализацией сверять текущие DTO/фронтенд. Не брать старую рекомендацию размещения из этого файла.

## Если задача относится к конкретным V5

Для локальной интеграции прототипов 2026 года отдельно прочитай
[разбор V5 от 13.11.2026](case-study-v5-2026-11.md). Это исторический кейс с моками и
непринятым размещением входов; для другой задачи его решения не становятся исходными требованиями.
