/**
 * КАДРЫ ЖИВОГО ПРОДУКТА — сервис «MARS», «Сайт» с панелью
 * и полноэкранный MARS в приложении (02.10.2026).
 *
 * Раньше спека стояла на убранной редакции 2.0 (`?state=<код>&edition=2.0` у всех 197 кадров):
 * карта показывала регулярные задачи, ИИ-профиль и свои скиллы, которых в продукте уже нет.
 * Здесь — только то, что человек реально проходит сейчас. Каждый кадр открывается адресом
 * `?seed=<id>` (рецепт в `spec-seeds.ts` проигрывает путь пользователя от чистого старта),
 * поэтому и снимок на «Карте», и живой экран по клику на кадр — один и тот же продукт.
 *
 * ПРАВИЛА. `title` — событие или результат (2–4 слова), `caption` — одна фраза о том, что
 * существенно меняется. Подпись перехода (`label`) — ДОСЛОВНО кнопка из словаря продукта
 * (`texts/*`): по ней же генератор снимков находит, откуда нажали. Своих продуктовых строк нет.
 * `zone` — название секции карты (`spec-sections.ts`). Статус ставится, только если он
 * различает: `question` — у кадров, чьи строки помечены в словаре `[?]` (ждут редактора).
 * Ветка ромба, исход которой выбирает система, а не человек, — `kind: 'system'` (пунктир).
 */

import type { SpecDecision, SpecFrame, SpecStatus, SpecTransition } from './spec';

export const LIVE_ZONES = {
    access: 'Действия в сервисах',
    app: 'Приложение: MARS на весь экран',
    failures: 'Отказы и сбои',
    first: 'Первый вход',
    history: 'История чатов',
    run: 'Долгая задача',
    settings: 'Настройки',
    site: 'Сайт: помощник рядом с работой',
    skills: 'Скиллы',
    start: 'Старт: задача за пару кликов',
} as const;

type Zone = (typeof LIVE_ZONES)[keyof typeof LIVE_ZONES];

interface LiveDef {
    caption: string;
    /** Подпись телефона, если на 375 экран устроен иначе. */
    mobileCaption?: string;
    /** Дополнительные параметры адреса (заморозка прогона и т.п.). */
    extra?: string;
    /**
     * Телефон (375) с тем же адресом есть у КАЖДОГО экрана (владелец, 29.09: «не во всех экранах
     * есть рядом мобильная версия»). `false` — только с причиной в `noMobile`.
     */
    mobile?: false;
    /** Нативный экран приложения: один телефонный кадр, без выдуманной desktop-версии. */
    platform?: 'mobile';
    noMobile?: string;
    next?: SpecTransition[];
    status?: SpecStatus;
    title: string;
    zone: Zone;
}

const Z = LIVE_ZONES;

