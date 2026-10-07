import { type MouseEvent as ReactMouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@yandex-int/hr-components/HrButton';
import { HrSelect } from '@yandex-int/hr-components/HrSelect';
import { Link } from '@yandex-int/hr-components/Link';
import { RadioButton } from '@yandex-int/hr-components/RadioButton';
import { Text } from '@yandex-int/hr-components/Text';
import { cnTheme } from '@yandex-int/hr-components/Theme';

import {
    anchorQueryOf,
    type Board,
    buildBoard,
    type EdgePath,
    type GoChip,
    type LaneBox,
    type NodeBox,
    nodeDetail,
    nodeTitle,
    normalizeTransition,
    ROW_BLOCK,
    SCREEN,
    SECTION_TOP_BLOCK,
    type SectionBox,
    type SectionFeatures,
} from './map-board';
import { SPEC_FIGMA, type SpecFrame, type SpecStatus } from './spec';
import { BOARD_META, MAP_NO_MOBILE } from './spec-sections';
import { SNAPSHOTS, SNAPSHOTS_GENERATED_AT } from './spec-snapshots';
import { useUrlState } from './url-state';

import styles from './MapBoard.module.css';

/**
 * «Карта сценариев»: слева список секций, на холсте — ОДНА выбранная секция. Холст свободный:
 * пан драгом фона и колесом, зум ctrl/cmd+wheel к курсору, «Читать» (первый ряд читаемо) и
 * «Обзор» (секция целиком). Экраны — снимки (`spec-snapshots.ts`), связи — SVG по геометрии
 * из `map-board.ts`. Наведение на экран или переход подсвечивает его связи, остальные гаснут,
 * а на снимке обводится кнопка, по которой нажали.
 *
 * Выбранная секция живёт в адресе (`&zone=01`), тема — в localStorage.
 */

const MIN_SCALE = 0.04;
const MAX_SCALE = 2;
const READ_SCALE_MAX = 0.8;
const THEME_KEY = 'spec-map-theme';
const INTRO_CODE = '00';
const CANVAS_PAD = 48;

type Theme = 'dark' | 'light';
type Focus = { id: string; type: 'edge' | 'node' } | null;

/** Подписи — как у светофора на борде в Figma (hrtech-spec §6). Ставятся, только если различают. */
const STATUS_META: Record<SpecStatus, { className: string; label: string }> = {
    question: { className: styles.statusQuestion, label: 'Нужен редактор' },
    ready: { className: styles.statusReady, label: 'Готово' },
    wip: { className: styles.statusWip, label: 'На ревью' },
};

const THEME_OPTIONS = [
    { value: 'dark', children: 'Тёмная' },
    { value: 'light', children: 'Светлая' },
];

/**
 * Классы наконечников — явной картой: витрина собирает CSS-модули с
 * `localsConvention: 'camelCaseOnly'`, и обращение по шаблонной строке отдавало `undefined`.
 */
const MARKERS = [
    { className: styles.markerLine, id: 'line' },
    { className: styles.markerActive, id: 'active' },
] as const;

/** Тёмный холст — статичная палитра ДС (`Theme_palette_static`), см. шапку MapBoard.module.css. */
const DARK_PALETTE = cnTheme({ palette: 'static' });

/** «Как читать» — только про то, что на карте правда есть (легенда устроена так же). */
const readingFor = (features: SectionFeatures): string[] => [
    'Слева направо — шаги сценария. Верхний ряд — основной путь; всё, что может пойти иначе, уходит вниз из того места, где возникло. Под пунктирной чертой — отдельная история со своим входом.',
    features.system ?
        'Сплошная стрелка — действие человека, на плашке — кнопка, которую нажали. Пунктир — то, что делает система: ход задачи, проверка, сбой.' :
        'Стрелка — действие человека, на плашке — кнопка, которую нажали.',
    features.decision ? 'Ромб — развилка: на ветках значения ответа, зелёная — удачный исход, красная — отказ.' : '',
    features.comb ? 'Гребёнка сверху — разбор: взаимоисключающие случаи одного исхода, стрелок между ними нет.' : '',
    'Код экрана: «02.3» — третий шаг основного пути, «02.3А» — тот же шаг, ветка на ряд ниже, «02.3Б» — на два.',
    features.links ?
        '«↩ 01.2» под экраном — возврат назад или вверх, «→ 05.1» — переход вперёд через экран или в другую секцию; клик ведёт к экрану.' :
        '',
    'Наведите на экран или стрелку — связи подсветятся, остальное погаснет, а на снимке обведётся кнопка. Клик по экрану открывает это состояние в «Прототипе».',
].filter(Boolean);

const readTheme = (): Theme => {
    try {
        return window.localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
};

/** URL узла в Figma: node-id в адресе пишется через дефис вместо двоеточия. */
const figmaNodeUrl = (fileKey: string, nodeId: string): string =>
    `https://www.figma.com/design/${fileKey}/?node-id=${nodeId.replace(':', '-')}`;

/**
 * Адрес живого состояния кадра для снимка: голая сцена без панели режимов, анимации выключены.
 */
export const frameSrc = (pathname: string, frame: SpecFrame): string => {
    const params = new URLSearchParams(frame.url.replace(/^\?/, ''));

    params.set('viewport', 'frame');
    params.set('motion', 'off');

    return `${pathname}?${params}`;
};

const pluralInbound = (count: number): string => {
    const tail = count % 10;
    const teen = count % 100 >= 11 && count % 100 <= 14;

    if (tail === 1 && !teen) {
        return 'вход';
    }

    return tail >= 2 && tail <= 4 && !teen ? 'входа' : 'входов';
};

const pluralScreens = (count: number): string => {
    const tail = count % 10;
    const teen = count % 100 >= 11 && count % 100 <= 14;

    if (tail === 1 && !teen) {
        return 'экран';
    }

    return tail >= 2 && tail <= 4 && !teen ? 'экрана' : 'экранов';
};

const option = (value: string, label: string) => ({
    type: 'simple' as const,
    id: value,
    itemData: { value, label },
});

declare global {
    interface Window {
        /** Экспорт для `scripts/spec-snapshots.mjs`: какие адреса снимать и какие якоря мерить. */
        __specBoard?: unknown;
        /** Геометрия борда для проверок из headless-браузера (пересечения, покрытие) — только чтение. */
        __specBoardLayout?: unknown;
    }
}

/* ------------------------------------------------------------------ */
/* Узлы                                                                 */
/* ------------------------------------------------------------------ */

const Screen = ({
    frame,
    label,
    platform,
    onOpen,
}: {
    frame: SpecFrame;
    label: string;
    platform: 'desktop' | 'mobile';
    onOpen: (id: string) => void;
}) => {
    const size = SCREEN[platform];
    const snapshot = SNAPSHOTS[frame.id];

    return (
        /* hrds-check: allow raw-control — кадр борда со снимком 1:1 (SCREEN в map-board.ts) */
        <button
            aria-label={`${label} — ${platform === 'mobile' ? 'телефон' : 'десктоп'}, открыть в прототипе`}
            className={platform === 'mobile' ? `${styles.screen} ${styles.screenMobile}` : styles.screen}
            style={{ height: size.height, width: size.width }}
            type="button"
            onClick={() => onOpen(frame.id)}
        >
            {snapshot ? (
                <img alt="" className={styles.shot} draggable={false} src={snapshot.url} />
            ) : (
                <span className={styles.shotMissing}>
                    <Text as="span" className={styles.mono} typography="bodyM">
                        Снимка нет
                    </Text>
                </span>
            )}
        </button>
    );
};

const Chips = ({
    board,
    chipsIn,
    chipsOut,
    onJump,
}: {
    board: Board;
    chipsIn: GoChip[];
    chipsOut: GoChip[];
    onJump: (id: string) => void;
}) => {
    const [expanded, setExpanded] = useState(false);

    if (chipsIn.length === 0 && chipsOut.length === 0) {
        return null;
    }

    const codeOf = (id: string) => board.nodeById.get(id)?.code || '◇';
    const titleOfId = (id: string) => {
        const node = board.nodeById.get(id);

        return node ? nodeTitle(node) : id;
    };

    /* Исходящие — полной ссылкой; входящие — счётчиком (та же связь уже стоит под источником). */
    return (
        <div className={styles.chips}>
            {chipsOut.map(chip => (
                <Button
                    key={`out:${chip.to}`}
                    className={styles.chip}
                    data-kind={chip.kind}
                    data-tone={chip.tone}
                    hasSlots={false}
                    size="xs"
                    title={`${chip.label ?? 'Переход'} → ${codeOf(chip.to)} ${titleOfId(chip.to)}`}
                    view="secondary"
                    onClick={() => onJump(chip.to)}
                >
                    <Text as="span" className={styles.chipInk} typography="bodyS">
                        <span className={styles.mono}>
                            {chip.back ? '↩' : '→'} {codeOf(chip.to)}
                        </span>
                        {chip.label ? (
                            <Text as="span" className={styles.chipLabel} typography="bodyS">
                                {chip.label}
                            </Text>
                        ) : null}
                    </Text>
                </Button>
            ))}
            {chipsIn.length && !expanded ? (
                <Button
                    className={`${styles.chip} ${styles.chipIn}`}
                    hasSlots={false}
                    size="xs"
                    title={chipsIn.map(chip => `${codeOf(chip.from)} · ${titleOfId(chip.from)}`).join('\n')}
                    view="ghost"
                    onClick={() => (chipsIn.length === 1 ? onJump(chipsIn[0].from) : setExpanded(true))}
                >
                    <Text as="span" className={`${styles.chipInk} ${styles.mono}`} typography="bodyS">
                        ← {chipsIn.length === 1 ? codeOf(chipsIn[0].from) : `${chipsIn.length} ${pluralInbound(chipsIn.length)}`}
                    </Text>
                </Button>
            ) : null}
            {expanded ?
                chipsIn.map(chip => (
                    <Button
                        key={`in:${chip.from}`}
                        className={`${styles.chip} ${styles.chipIn}`}
                        hasSlots={false}
                        size="xs"
                        title={`${chip.label ?? 'Переход'} из «${titleOfId(chip.from)}»`}
                        view="ghost"
                        onClick={() => onJump(chip.from)}
                    >
                        <Text as="span" className={`${styles.chipInk} ${styles.mono}`} typography="bodyS">
                            ← {codeOf(chip.from)}
                        </Text>
                    </Button>
                )) :
                null}
        </div>
    );
};

type NodeProps = {
    board: Board;
    flash: boolean;
    node: NodeBox;
    offset: { x: number; y: number };
    related: boolean;
    onFocus: (focus: Focus) => void;
    onJump: (id: string) => void;
};

const FrameCard = ({ board, flash, node, offset, related, onFocus, onJump, onOpen }: NodeProps & {
    onOpen: (id: string) => void;
}) => {
    const frame = node.frame!;
    const title = nodeTitle(node);
    const status = frame.status ? STATUS_META[frame.status] : null;
    const classes = [styles.card, flash ? styles.flash : '', related ? styles.related : ''].filter(Boolean);

    return (
        <article
            className={classes.join(' ')}
            data-spec-node={node.id}
            style={{ left: node.x - offset.x, top: node.y - offset.y, width: node.width }}
            onMouseEnter={() => onFocus({ id: node.id, type: 'node' })}
            onMouseLeave={() => onFocus(null)}
        >
            <div className={styles.pair}>
                <Screen frame={frame} label={title} platform={frame.platform} onOpen={onOpen} />
                {node.mobile ? <Screen frame={node.mobile} label={title} platform="mobile" onOpen={onOpen} /> : null}
            </div>
            <div className={styles.caption}>
                <div className={styles.captionHead}>
                    <Text as="span" className={`${styles.code} ${styles.mono}`} typography="bodyM" weight="medium">
                        {node.code}
                    </Text>
                    <Text as="h3" className={styles.title} typography="titleS" weight="medium">
                        {title}
                    </Text>
                    {status ? (
                        <span className={styles.statusPill} title={status.label}>
                            <span className={`${styles.status} ${status.className}`} />
                            <Text as="span" typography="captionM">
                                {status.label}
                            </Text>
                        </span>
                    ) : null}
                    {frame.figmaNodeId && SPEC_FIGMA ? (
                        <Link
                            className={styles.figmaLink}
                            href={figmaNodeUrl(SPEC_FIGMA.fileKey, frame.figmaNodeId)}
                            overflowTooltipProps={null}
                            rel="noreferrer"
                            size="s"
                            target="_blank"
                            view="secondary"
                        >
                            Figma
                        </Link>
                    ) : null}
                </div>
                {/* Цвет подписи — от `.detail`: роль `--muted` борда тише, чем text-secondary. */}
                <Text as="p" className={styles.detail} typography="bodyM">
                    {nodeDetail(node)}
                </Text>
                <Chips
                    board={board}
                    chipsIn={board.chipsIn[node.id] ?? []}
                    chipsOut={board.chipsOut[node.id] ?? []}
                    onJump={onJump}
                />
            </div>
        </article>
    );
};

const DiamondNode = ({ board, flash, node, offset, related, onFocus, onJump }: NodeProps) => (
    <div
        className={[styles.diamondBox, flash ? styles.flash : '', related ? styles.related : ''].filter(Boolean).join(' ')}
        data-spec-node={node.id}
        style={{ height: node.height, left: node.x - offset.x, top: node.y - offset.y, width: node.width }}
        onMouseEnter={() => onFocus({ id: node.id, type: 'node' })}
        onMouseLeave={() => onFocus(null)}
    >
        <div className={styles.diamond} />
        <Text as="span" className={styles.diamondText} typography="bodyM" weight="medium">
            {node.decision?.question}
        </Text>
        <div className={styles.diamondChips}>
            <Chips
                board={board}
                chipsIn={board.chipsIn[node.id] ?? []}
                chipsOut={board.chipsOut[node.id] ?? []}
                onJump={onJump}
            />
        </div>
    </div>
);

/* ------------------------------------------------------------------ */
/* Легенда                                                              */
/* ------------------------------------------------------------------ */

/* Образцы линий легенды — CSS на токенах, как ромб рядом: тот же цвет и толщина, что у связей карты. */
const Legend = ({ features }: { features: SectionFeatures }) => (
    <ul aria-label="Условные обозначения" className={styles.legend}>
        <li>
            <span aria-hidden="true" className={styles.legendArrow} />
            <Text as="span" typography="bodyS">
                действие
            </Text>
        </li>
        {features.system ? (
            <li>
                <span aria-hidden="true" className={`${styles.legendArrow} ${styles.legendDashed}`} />
                <Text as="span" typography="bodyS">
                    делает система
                </Text>
            </li>
        ) : null}
        {features.decision ? (
            <li>
                <span className={styles.legendDiamond} />
                <Text as="span" typography="bodyS">
                    развилка
                </Text>
            </li>
        ) : null}
        {features.comb ? (
            <li>
                <span aria-hidden="true" className={styles.legendComb} />
                <Text as="span" typography="bodyS">
                    разбор случаев
                </Text>
            </li>
        ) : null}
        {features.links ? (
            <li>
                <Text as="span" className={`${styles.legendChip} ${styles.mono}`} typography="bodyS">
                    ↩ 01.2 · → 05.1
                </Text>
                <Text as="span" typography="bodyS">
                    назад · дальше или в другую секцию
                </Text>
            </li>
        ) : null}
    </ul>
);

/* ------------------------------------------------------------------ */
/* Борд                                                                 */
/* ------------------------------------------------------------------ */

type MapBoardProps = {
    title: string;
    /** Клик по экрану: открыть это состояние в «Прототипе». */
    onOpenFrame: (id: string) => void;
};

export const MapBoard = ({ title, onOpenFrame }: MapBoardProps) => {
    const { pathname, replaceParams, searchParams } = useUrlState();
    const board = useMemo(buildBoard, []);
    const requestedZone = searchParams.get('zone');
    const selected: SectionBox | null =
        requestedZone === INTRO_CODE ?
            null :
            (board.sections.find(section => section.code === requestedZone) ?? board.sections[0] ?? null);
    const selectedCode = selected?.code ?? INTRO_CODE;

    const viewportRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const transformRef = useRef({ scale: 0.3, x: 0, y: 0 });
    const dragCleanupRef = useRef<(() => void) | null>(null);
    const panAnimRef = useRef<number | null>(null);
    const flashTimerRef = useRef<number | null>(null);
    /* Прыжок к узлу после смены секции: по ссылке «Go» или из адреса (`&node=<id>`). */
    const pendingJumpRef = useRef<string | null>(searchParams.get('node'));
    const [zoomPct, setZoomPct] = useState(30);
    const [theme, setTheme] = useState<Theme>(readTheme);
    const [flashId, setFlashId] = useState<string | null>(null);
    const [focus, setFocus] = useState<Focus>(null);

    const frameOf = selected ?? board.intro;
    const offset = { x: frameOf.x - CANVAS_PAD, y: frameOf.y - CANVAS_PAD };
    const canvasSize = { height: frameOf.height + CANVAS_PAD * 2, width: frameOf.width + CANVAS_PAD * 2 };
    const visibleNodes = selected ? board.nodes.filter(node => node.section === selected.index) : [];
    const visibleEdges = selected ? board.edges.filter(edge => edge.section === selected.index) : [];
    const framesCount = (section: SectionBox) =>
        board.nodes.filter(node => node.section === section.index && node.kind === 'frame').length;

    /* Подсветка: наведённый узел — все его связи; наведённая связь — она и два её узла. */
    const activeEdges = new Set<string>();
    const relatedNodes = new Set<string>();

    if (focus?.type === 'node') {
        visibleEdges.forEach(edge => {
            if (edge.from === focus.id || edge.to === focus.id) {
                activeEdges.add(edge.id);
                relatedNodes.add(edge.from);
                relatedNodes.add(edge.to);
            }
        });
    } else if (focus?.type === 'edge') {
        const edge = visibleEdges.find(item => item.id === focus.id);

        if (edge) {
            activeEdges.add(edge.id);
            relatedNodes.add(edge.from);
            relatedNodes.add(edge.to);
        }
    }

    const edgeState = (edge: EdgePath) => {
        if (!focus) {
            return undefined;
        }

        return activeEdges.has(edge.id) ? 'on' : 'dim';
    };
    /* Обводка кнопки: у наведённой связи — её якорь; у наведённого узла — якоря его исходящих. */
    const anchors = visibleEdges.filter(
        edge =>
            edge.anchor &&
            ((focus?.type === 'edge' && focus.id === edge.id) || (focus?.type === 'node' && focus.id === edge.from)),
    );

    const selectZone = (code: string) => {
        const params = new URLSearchParams(window.location.search);

        params.set('zone', code);
        replaceParams(params);
        setFocus(null);
    };

    /* Экспорт для скрипта снимков: адреса кадров и запросы якорей (только user-переходы). */
    useEffect(() => {
        window.__specBoard = {
            frames: board.nodes.flatMap(node =>
                [node.frame, node.mobile].flatMap(frame =>
                    frame ?
                        [
                            {
                                code: node.code,
                                id: frame.id,
                                platform: frame.platform,
                                title: frame.title,
                                /* Якоря — у своего кадра узла: десктопа или телефона без пары (экран приложения). */
                                queries:
                                    frame === node.frame ?
                                        [
                                            ...(frame.next ?? []).map(normalizeTransition).flatMap(transition => {
                                                const query = anchorQueryOf(transition);

                                                return query ? [{ query, to: transition.to }] : [];
                                            }),
                                            /* Кнопки веток ромба стоят на кадре перед ним — мерим и их. */
                                            ...Object.entries(board.decisionInput)
                                                .filter(([, input]) => input === frame.id)
                                                .flatMap(([decisionId]) =>
                                                    (board.nodeById.get(decisionId)?.decision?.branches ?? [])
                                                        .filter(branch => branch.label && branch.kind !== 'system')
                                                        .map(branch => ({ query: branch.label!, to: branch.to })),
                                                ),
                                        ].filter((item, index, list) =>
                                            list.findIndex(other => other.to === item.to) === index) :
                                        [],
                                src: frameSrc(pathname, frame),
                            },
                        ] :
                        [],
                ),
            ),
        };

        window.__specBoardLayout = {
            chipsOut: board.chipsOut,
            edges: board.edges,
            lanes: board.sections.flatMap(section => section.lanes.map(lane => ({ ...lane, section: section.index }))),
            noMobile: MAP_NO_MOBILE,
            nodes: board.nodes.map(node => ({
                code: node.code,
                col: node.col,
                hasMobile: Boolean(node.mobile),
                height: node.height,
                /* Телефон без десктопной пары: узел шире снимка — снимок по центру, ниже подпись. */
                native: node.frame?.platform === 'mobile',
                id: node.id,
                kind: node.kind,
                row: node.row,
                screen: node.screen,
                section: node.section,
                width: node.width,
                x: node.x,
                y: node.y,
            })),
            sections: board.sections,
            /* Сообщения движка о составе (циклические from, опечатки id): приёмка считает их дефектами. */
            warnings: board.warnings,
        };

        return () => {
            delete window.__specBoard;
            delete window.__specBoardLayout;
        };
    }, [board, pathname]);

    const cancelPanAnimation = () => {
        if (panAnimRef.current !== null) {
            cancelAnimationFrame(panAnimRef.current);
        }

        panAnimRef.current = null;
    };

    const applyTransform = () => {
        const { scale, x, y } = transformRef.current;

        if (canvasRef.current) {
            canvasRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
        }

        setZoomPct(Math.round(scale * 100));
    };

    /** Зум к точке вьюпорта: p' = cursor − (cursor − p)·s'/s. */
    const zoomAt = (cursorX: number, cursorY: number, rawScale: number) => {
        cancelPanAnimation();
        const current = transformRef.current;
        const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, rawScale));

        current.x = cursorX - (cursorX - current.x) * (scale / current.scale);
        current.y = cursorY - (cursorY - current.y) * (scale / current.scale);
        current.scale = scale;
        applyTransform();
    };

    const zoomAtCenter = (rawScale: number) => {
        const viewport = viewportRef.current;

        if (viewport) {
            zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, rawScale);
        }
    };

    /** «Обзор» — секция целиком. */
    const fitToContent = () => {
        cancelPanAnimation();
        const viewport = viewportRef.current;

        if (!viewport) {
            return;
        }

        const scale = Math.min(
            MAX_SCALE,
            Math.max(
                MIN_SCALE,
                Math.min(viewport.clientWidth / canvasSize.width, viewport.clientHeight / canvasSize.height),
            ),
        );

        transformRef.current = {
            scale,
            x: (viewport.clientWidth - canvasSize.width * scale) / 2,
            y: Math.max(0, (viewport.clientHeight - canvasSize.height * scale) / 2),
        };
        applyTransform();
    };

    /**
     * СТАРТОВЫЙ ВИД — ЧИТАЕМЫЙ: первый ряд (заголовок дорожки, экраны, подписи) целиком по высоте,
     * не крупнее 80 % (крупнее в кадр не влезает и двух шагов пути). Шапка секции остаётся над кадром: название уже
     * стоит в шапке страницы, а в «Читать» место отдаётся экранам (ревью 29.09). Дальше путь
     * читается панорамой вправо; «Обзор» показывает секцию целиком.
     */
    const fitReadable = () => {
        if (!selected) {
            fitToContent();

            return;
        }

        cancelPanAnimation();
        const viewport = viewportRef.current;

        if (!viewport) {
            return;
        }

        /* Не крупнее 80 %: так в кадре полтора-два шага пути, а подписи всё ещё читаются. */
        const scale = Math.min(READ_SCALE_MAX, Math.max(MIN_SCALE, (viewport.clientHeight - 32) / ROW_BLOCK));

        transformRef.current = { scale, x: 16, y: 16 - (CANVAS_PAD + SECTION_TOP_BLOCK) * scale };
        applyTransform();
    };

    /** Прыжок к дорожке из левого списка: заголовок и первая карточка — у левого верхнего угла. */
    const panToLane = (lane: LaneBox) => {
        cancelPanAnimation();
        const scale = Math.max(transformRef.current.scale, 0.5);

        transformRef.current = {
            scale,
            x: 24 - (lane.x - offset.x - 120) * scale,
            y: 24 - (lane.y - offset.y - 24) * scale,
        };
        applyTransform();
    };

    const panToNode = (node: NodeBox) => {
        const viewport = viewportRef.current;

        if (!viewport) {
            return;
        }

        const { scale } = transformRef.current;
        const from = { x: transformRef.current.x, y: transformRef.current.y };
        const target = {
            x: viewport.clientWidth / 2 - (node.x - offset.x + node.width / 2) * scale,
            y: viewport.clientHeight / 2 - (node.y - offset.y + node.height / 2) * scale,
        };
        const started = performance.now();

        cancelPanAnimation();

        const tick = (now: number) => {
            const progress = Math.min(1, (now - started) / 320);
            const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;

            transformRef.current.x = from.x + (target.x - from.x) * eased;
            transformRef.current.y = from.y + (target.y - from.y) * eased;
            applyTransform();
            panAnimRef.current = progress < 1 ? requestAnimationFrame(tick) : null;
        };

        panAnimRef.current = requestAnimationFrame(tick);
        setFlashId(node.id);

        if (flashTimerRef.current !== null) {
            window.clearTimeout(flashTimerRef.current);
        }

        flashTimerRef.current = window.setTimeout(() => setFlashId(null), 1400);
    };

    /** Прыжок по ссылке: узел в другой секции — сначала открыть её, пан после рендера. */
    const jumpToNode = (id: string) => {
        const node = board.nodeById.get(id);

        if (!node) {
            return;
        }

        if (selected && node.section === selected.index) {
            panToNode(node);

            return;
        }

        pendingJumpRef.current = id;
        selectZone(board.sections[node.section].code);
    };

    /** Пан — драг фона: mousedown вне карточек/кнопок/ссылок, порог 5px. */
    const onCanvasMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
        cancelPanAnimation();

        if (event.button !== 0 || (event.target as Element).closest('a, button, [data-spec-node]')) {
            return;
        }

        const base = { ...transformRef.current };
        const start = { x: event.clientX, y: event.clientY };
        let active = false;

        const onMove = (move: MouseEvent) => {
            const dx = move.clientX - start.x;
            const dy = move.clientY - start.y;

            if (!active && Math.hypot(dx, dy) < 5) {
                return;
            }

            if (!active) {
                active = true;
                viewportRef.current?.classList.add(styles.grabbing);
            }

            move.preventDefault();
            transformRef.current.x = base.x + dx;
            transformRef.current.y = base.y + dy;
            applyTransform();
        };
        const cleanup = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', cleanup);
            viewportRef.current?.classList.remove(styles.grabbing);
            dragCleanupRef.current = null;
        };

        dragCleanupRef.current = cleanup;
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', cleanup);
    };

    useEffect(
        () => () => {
            dragCleanupRef.current?.();
            cancelPanAnimation();

            if (flashTimerRef.current !== null) {
                window.clearTimeout(flashTimerRef.current);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup трогает только refs
        [],
    );

    /* Колесо: пан; ctrl/cmd (и pinch трекпада) — зум к курсору. passive: false ради preventDefault. */
    useEffect(() => {
        const viewport = viewportRef.current;

        if (!viewport) {
            return undefined;
        }

        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            cancelPanAnimation();

            if (event.ctrlKey || event.metaKey) {
                const rect = viewport.getBoundingClientRect();

                zoomAt(
                    event.clientX - rect.left,
                    event.clientY - rect.top,
                    transformRef.current.scale * Math.exp(-event.deltaY * 0.01),
                );
            } else {
                transformRef.current.x -= event.deltaX;
                transformRef.current.y -= event.deltaY;
                applyTransform();
            }
        };

        viewport.addEventListener('wheel', onWheel, { passive: false });

        return () => viewport.removeEventListener('wheel', onWheel);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- zoomAt/applyTransform трогают только refs
    }, []);

    /* Смена секции: читаемый вид с начала пути; ждали прыжок к узлу — доводим пан после рендера. */
    useLayoutEffect(() => {
        fitReadable();

        const pending = pendingJumpRef.current;
        const node = pending ? board.nodeById.get(pending) : undefined;

        if (node && selected && node.section === selected.index) {
            pendingJumpRef.current = null;
            panToNode(node);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- пересчёт только при смене секции
    }, [selectedCode]);

    const changeTheme = (next: Theme) => {
        setTheme(next);

        try {
            window.localStorage.setItem(THEME_KEY, next);
        } catch {
            /* приватный режим — тема живёт до перезагрузки */
        }
    };

    const zoneOptions = [
        option(INTRO_CODE, '00 · Как читать'),
        ...board.sections.map(section => option(section.code, `${section.code} · ${section.title}`)),
    ];

    const nodeProps = (node: NodeBox): NodeProps => ({
        board,
        flash: flashId === node.id,
        node,
        offset,
        related: relatedNodes.has(node.id),
        onFocus: setFocus,
        onJump: jumpToNode,
    });

    return (
        <div className={styles.board} data-theme={theme}>
            <aside aria-label="Секции карты" className={styles.sidebar}>
                <Text as="h2" className={styles.sidebarTitle} typography="titleS">
                    Карта
                </Text>
                <nav className={styles.sidebarNav}>
                    <Button
                        isChecked={selectedCode === INTRO_CODE}
                        size="m"
                        stretch
                        textProps={{ align: 'left' }}
                        view="ghost"
                        onClick={() => selectZone(INTRO_CODE)}
                    >
                        <span className={styles.navItem}>
                            <Text as="span" className={styles.mono} color="secondary" typography="captionM">
                                00
                            </Text>
                            <Text as="span" className={styles.navTitle} typography="bodyS">
                                Как читать
                            </Text>
                        </span>
                    </Button>
                    {board.sections.map(section => (
                        <div key={section.code} className={styles.navGroup}>
                            <Button
                                isChecked={selectedCode === section.code}
                                size="m"
                                stretch
                                textProps={{ align: 'left' }}
                                view="ghost"
                                onClick={() => selectZone(section.code)}
                            >
                                <span className={styles.navItem}>
                                    <Text as="span" className={styles.mono} color="secondary" typography="captionM">
                                        {section.code}
                                    </Text>
                                    <Text as="span" className={styles.navTitle} typography="bodyS">
                                        {section.title}
                                    </Text>
                                    <Text as="span" className={styles.mono} color="secondary" typography="captionM">
                                        {framesCount(section)}
                                    </Text>
                                </span>
                            </Button>
                            {selectedCode === section.code && section.lanes.length > 1 ? (
                                <ul aria-label={`Дорожки секции ${section.title}`} className={styles.laneNav}>
                                    {section.lanes.map(lane => (
                                        <li key={lane.index}>
                                            <Button
                                                size="s"
                                                stretch
                                                textProps={{ align: 'left' }}
                                                view="ghost"
                                                onClick={() => panToLane(lane)}
                                            >
                                                <Text
                                                    as="span"
                                                    className={styles.laneNavItem}
                                                    color="secondary"
                                                    typography="bodyS"
                                                >
                                                    {lane.title ?? `Дорожка ${lane.index + 1}`}
                                                </Text>
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    ))}
                </nav>
            </aside>

            <div className={styles.main}>
                <header className={styles.head}>
                    <div className={styles.mobileNav}>
                        <HrSelect
                            aria-label="Секция карты"
                            options={zoneOptions}
                            value={selectedCode}
                            width="fill"
                            onValueChange={value => selectZone(String(value))}
                        />
                    </div>
                    <div className={styles.headRow}>
                        <div className={styles.heading}>
                            <Text as="p" color="secondary" typography="captionM">
                                {selected ?
                                    `Секция ${selected.code} · ${framesCount(selected)} ${pluralScreens(framesCount(selected))}` :
                                    'Карта сценариев'}
                            </Text>
                            <Text as="h1" typography="titleM">
                                {selected ? selected.title : title}
                            </Text>
                        </div>
                        <div className={styles.zoomBar}>
                            <Button
                                aria-label="Уменьшить"
                                className={styles.zoomBtn}
                                size="s"
                                type="button"
                                view="ghost"
                                onClick={() => zoomAtCenter(transformRef.current.scale / 1.25)}
                            >
                                −
                            </Button>
                            <Text as="span" className={styles.zoomPct} color="secondary" typography="captionM">
                                {zoomPct}%
                            </Text>
                            <Button
                                aria-label="Увеличить"
                                className={styles.zoomBtn}
                                size="s"
                                type="button"
                                view="ghost"
                                onClick={() => zoomAtCenter(transformRef.current.scale * 1.25)}
                            >
                                +
                            </Button>
                            <Button className={styles.zoomBtn} size="s" type="button" view="ghost" onClick={fitReadable}>
                                Читать
                            </Button>
                            <Button className={styles.zoomBtn} size="s" type="button" view="ghost" onClick={fitToContent}>
                                Обзор
                            </Button>
                        </div>
                        <RadioButton
                            aria-label="Тема борда"
                            name="spec-map-theme"
                            options={THEME_OPTIONS}
                            size="s"
                            value={theme}
                            onChange={event => changeTheme(event.target.value as Theme)}
                        />
                        {SPEC_FIGMA?.sectionId ? (
                            <Button
                                as="a"
                                href={figmaNodeUrl(SPEC_FIGMA.fileKey, SPEC_FIGMA.sectionId)}
                                rel="noreferrer"
                                size="s"
                                target="_blank"
                                view="secondary"
                            >
                                Открыть в Figma
                            </Button>
                        ) : null}
                    </div>
                </header>

                <div
                    className={theme === 'dark' ? `${styles.viewport} ${DARK_PALETTE}` : styles.viewport}
                    ref={viewportRef}
                    onMouseDown={onCanvasMouseDown}
                >
                    <div
                        className={styles.canvas}
                        data-focus={focus ? 'on' : undefined}
                        ref={canvasRef}
                        style={{ height: canvasSize.height, width: canvasSize.width }}
                    >
                        {!selected ? (
                            <section
                                className={styles.intro}
                                style={{
                                    height: board.intro.height,
                                    left: CANVAS_PAD,
                                    top: CANVAS_PAD,
                                    width: board.intro.width,
                                }}
                            >
                                <Text as="p" className={`${styles.introCode} ${styles.mono}`} typography="bodyL">
                                    00 · Как читать
                                </Text>
                                <Text as="h2" typography="displayM">
                                    {title}
                                </Text>
                                <Text as="p" className={styles.introMeta} typography="titleS">
                                    {[String(BOARD_META.ticket), BOARD_META.status].filter(Boolean).join(' · ')}
                                    {SNAPSHOTS_GENERATED_AT ?
                                        ` · снимки от ${new Date(SNAPSHOTS_GENERATED_AT).toLocaleDateString('ru-RU')}` :
                                        ' · снимков ещё нет'}
                                </Text>
                                <Text as="p" className={styles.introText} typography="bodyL">
                                    {BOARD_META.goal}
                                </Text>
                                <Legend features={board.features} />
                                <ol className={styles.introList}>
                                    {readingFor(board.features).map(line => (
                                        <Text key={line} as="li" typography="bodyL">
                                            {line}
                                        </Text>
                                    ))}
                                </ol>
                                <p className={styles.introLinks}>
                                    {String(BOARD_META.ticket) ?
                                        <Link
                                            href={BOARD_META.ticketUrl}
                                            overflowTooltipProps={null}
                                            rel="noreferrer"
                                            target="_blank"
                                            view="primary"
                                        >
                                            Задача · {BOARD_META.ticket} →
                                        </Link> :
                                        null}
                                    <Link
                                        href={pathname}
                                        overflowTooltipProps={null}
                                        rel="noreferrer"
                                        target="_blank"
                                        view="primary"
                                    >
                                        Открыть прототип →
                                    </Link>
                                </p>
                            </section>
                        ) : (
                            <>
                                <section
                                    className={styles.section}
                                    style={{
                                        height: selected.height,
                                        left: CANVAS_PAD,
                                        top: CANVAS_PAD,
                                        width: selected.width,
                                    }}
                                >
                                    <div className={styles.sectionBar} />
                                    <div className={styles.sectionHead}>
                                        <div className={styles.sectionTitleRow}>
                                            <Text
                                                as="span"
                                                className={`${styles.sectionCode} ${styles.mono}`}
                                                typography="displayS"
                                            >
                                                {selected.code}
                                            </Text>
                                            <Text as="h2" className={styles.sectionTitle} typography="displayM">
                                                {selected.title}
                                            </Text>
                                        </div>
                                        {selected.subtitle ? (
                                            <Text as="p" className={styles.sectionSubtitle} typography="titleS">
                                                {selected.subtitle}
                                            </Text>
                                        ) : null}
                                    </div>
                                    <div className={styles.sectionLegend}>
                                        <Legend features={selected.features} />
                                    </div>
                                </section>

                                {/* Отдельная история со своим входом — под пунктирной чертой, а не среди веток. */}
                                {selected.lanes.map(lane =>
                                    lane.divider ? (
                                        <div
                                            key={`divider:${lane.index}`}
                                            aria-hidden="true"
                                            className={styles.laneDivider}
                                            style={{
                                                left: selected.x - offset.x + 140,
                                                top: lane.y - offset.y - 40,
                                                width: selected.width - 280,
                                            }}
                                        />
                                    ) : null,
                                )}

                                {selected.lanes.map(lane =>
                                    lane.title ? (
                                        <div
                                            key={lane.index}
                                            className={styles.laneHead}
                                            style={{
                                                left: lane.x - offset.x,
                                                maxWidth: lane.width,
                                                top: lane.y - offset.y,
                                            }}
                                        >
                                            <Text as="span" className={styles.laneTitle} typography="titleS" weight="medium">
                                                {lane.title}
                                            </Text>
                                            {lane.note ? (
                                                <Text as="span" className={styles.laneNote} typography="bodyM">
                                                    {lane.note}
                                                </Text>
                                            ) : null}
                                        </div>
                                    ) : null,
                                )}

                                {/* Связи — под карточками: стыки прячутся под экранами. */}
                                {/* hrds-check: allow raw-icon — слой графа: линии и локти из map-board.ts */}
                                <svg aria-hidden="true" className={styles.edges} height="1" width="1">
                                    <defs>
                                        {MARKERS.map(marker => (
                                            <marker
                                                key={marker.id}
                                                className={marker.className}
                                                id={`spec-arrow-${marker.id}`}
                                                markerHeight="10"
                                                markerUnits="userSpaceOnUse"
                                                markerWidth="14"
                                                orient="auto"
                                                refX="13"
                                                refY="5"
                                            >
                                                <path d="M0 0 L14 5 L0 10 Z" />
                                            </marker>
                                        ))}
                                    </defs>
                                    <g transform={`translate(${-offset.x} ${-offset.y})`}>
                                        {visibleEdges.map(edge => {
                                            const state = edgeState(edge);

                                            return (
                                                <g
                                                    key={edge.id}
                                                    className={styles.edge}
                                                    data-kind={edge.kind}
                                                    data-shape={edge.shape}
                                                    data-state={state}
                                                >
                                                    <path
                                                        className={styles.edgeLine}
                                                        d={edge.d}
                                                        fill="none"
                                                        markerEnd={`url(#spec-arrow-${state === 'on' ? 'active' : 'line'})`}
                                                        strokeDasharray={edge.kind === 'system' ? '10 8' : undefined}
                                                    />
                                                    {edge.start ? (
                                                        <circle
                                                            className={styles.entryDot}
                                                            cx={edge.start.x}
                                                            cy={edge.start.y}
                                                            r="8"
                                                        />
                                                    ) : null}
                                                    {edge.shape === 'entry' ? null : (
                                                        <path
                                                            className={styles.edgeHit}
                                                            d={edge.d}
                                                            fill="none"
                                                            onMouseEnter={() => setFocus({ id: edge.id, type: 'edge' })}
                                                            onMouseLeave={() => setFocus(null)}
                                                        />
                                                    )}
                                                </g>
                                            );
                                        })}
                                    </g>
                                </svg>

                                {visibleNodes.map(node =>
                                    node.kind === 'decision' ? (
                                        <DiamondNode key={node.id} {...nodeProps(node)} />
                                    ) : (
                                        <FrameCard key={node.id} {...nodeProps(node)} onOpen={onOpenFrame} />
                                    ),
                                )}

                                {/* Плашки подписей — над карточками: они непрозрачные и рассчитаны на чтение. */}
                                {visibleEdges.map(edge =>
                                    edge.label && edge.labelBox ? (
                                        <div
                                            key={`label:${edge.id}`}
                                            className={styles.edgeLabel}
                                            data-kind={edge.kind}
                                            data-state={edgeState(edge)}
                                            data-tone={edge.tone}
                                            style={{
                                                left: edge.labelBox.x - offset.x,
                                                maxWidth: edge.labelBox.width,
                                                top: edge.labelBox.y - offset.y,
                                            }}
                                            onMouseEnter={() => setFocus({ id: edge.id, type: 'edge' })}
                                            onMouseLeave={() => setFocus(null)}
                                        >
                                            <Text as="span" className={styles.edgeLabelText} typography="bodyM">
                                                {edge.label}
                                            </Text>
                                        </div>
                                    ) : null,
                                )}

                                {/* Кнопка, по которой нажали, — рамкой поверх снимка, только при наведении. */}
                                {/* hrds-check: allow raw-icon — слой графа: рамки якорей по spec-snapshots.json */}
                                <svg aria-hidden="true" className={`${styles.edges} ${styles.anchors}`} height="1" width="1">
                                    <g transform={`translate(${-offset.x} ${-offset.y})`}>
                                        {anchors.map(edge => (
                                            <rect
                                                key={`anchor:${edge.id}`}
                                                className={styles.anchorRing}
                                                height={edge.anchor!.height + 12}
                                                rx="10"
                                                width={edge.anchor!.width + 12}
                                                x={edge.anchor!.x - 6}
                                                y={edge.anchor!.y - 6}
                                            />
                                        ))}
                                    </g>
                                </svg>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