const LIVE: Record<string, LiveDef> = {
    /* 01 · Первый запрос: настройка сообщениями в том же разговоре. */
    'first-intro': {
        caption: 'Первый запрос уже виден в ленте, а MARS предлагает настроить источник ответов и рабочие сервисы прямо в чате.',
        next: [{ label: 'Настроить MARS', to: 'first-source' }],
        title: 'Настройка перед первым ответом', zone: Z.first,
    },
    'first-source': {
        caption: 'Личная подписка рекомендована; Eliza доступна сразу и использует общую корпоративную квоту.',
        next: [
            { label: 'Продолжить с Eliza', to: 'first-access' },
            { label: 'Подключить личную подписку', to: 'first-personal' },
            { label: 'Назад', to: 'first-intro' },
        ],
        title: 'Источник ответов', zone: Z.first,
    },
    'first-personal': {
        caption: 'Провайдер выбирается действием в сообщении MARS; выбор остаётся в истории чата.',
        next: [
            { label: 'Выбрать', to: 'first-authorize', anchor: 'text=Выбрать ChatGPT / Codex' },
            { kind: 'system', to: 'first-saved' },
            { label: 'Назад', to: 'first-source' },
        ],
        title: 'Личная подписка при входе', zone: Z.first,
    },
    'first-authorize': {
        caption: 'Инструкции идут репликой MARS, а под ними — код устройства и кнопка подключения; секреты не попадают в переписку.',
        next: [
            { label: 'Подтвердить подключение', to: 'first-personal-connected' },
            { label: 'Отмена', to: 'first-personal' },
        ],
        title: 'Подключение подписки', zone: Z.first,
    },
    'first-personal-connected': {
        caption: 'Личная подписка подключена и выбрана для ответов; дальше — рабочие сервисы.',
        next: [{ label: 'Продолжить', to: 'first-access' }, { label: 'Назад', to: 'first-personal' }],
        title: 'Ответы через личную подписку', zone: Z.first,
    },
    'first-saved': {
        caption: 'Сохранённую подписку можно использовать сразу или подключить заново; новая форма открывается только по явному выбору.',
        next: [
            { label: 'Использовать подписку', to: 'first-access' },
            { label: 'Подключить заново', to: 'first-reconnect' },
            { label: 'Назад', to: 'first-personal' },
        ],
        title: 'Подписка уже подключена', zone: Z.first,
    },
    'first-reconnect': {
        caption: 'Повторное подключение открывает компактную форму под инструкцией MARS, сохраняя предыдущие решения в переписке.',
        next: [
            { label: 'Подтвердить подключение', to: 'first-personal-connected' },
            { label: 'Отмена', to: 'first-personal' },
        ],
        title: 'Повторное подключение подписки', zone: Z.first,
    },
    'first-access': {
        caption: 'MARS предлагает подключить рабочие сервисы, пока исходный запрос ожидает завершения настройки.',
        next: [
            { label: 'Подключить сервисы', to: 'first-yandex-id' },
            { label: 'Подключить позже', to: 'first-skipped' },
            { label: 'Назад', to: 'first-source' },
        ],
        title: 'Рабочие сервисы', zone: Z.first,
    },
    'first-yandex-id': {
        caption: 'Разрешение на рабочие сервисы запрашивается внутри переписки и применяется после явного подтверждения.',
        next: [{ label: 'Разрешить и подключить', to: 'first-ready' }, { label: 'Назад', to: 'first-access' }],
        title: 'Разрешение в чате', zone: Z.first,
    },
    'first-ready': {
        caption: 'Сервисы подключены, а исходный запрос остаётся в этом чате и продолжится после завершения настройки.',
        next: [{ label: 'Продолжить', to: 'first-answer' }],
        title: 'Настройка готова', zone: Z.first,
    },
    'first-skipped': {
        caption: 'Подключение рабочих сервисов отложено, и MARS предлагает продолжить исходный запрос с доступным контекстом.',
        next: [{ label: 'Продолжить', to: 'first-answer-skipped' }],
        title: 'Сервисы подключим позже', zone: Z.first,
    },
    'first-answer': {
        caption: 'MARS продолжает первый запрос после настройки без повторной отправки, сохраняя ответы настройки в истории.',
        title: 'Ответ на первый запрос', zone: Z.first,
    },
    'first-answer-skipped': {
        caption: 'Первый запрос продолжен без подключения сервисов, а настройка и исходный запрос сохранены в одном чате.',
        title: 'Запрос после пропуска подключений', zone: Z.first,
    },

    /* ---------------- 02 · Старт ---------------- */
    'mars-home': {
        caption: 'Вопрос, три задачи и поле запроса; каталог открывается через «Все задачи».',
        next: [
            { label: 'Собрать мой день', to: 'mars-draft' },
            { label: 'Все задачи', to: 'mars-catalog' },
        ],
        title: 'Старт MARS',
        zone: Z.start,
    },
    'mars-catalog': {
        caption: 'Шторка «Что поручить MARS»: поиск, рубрики, и выбор кладёт запрос в поле.',
        next: [{ label: 'Собрать мой день', to: 'mars-draft' }],
        title: 'Что поручить MARS',
        zone: Z.start,
    },
    'mars-draft': {
        caption: 'Запрос стоит в поле — его можно поправить перед отправкой.',
        next: [
            { label: 'Отправить', to: 'mars-answer' },
            { label: 'Отправить', to: 'mars-confirm' },
        ],
        title: 'Черновик в поле',
        zone: Z.start,
    },
    'mars-confirm': {
        caption: 'После настройки запрос ждёт подтверждения источника: Eliza ещё не подтверждена в этой сессии.',
        next: [{ label: 'Изменить запрос', to: 'mars-draft' }],
        title: 'Ответить через Eliza?',
        zone: Z.start,
    },
    'mars-answer': {
        caption: 'Ответ приходит в ленту, исходный запрос и контекст остаются в чате.',
        title: 'Ответ',
        zone: Z.start,
    },
    'mars-sub-level': {
        caption: 'Меню открывается сразу на выборе подписки: корпоративная или своя.',
        next: [{ label: 'Claude', to: 'mars-sub-claude' }],
        title: 'Выбор подписки',
        zone: Z.start,
    },
    'mars-sub-claude': {
        caption: 'Токен вставляется здесь же; стрелка назад возвращает к выбору подписки.',
        next: [{ label: 'Подключить подписку', to: 'mars-sub-done' }],
        title: 'Токен Claude',
        zone: Z.start,
    },
    'mars-sub-done': {
        caption: 'Подписка подключена и выбрана; сохранённый запрос ожидает действия «Отправить с личной».',
        title: 'Личная подписка выбрана',
        zone: Z.start,
    },

    /* ---------------- 03 · Долгая задача ---------------- */
    'run-live': {
        caption: 'MARS идёт по шагам на виду; работу можно остановить.',
        extra: 'tick=1',
        next: [
            { kind: 'system', label: 'шаги пройдены', to: 'run-result' },
            { label: 'Остановить', to: 'run-stopped' },
        ],
        title: 'Ход задачи',
        zone: Z.run,
    },
    'run-stopped': {
        caption: 'Карточка помнит шаг, на котором остановились.',
        next: [{ label: 'Продолжить', to: 'run-result' }],
        title: 'Остановлено',
        zone: Z.run,
    },
    'run-result': {
        caption: 'Итог: что решили — карточкой со ссылками на сводки и источниками.',
        title: 'Итог с решениями',
        zone: Z.run,
    },
    'run-clarify': {
        caption: 'Одно уточнение по ходу: варианты строками и свой ответ.',
        next: [{ label: 'Две недели', to: 'run-clarify-done' }],
        title: 'Уточняющий вопрос',
        zone: Z.run,
    },
    'run-clarify-done': {
        caption: 'Вопрос свернулся в строку с ответом, ниже — итог.',
        title: 'Ответили — итог',
        zone: Z.run,
    },
    'run-closed': {
        caption: 'Часть встреч закрыта от ИИ-агентов: открыть их или продолжить без них.',
        next: [{ label: 'Продолжить без них', to: 'run-closed-done' }],
        title: 'Встречи закрыты',
        zone: Z.run,
    },
    'run-closed-done': {
        caption: 'Итог собран по открытым встречам; решение видно свёрнутой строкой.',
        title: 'Итог без закрытых',
        zone: Z.run,
    },

    /* ---------------- 04 · Действия в сервисах ---------------- */
    'act-access': {
        caption: 'Чтобы завести задачи, MARS нужен доступ к Трекеру от вашего имени.',
        title: 'Нужен доступ',
        zone: Z.access,
    },
    'act-yandex-id': {
        caption: 'Одноразовый код из приложения Яндекс ID подтверждает передачу прав.',
        next: [{ label: 'Продолжить', to: 'act-consent' }],
        title: 'Код Яндекс ID',
        zone: Z.access,
    },
    'act-consent': {
        caption: 'Какие права получит помощник — списком, до выдачи.',
        next: [{ label: 'Передать права', to: 'act-permission' }],
        title: 'Согласие на права',
        zone: Z.access,
    },
    'act-permission': {
        caption: 'Доступ выдан; перед изменением MARS спрашивает: что сделает и чего не тронет.',
        title: 'Разрешение действовать',
        zone: Z.access,
    },
    'act-applied': {
        caption: 'Задачи созданы — ссылками; отменить можно в течение 10 секунд.',
        next: [{ label: 'Отменить', to: 'act-undone' }],
        title: 'Задачи созданы',
        zone: Z.access,
    },
    'act-undone': {
        caption: 'Созданное отменено, в ленте остаётся след решения.',
        title: 'Отменено',
        zone: Z.access,
    },
    'act-applied-rule': {
        caption: 'Следующие такие задачи MARS делает сам и называет правило, по которому действовал.',
        title: 'Дальше — без вопроса',
        zone: Z.access,
    },
    'act-drafts': {
        caption: 'Без разрешения MARS ничего не меняет и отдаёт черновики задач.',
        status: 'question',
        title: 'Не разрешили — черновики',
        zone: Z.access,
    },
    'act-no-access': {
        caption: 'Без доступа MARS собирает черновики, их можно завести вручную.',
        status: 'question',
        title: 'Без доступа — черновики',
        zone: Z.access,
    },
    'act-delete': {
        caption: 'Закрытие задачи требует явного разрешения в карточке MARS.',
        title: 'Необратимое действие',
        zone: Z.access,
    },
    'act-deleted': {
        caption: 'Задача закрыта как отменённая; окна отмены нет.',
        title: 'Задача закрыта',
        zone: Z.access,
    },
    'act-kept': {
        caption: 'Задача осталась открытой — MARS так и говорит.',
        title: 'Задача не тронута',
        zone: Z.access,
    },

    /* ---------------- 05 · Отказы и сбои ---------------- */
    'fail-start': {
        caption: 'Запрос ушёл, MARS готовит ответ — дальше придёт итог или карточка с причиной.',
        extra: 'tick=1',
        title: 'Запрос отправлен',
        zone: Z.failures,
    },
    'fail-rate': {
        caption: 'Причина названа; повтор — сам через 20 секунд или кнопкой.',
        next: [{ label: 'Повторить', to: 'fail-retried' }],
        title: 'Сервис перегружен',
        zone: Z.failures,
    },
    'fail-retried': {
        caption: 'Повтор дошёл до итога; сработавшая кнопка карточки гаснет.',
        title: 'Повтор — итог',
        zone: Z.failures,
    },
    'fail-interrupted': {
        caption: 'Связь с сервисом оборвалась посреди ответа — «Повторить» отправит запрос заново.',
        title: 'Ответ прервался',
        zone: Z.failures,
    },
    'fail-incomplete': {
        caption: 'Ответ собран не до конца — «Повторить» соберёт его заново с начала.',
        title: 'Не удалось завершить',
        zone: Z.failures,
    },
    'fail-empty': {
        caption: 'Сервис вернул пустой ответ — «Повторить» отправит тот же запрос.',
        title: 'Пустой ответ',
        zone: Z.failures,
    },
    'fail-context': {
        caption: 'Слишком большой объём: сократить запрос или начать новый чат.',
        next: [{ label: 'Новый чат с этим вопросом', to: 'fail-context-new' }],
        title: 'Контекст переполнен',
        zone: Z.failures,
    },
    'fail-context-new': {
        caption: 'Вопрос переехал в новый чат и дошёл до итога.',
        title: 'Новый чат — итог',
        zone: Z.failures,
    },
    'fail-no-rights': {
        caption: 'Прав нет у сотрудника: задача остановлена, доступ выдаёт руководитель.',
        title: 'Нет прав',
        zone: Z.failures,
    },
    'fail-rule': {
        caption: 'Правило запрещает менять Календарь: шаги вручную или разрешить один раз.',
        next: [
            { label: 'Разрешить один раз', to: 'fail-rule-once' },
            { label: 'Открыть Доступы', to: 'set-page' },
        ],
        title: 'Запрещено правилом',
        zone: Z.failures,
    },
    'fail-rule-once': {
        caption: 'Встреча поставлена — ниже её карточка.',
        status: 'question',
        title: 'Разрешили один раз',
        zone: Z.failures,
    },

    /* ---------------- 06 · Настройки ---------------- */
    'set-page': {
        caption: 'Четыре карточки: чем отвечает MARS, личные подписки, доступы к сервисам и скиллы.',
        next: [
            { label: 'Eliza', to: 'set-source' },
            { label: 'Claude', to: 'set-claude' },
            { label: 'Сервисы', to: 'set-services' },
            { label: 'Подключённые скиллы', to: 'set-skills' },
        ],
        title: 'Настройки',
        zone: Z.settings,
    },
    'set-source': {
        caption: 'Eliza или подключённая личная подписка; выбор — для следующих ответов.',
        title: 'Выбор источника ответов',
        zone: Z.settings,
    },
    'set-claude': {
        caption: 'Команда для терминала и поле токена; подключение — после ввода.',
        mobileCaption: 'Токен вставляется здесь, создаётся он на компьютере.',
        next: [{ label: 'Подключить подписку', to: 'set-claude-on' }],
        title: 'Подписка Claude',
        zone: Z.settings,
    },
    'set-claude-on': {
        caption: 'Подписка подключена — строка показывает маску токена.',
        title: 'Подписка подключена',
        zone: Z.settings,
    },
    'set-claude-bad': {
        caption: 'Токен не подошёл — ошибка у поля, значение остаётся.',
        title: 'Токен не подошёл',
        zone: Z.settings,
    },
    'set-services': {
        caption: 'Сервисы, которые MARS видит от вашего имени, — тумблерами.',
        next: [{ label: 'Подключить через Яндекс ID', to: 'set-services-on' }],
        title: 'Доступы к сервисам',
        zone: Z.settings,
    },
    'set-services-on': {
        caption: 'Один вход через Яндекс ID включает все сервисы.',
        title: 'Сервисы подключены',
        zone: Z.settings,
    },
    /* «Скиллы» в настройках (7.10, «а почему тут этого нет?»). */
    'set-skills': {
        caption: 'Тот же каталог скиллов — с раздела «Подключённые»: у скиллов сервисов пометка «Подключил сервис».',
        next: [{ label: 'Документы', to: 'set-skills-add' }],
        status: 'question',
        title: 'Скиллы: Подключённые',
        zone: Z.settings,
    },
    'set-skills-add': {
        caption: 'Разделы слева по смыслу; скилл подключается прямо из строки.',
        mobileCaption: 'На телефоне разделы идут одной лентой.',
        next: [{ label: 'Подключить', to: 'set-skills-on' }],
        status: 'question',
        title: 'Скиллы: Документы',
        zone: Z.settings,
    },
    'set-skills-on': {
        caption: 'Тост о подключении, в строке — «Отключить»; скилл добавился в «Подключённые».',
        status: 'question',
        title: 'Свой скилл подключён',
        zone: Z.settings,
    },

    /* ---------------- 07 · История ---------------- */
    'hist-list': {
        caption: 'Чаты по дням в колонке слева; у строки — меню действий.',
        next: [{ label: 'Действия с чатом', to: 'hist-menu' }],
        title: 'История',
        zone: Z.history,
    },
    'hist-menu': {
        caption: 'Закрепить, переименовать, удалить — удаление единственное красное.',
        next: [
            { label: 'Переименовать', to: 'hist-rename' },
            { label: 'Закрепить', to: 'hist-pinned' },
            { label: 'Удалить', to: 'hist-delete' },
        ],
        title: 'Действия с чатом',
        zone: Z.history,
    },
    'hist-rename': {
        caption: 'Окно с текущим названием чата.',
        title: 'Новое имя чата',
        zone: Z.history,
    },
    'hist-pinned': {
        caption: 'Закреплённый чат стоит первым, в своей группе.',
        title: 'Закреплён',
        zone: Z.history,
    },
    'hist-delete': {
        caption: 'Удаление спрашивает подтверждение: восстановить будет нельзя.',
        title: 'Удалить чат?',
        zone: Z.history,
    },

    /* ---------------- 08 · Сайт ---------------- */
    'site-home': {
        caption: 'Главная интранета; помощник — планетой справа от колокольчика.',
        next: [{ label: 'Открыть ИИ-чаты', to: 'site-panel' }],
        title: 'Помощник на главной',
        zone: Z.site,
    },
    'site-panel': {
        caption: 'Панель поверх страницы: готовые запросы по её содержимому, поле запроса и переход в MARS.',
        mobileCaption: 'На телефоне панель — шторка на весь экран, с тем же контекстом страницы.',
        next: [
            { label: 'Найди пересечения в календаре и предложи, что перенести', to: 'site-panel-answer' },
            { label: 'Закрыть ИИ-чат', to: 'site-home' },
        ],
        title: 'Помощник открыт',
        zone: Z.site,
    },
    'site-panel-answer': {
        caption: 'Ответ приходит прямо в панели; страница остаётся на месте.',
        next: [{ label: 'Продолжить в MARS', to: 'site-to-mars', anchor: 'Продолжить в MARS — тот же чат и история' }],
        title: 'Встречи пересекаются',
        zone: Z.site,
    },
    /* 10 · Скиллы (6.10–7.10): «+» → каталог → подключить, команда `/skill`, «i» у подписи. */
    'skill-add-search': {
        caption: 'Из «+» у поля открывается каталог скиллов: разделы слева, поиск по названию, описанию или ссылке.',
        next: [{ label: 'Подключить', to: 'skill-add-done' }],
        status: 'question',
        title: 'Поиск скилла', zone: Z.skills,
    },
    'skill-add-done': {
        caption: 'Подключённый скилл получает «Отключить» в строке и тост; его имя добавится и на старте чата.',
        status: 'question',
        title: 'Скилл подключён', zone: Z.skills,
    },
    'skill-slash': {
        caption: '«/» в поле подсказывает команды MARS: подключить, список подключённых, отключить.',
        next: [
            { label: '/skill install', to: 'skill-slash-skills' },
            { label: '/skills', to: 'skill-cmd-list' },
        ],
        status: 'question',
        title: 'Команды по «/»', zone: Z.skills,
    },
    'skill-slash-skills': {
        caption: 'После /skill install — скиллы по введённому; выбор подставляет имя скилла в поле.',
        next: [{ label: 'Презентации', to: 'skill-cmd-installed' }],
        status: 'question',
        title: 'Скиллы по названию', zone: Z.skills,
    },
    'skill-cmd-installed': {
        caption: 'Команда и её итог остаются в ленте: что умеет скилл и что он есть во всех чатах MARS.',
        status: 'question',
        title: 'Подключён командой', zone: Z.skills,
    },
    'skill-cmd-not-found': {
        caption: 'Неизвестное название — карточка предлагает найти скилл в Skill Store.',
        next: [{ label: 'Найти скилл', to: 'skill-add-search' }],
        status: 'question',
        title: 'Скилл не найден', zone: Z.skills,
    },
    'skill-cmd-list': {
        caption: '/skills — подключённые скиллы: какие поставил сервис, какие подключили вы.',
        next: [{ label: 'Подключить другой скилл', to: 'skill-add-search' }],
        status: 'question',
        title: 'Подключённые скиллы', zone: Z.skills,
    },
    'skill-info': {
        caption: 'У подписи скилла под ответом — «i»: что он умеет и что работает в других чатах MARS.',
        next: [{ label: 'Подключить в другом чате', to: 'skill-info-connect' }],
        status: 'question',
        title: 'О скилле ответа', zone: Z.skills,
    },
    'skill-info-connect': {
        caption: 'В MARS — команда /skill install с копированием; в своём помощнике — инструкция Skill Store.',
        status: 'question',
        title: 'Команда для другого чата', zone: Z.skills,
    },
    'site-to-mars': {
        caption: 'Тот же чат открыт в MARS: запрос, ответы и контекст сохраняются при переходе из панели.',
        title: 'Чат в MARS',
        zone: Z.site,
    },
    'site-meeting': {
        caption: 'Страница встречи открывает MARS из шапки с контекстом этой встречи.',
        next: [{ label: 'Открыть ИИ-чаты', to: 'site-meeting-panel' }],
        title: 'Встреча открыта',
        zone: Z.site,
    },
    'site-meeting-panel': {
        caption: 'В панели показаны возможности скилла встреч и готовые запросы по открытой встрече.',
        next: [
            { label: 'Продолжить в MARS', to: 'site-meeting-to-mars', anchor: 'Продолжить в MARS — тот же чат и история' },
            { label: 'Закрыть ИИ-чат', to: 'site-meeting' },
        ],
        title: 'Помощник у встречи',
        zone: Z.site,
    },
    'site-meeting-to-mars': {
        caption: 'MARS сохраняет скилл, готовые запросы по встрече и черновик при переходе из панели.',
        title: 'MARS по этой встрече',
        zone: Z.site,
    },

    /* 09 · App: один нативный телефонный экран; те же модель и разговоры. */
    'app-home': {
        caption: 'Главная Я Team открывает MARS отдельным экраном приложения.',
        next: [{ label: 'Я Team & MARS', to: 'app-mars' }],
        title: 'Главная приложения', zone: Z.app, platform: 'mobile',
    },
    'app-mars': {
        caption: 'MARS занимает весь экран с возвратом в приложение и меню чатов в нативной шапке.',
        next: [{ label: 'Собрать мой день', to: 'app-draft' }, { label: 'Назад', to: 'app-home' }],
        title: 'MARS открыт', zone: Z.app, platform: 'mobile',
    },
    'app-draft': {
        caption: 'Выбранный запрос появился в поле; сотрудник может изменить его перед отправкой.',
        next: [{ label: 'Отправить', to: 'app-confirm' }],
        title: 'Запрос перед отправкой', zone: Z.app, platform: 'mobile',
    },
    'app-confirm': {
        caption: 'Перед первым ответом через корпоративную квоту MARS просит подтвердить Eliza; запрос сохранён.',
        next: [{ label: 'Продолжить с Eliza', to: 'app-answer' }],
        title: 'Подтверждение источника ответа', zone: Z.app, platform: 'mobile',
    },
    'app-answer': {
        caption: 'Ответ показан в полноэкранном чате, а кнопка возврата открывает на главную, сохраняя чат.',
        next: [{ label: 'Назад', to: 'app-home' }],
        title: 'Ответ в приложении', zone: Z.app, platform: 'mobile',
    },
    'app-meeting': {
        caption: 'Встреча открыта внутри приложения; вход MARS в шапке передаёт контекст этой встречи.',
        next: [{ label: 'Открыть ИИ-чаты', to: 'app-meeting-chat' }],
        title: 'Встреча в приложении', zone: Z.app, platform: 'mobile',
    },
    'app-meeting-chat': {
        caption: 'Контекст встречи сохранён в полноэкранном MARS, а кнопка возврата открывает к той же встрече.',
        next: [{ label: 'Назад', to: 'app-meeting' }],
        title: 'MARS по встрече', zone: Z.app, platform: 'mobile',
    },

};

const urlOf = (id: string, def: LiveDef) =>
    `?seed=${id}${def.platform === 'mobile' ? '&surface=app&viewport=frame' : ''}${def.extra ? `&${def.extra}` : ''}`;

export const LIVE_FRAMES: SpecFrame[] = Object.entries(LIVE).flatMap(([id, def]) => {
    const desktop: SpecFrame = {
        caption: def.caption,
        id,
        next: def.next,
        platform: def.platform ?? 'desktop',
        /* Статус — только если он что-то различает: «В работе» на каждом кадре было шумом (ревью 29.09). */
        status: def.status,
        title: def.title,
        url: urlOf(id, def),
        zone: def.zone,
    };

    if (def.platform === 'mobile') { return [desktop] }

    return def.mobile !== false ?
        [desktop, {
            ...desktop,
            caption: def.mobileCaption ?? def.caption,
            id: `${id}@m`,
            next: undefined,
            platform: 'mobile' as const,
        }] :
        [desktop];
});

/** Снятое раскрытие остаётся адресуемым: скилл теперь сразу виден в карточке. */
export const LIVE_ALIAS_FRAMES: SpecFrame[] = (['desktop', 'mobile'] as const).map(platform => ({
    caption: 'Возможности скилла встреч сразу видны в карточке рядом с готовыми запросами.',
    id: `site-meeting-skills${platform === 'mobile' ? '@m' : ''}`,
    platform,
    title: 'О скилле встреч',
    url: '?seed=site-meeting-skills',
    zone: Z.site,
}));

/**
 * Развилки живого продукта. Ветки — значения ответа, подпись — дословно кнопка, если исход
 * выбирает человек, или короткое событие, если его выбирает ход задачи.
 */
export const LIVE_DECISIONS: SpecDecision[] = [
    {
        branches: [
            { label: 'Продолжить с Eliza', to: 'mars-answer', tone: 'yes' },
            { label: 'На личную подписку', to: 'mars-sub-level' },
        ],
        id: 'q-source',
        question: 'Через что отвечать?',
    },
    {
        branches: [
            { label: 'Получить доступ', to: 'act-yandex-id', tone: 'yes' },
            { label: 'Работать без доступа', to: 'act-no-access', tone: 'no' },
        ],
        id: 'q-access',
        question: 'Дать доступ к Трекеру?',
    },
    {
        branches: [
            { label: 'Разрешить', to: 'act-applied', tone: 'yes' },
            { label: 'Разрешать всегда', to: 'act-applied-rule' },
            { label: 'Не разрешать', to: 'act-drafts', tone: 'no' },
        ],
        id: 'q-permission',
        question: 'Разрешить действовать?',
    },
    {
        branches: [
            { label: 'Закрыть задачу', to: 'act-deleted', tone: 'yes' },
            { label: 'Не закрывать', to: 'act-kept', tone: 'no' },
        ],
        id: 'q-delete',
        question: 'Закрыть задачу?',
    },
    {
        branches: [
            { kind: 'system', label: 'сервис перегружен', to: 'fail-rate' },
            { kind: 'system', label: 'другой сбой', to: 'fail-interrupted' },
            { kind: 'system', label: 'слишком большой объём', to: 'fail-context' },
            { kind: 'system', label: 'нет прав', to: 'fail-no-rights' },
            { kind: 'system', label: 'запрещено правилом', to: 'fail-rule' },
        ],
        id: 'q-why',
        question: 'Почему не вышло?',
    },
    {
        branches: [
            { kind: 'system', label: 'подошёл', to: 'set-claude-on', tone: 'yes' },
            { kind: 'system', label: 'не подошёл', to: 'set-claude-bad', tone: 'no' },
        ],
        id: 'q-token',
        question: 'Токен подошёл?',
    },
];

export const LIVE_FRAME_IDS = new Set(LIVE_FRAMES.map(frame => frame.id));
export const LIVE_DECISION_IDS = new Set(LIVE_DECISIONS.map(decision => decision.id));
