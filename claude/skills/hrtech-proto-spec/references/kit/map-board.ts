/**
 * «Карта сценариев» v6 — движок раскладки над спек-манифестом (`spec.ts`).
 *
 * Состав карты (секции, дорожки, что снято) живёт отдельно — в `spec-sections.ts`; этот файл
 * от продукта не зависит и копируется в другой прототип как есть. Здесь только геометрия:
 * сетка секции, координаты узлов, маршруты линий и места подписей. Замеров DOM нет — пан и
 * зум ничего не пересчитывают.
 *
 * ГРАММАТИКА — КАК НА БОРДЕ В FIGMA (канон hrtech-spec, эталон «Мои встречи · Страница
 * встречи»), владелец 29.09: «криво, непонятно и некрасиво — надо как в фигме, с красивыми
 * стрелками». Четыре формы связи и ни одной другой:
 *  1. ПРЯМАЯ — соседи одной дорожки: горизонталь от правого края к левому краю следующего на
 *     середине высоты экрана, подпись — плашкой на самой линии, в зазоре.
 *  2. ВЕТКА ВНИЗ — дорожка растёт из узла: ствол уходит вниз из низа ромба (или из зазора
 *     справа от экрана), поворачивает скруглённым локтем и входит в ЛЕВЫЙ край первого экрана
 *     дорожки. Все ветки одного узла идут по ОДНОМУ стволу — веер из одной точки.
 *  3. ГРЕБЁНКА — дорожка-разбор (взаимоисключающие случаи): ствол → рельс над рядом →
 *     стойки в верх каждого случая. Между случаями стрелок нет.
 *  4. ССЫЛКА — всё остальное: «↩ 01.2» назад или вверх, «→ 05.1» вперёд через экран или в
 *     другую секцию. Дальних линий нет вообще: они и давали спагетти.
 * Линии не стартуют изнутри снимков: элемент, по которому нажали (якорь из
 * `spec-snapshots.json`), подсвечивается рамкой при наведении на экран или переход.
 * Пунктир — переход, который делает система (`kind: 'system'` у перехода или ветки ромба).
 *
 * СЕТКА. Колонки общие для всех рядов секции (ряды выравниваются), но ромб и экран никогда
 * не делят колонку: иначе колонку ромба растягивал экран из соседнего ряда, и вокруг ромба
 * зияли пустоты по 500 px (ревью 29.09). Узел, чья колонка занята другим типом, съезжает
 * вправо, линия дорожки проходит пустую колонку насквозь.
 */

import {
    SPEC_DECISIONS,
    SPEC_FRAMES,
    type SpecDecision,
    type SpecFrame,
    type SpecStatus,
    type SpecTransition,
} from './spec';
import { MAP_RETIRED, MAP_SECTIONS, type MapLaneDef, type MapSectionDef } from './spec-sections';
import { SNAPSHOTS } from './spec-snapshots';

/* ------------------------------------------------------------------ */
/* Переходы                                                             */
/* ------------------------------------------------------------------ */

export type Tone = 'yes' | 'no';
export type EdgeKind = 'user' | 'system';

export interface Transition {
    to: string;
    kind: EdgeKind;
    label?: string;
    /** Элемент, по которому нажали: `text=…` (по умолчанию — подпись перехода) или `css=…`. */
    anchor?: string;
}

export const normalizeTransition = (item: SpecTransition): Transition =>
    typeof item === 'string' ?
        { kind: 'user', to: item } :
        { anchor: item.anchor, kind: item.kind ?? 'user', label: item.label, to: item.to };

/** Запрос якоря для скрипта снимков: явный `anchor` или подпись перехода как текст кнопки. */
export const anchorQueryOf = (transition: Transition): string | undefined =>
    transition.kind === 'user' ? (transition.anchor ?? transition.label) : undefined;

/* ------------------------------------------------------------------ */
/* Геометрия — все числа в пикселях холста при 100 %                   */
/* ------------------------------------------------------------------ */

/**
 * Экран = РАЗМЕР СНИМКА 1:1: снимки снимаются в половину вьюпорта (`SCALE` в
 * `scripts/spec-snapshots.mjs`), 1440×860 → 720×430 и 375×812 → 188×406. Меняешь числа —
 * меняй и `SCALE`, иначе снимок начнёт растягиваться.
 */
export const SCREEN = {
    desktop: { height: 430, width: 720 },
    mobile: { height: 406, width: 188 },
} as const;

export const GEO = {
    /** Зазор десктоп → мобилка в паре. */
    pairGap: 20,
    /** Зазор между колонками: видимая линия ≥ 28 с каждой стороны плашки + ствол ветки. */
    columnGap: 280,
    /** Ромб — диагональ квадрата 130 (130·√2 ≈ 184): вопрос в три строки влезает. */
    diamond: 184,
    /** Над экранами ряда: заголовок дорожки, строка «когда так бывает», рельс гребёнки. */
    laneHead: 136,
    /** Рельс гребёнки — на столько выше верхнего края экранов (стойка длиннее наконечника). */
    combDrop: 44,
    /** Под экраном: код и заголовок, описание в две строки, ссылки. */
    caption: 128,
    /** Воздух между подписью ряда и заголовком следующей дорожки. */
    rowGap: 72,
    /** Отвод от правого края колонки до ствола ветки. */
    fork: 32,
    /** Поле плашки подписи от конца отрезка — чтобы линия читалась по обе стороны. */
    labelMargin: 28,
    /** Входная стрелка дорожки без источника. */
    entry: 88,
    /** Радиус скругления локтей. */
    radius: 24,
} as const;

export const ROW_PITCH = GEO.laneHead + SCREEN.desktop.height + GEO.caption + GEO.rowGap;
/** Ряд целиком: заголовок дорожки, экран, подпись — по нему «Читать» считает масштаб. */
export const ROW_BLOCK = GEO.laneHead + SCREEN.desktop.height + GEO.caption;
/** Центр экрана по y от верха ряда — на этой высоте идут все горизонтали. */
const ROW_CY = GEO.laneHead + SCREEN.desktop.height / 2;
const DIAMOND_R = GEO.diamond / 2;

const SECTION = {
    padTop: 56,
    /** Полоса, код, заголовок, путь словами и легенда. */
    header: 184,
    padX: 140,
    padBottom: 64,
    gap: 120,
} as const;

/** Высота шапки секции до верха первой дорожки — «Читать» начинает показ с первого ряда. */
export const SECTION_TOP_BLOCK = SECTION.padTop + SECTION.header;

const BOARD_PAD = 96;
/**
 * Буква ряда в коде экрана: «А» — первый ряд под основным путём. Заглавные: строчная «б»
 * моноширинным неотличима от шестёрки («02.2б» читалось как «02.26»).
 */
const ROW_LETTERS = 'АБВГДЕЖИКЛМН';
const INTRO = { height: 640, width: 1480 } as const;

/* ------------------------------------------------------------------ */
/* Типы борда                                                           */
/* ------------------------------------------------------------------ */

export interface Rect {
    height: number;
    width: number;
    x: number;
    y: number;
}

export interface NodeBox {
    /** Код экрана: `Секция.Шаг` на основном пути, `Секция.Шаг<буква ряда>` ниже («02.3А»). У ромба пусто. */
    code: string;
    col: number;
    cx: number;
    cy: number;
    decision?: SpecDecision;
    frame?: SpecFrame;
    /** Узел + подпись (для ромба — сам ромб). */
    height: number;
    id: string;
    kind: 'decision' | 'frame';
    lane: number;
    mobile?: SpecFrame;
    /** Экран десктопа (у ромба — описанный квадрат) — сюда попадают якоря. */
    screen: Rect;
    row: number;
    section: number;
    width: number;
    x: number;
    y: number;
}

export interface LaneBox {
    cases: boolean;
    /** Отдельная история со своим входом — над ней разделитель, это не ветка основного пути. */
    divider: boolean;
    index: number;
    note?: string;
    row: number;
    title?: string;
    /** Сколько места по x под заголовок: от первого до последнего узла дорожки. */
    width: number;
    x: number;
    /** Верх ряда (заголовок дорожки стоит здесь). */
    y: number;
}

/** Какие формы есть в секции — легенда показывает только их. */
export interface SectionFeatures {
    comb: boolean;
    decision: boolean;
    links: boolean;
    system: boolean;
}

export interface SectionBox {
    code: string;
    features: SectionFeatures;
    height: number;
    index: number;
    lanes: LaneBox[];
    rows: number;
    subtitle: string;
    title: string;
    width: number;
    x: number;
    y: number;
}

export type EdgeShape = 'straight' | 'branch' | 'comb' | 'entry';

export interface EdgePath {
    /** Прямоугольник элемента, по которому нажали (координаты холста), если он измерен. */
    anchor?: Rect;
    d: string;
    from: string;
    id: string;
    kind: EdgeKind;
    label?: string;
    /** Центр плашки подписи и ширина, в которую она обязана уместиться. */
    labelBox?: { width: number; x: number; y: number };
    section: number;
    shape: EdgeShape;
    /** Точка входа у стрелки без источника — рисуется кружком. */
    start?: { x: number; y: number };
    to: string;
    tone?: Tone;
}

export interface GoChip {
    /** Назад или вверх по той же секции — «↩», иначе «→». */
    back: boolean;
    from: string;
    kind: EdgeKind;
    label?: string;
    to: string;
    tone?: Tone;
}

export interface Board {
    chipsIn: Record<string, GoChip[]>;
    chipsOut: Record<string, GoChip[]>;
    /** Кадр, стоящий прямо перед ромбом: у веток ромба якоря меряются на нём. */
    decisionInput: Record<string, string>;
    edges: EdgePath[];
    features: SectionFeatures;
    height: number;
    intro: Rect;
    nodeById: Map<string, NodeBox>;
    nodes: NodeBox[];
    sections: SectionBox[];
    width: number;
}

/* ------------------------------------------------------------------ */
/* Манифест и состав                                                    */
/* ------------------------------------------------------------------ */

const FRAME_BY_ID = new Map(SPEC_FRAMES.map(frame => [frame.id, frame]));
const DECISION_BY_ID = new Map(SPEC_DECISIONS.map(decision => [decision.id, decision]));
const RETIRED_IDS = new Set(MAP_RETIRED.flatMap(group => group.ids));

const isMobileId = (id: string): boolean => id.endsWith('@m');
const desktopIdOf = (id: string): string => id.replace(/@m$/, '');
/** Мобильный двойник рисуется рядом с десктопом, отдельного узла у него нет. */
const isPaired = (id: string): boolean => isMobileId(id) && FRAME_BY_ID.has(desktopIdOf(id));

const warn = (message: string) => {
    if (typeof console !== 'undefined') {
        console.warn(`[spec map] ${message}`);
    }
};

/** Страховка: кадр манифеста не стоит в секции и не снят явно — показываем и предупреждаем. */
const LEFTOVER: Omit<MapSectionDef, 'lanes'> = {
    subtitle: 'Кадры манифеста, которым ещё не нашлось места: разложить по секциям или снять с карты',
    title: 'Не вошло в сценарии',
};

const buildSectionDefs = (): MapSectionDef[] => {
    const known = new Set([...FRAME_BY_ID.keys(), ...DECISION_BY_ID.keys()]);
    /* Один узел — одно место на карте: второе появление рисовало бы тот же код дважды и рвало
       связи. Общий вход нескольких сценариев стоит в одной секции, в других — ссылка «→ 01.2». */
    const seen = new Map<string, string>();
    const sections: MapSectionDef[] = MAP_SECTIONS.map(section => ({
        ...section,
        lanes: section.lanes
            .map(lane => ({
                ...lane,
                nodes: lane.nodes.filter(id => {
                    if (!known.has(id)) {
                        warn(`узел «${id}» из состава секций не найден в манифесте`);

                        return false;
                    }

                    if (seen.has(id)) {
                        warn(`узел «${id}» уже стоит в секции «${seen.get(id)}» — второе место убрано`);

                        return false;
                    }

                    seen.set(id, section.title);

                    return !isPaired(id) && !RETIRED_IDS.has(id);
                }),
            }))
            .filter(lane => lane.nodes.length),
    }));

    sections.forEach(section => {
        if (section.lanes[0]?.from) {
            warn(`в секции «${section.title}» основной путь снят с карты — первой встала ветка из «${section.lanes[0].from}»`);
        }
    });

    const placed = new Set([...sections.flatMap(s => s.lanes.flatMap(l => l.nodes)), ...RETIRED_IDS]);
    const leftovers = new Map<string, string[]>();

    SPEC_FRAMES.forEach(frame => {
        if (!isPaired(frame.id) && !placed.has(frame.id)) {
            leftovers.set(frame.zone, [...(leftovers.get(frame.zone) ?? []), frame.id]);
        }
    });
    SPEC_DECISIONS.forEach(decision => {
        if (!placed.has(decision.id)) {
            warn(`ромб «${decision.id}» не стоит ни в одной дорожке и не снят с карты`);
        }
    });

    if (leftovers.size) {
        warn(`кадры без места в секциях и не сняты с карты: ${[...leftovers.values()].flat().join(', ')}`);
        sections.push({
            ...LEFTOVER,
            lanes: [...leftovers.entries()].map(([zone, nodes]) => ({ cases: true, nodes, title: zone })),
        });
    }

    return sections;
};

/* ------------------------------------------------------------------ */
/* Пути                                                                 */
/* ------------------------------------------------------------------ */

type Point = [number, number];

/** Ломаная со скруглёнными углами (радиус урезается на коротких отрезках). */
const roundedPath = (raw: Point[]): string => {
    const points = raw.filter(
        (point, index) => index === 0 || point[0] !== raw[index - 1][0] || point[1] !== raw[index - 1][1],
    );

    if (points.length < 2) {
        return '';
    }

    let d = `M ${points[0][0]} ${points[0][1]}`;

    for (let i = 1; i < points.length - 1; i++) {
        const [px, py] = points[i - 1];
        const [cx, cy] = points[i];
        const [nx, ny] = points[i + 1];
        const inLen = Math.hypot(cx - px, cy - py) || 1;
        const outLen = Math.hypot(nx - cx, ny - cy) || 1;
        const r = Math.min(GEO.radius, inLen / 2, outLen / 2);

        d += ` L ${cx - ((cx - px) / inLen) * r} ${cy - ((cy - py) / inLen) * r}`;
        d += ` Q ${cx} ${cy} ${cx + ((nx - cx) / outLen) * r} ${cy + ((ny - cy) / outLen) * r}`;
    }

    const [lx, ly] = points[points.length - 1];

    return `${d} L ${lx} ${ly}`;
};

/* ------------------------------------------------------------------ */
/* Подписи узлов                                                        */
/* ------------------------------------------------------------------ */

export const nodeTitle = (node: NodeBox): string =>
    node.frame ? node.frame.title : (node.decision?.question ?? node.id);

export const nodeDetail = (node: NodeBox): string => node.frame?.caption ?? '';

export const nodeStatus = (node: NodeBox): SpecStatus | undefined => node.frame?.status;

/* ------------------------------------------------------------------ */
/* Раскладка секции                                                     */
/* ------------------------------------------------------------------ */

interface EdgeDef {
    /** Чей якорь обводить: id цели перехода, которым на кадре нажали кнопку. */
    anchorOf?: string;
    from: string;
    kind: EdgeKind;
    label?: string;
    to: string;
    tone?: Tone;
}

interface Placement {
    col: number;
    lane: number;
    row: number;
}

type ColumnKind = 'decision' | 'frame';

const kindOf = (id: string): ColumnKind => (DECISION_BY_ID.has(id) ? 'decision' : 'frame');

const nodeWidthOf = (id: string): number => {
    if (DECISION_BY_ID.has(id)) {
        return GEO.diamond;
    }

    const frame = FRAME_BY_ID.get(id);

    if (!frame) {
        return SCREEN.desktop.width;
    }

    if (frame.platform === 'mobile') {
        return SCREEN.mobile.width;
    }

    return FRAME_BY_ID.has(`${id}@m`) ? SCREEN.desktop.width + GEO.pairGap + SCREEN.mobile.width : SCREEN.desktop.width;
};

/**
 * МАТРИЦА (гайд «Псы дизайна · Методология», «Матрица оформления»): X — шаг сценария,
 * Y — глубина. Главная дорожка — ряд 0 с первой колонки; дорожка с источником стартует в
 * колонке СЛЕДУЮЩЕЙ за источником (если та не колонка ромба) и встаёт в первый ряд ниже, где
 * (а) её клетки, коридор захода и клетки по краям свободны и (б) ствол ветки проходит
 * промежуточные ряды, ничего не пересекая. Отдельные истории без источника — в конце, под
 * всеми ветками.
 */
const placeLanes = (def: MapSectionDef): Map<string, Placement> => {
    const cells: (string | undefined)[][] = [];
    const laneOfCell: (number | undefined)[][] = [];
    const columnKind: (ColumnKind | undefined)[] = [];
    const cell = (row: number, col: number) => (col < 0 ? undefined : cells[row]?.[col]);
    const placed = new Map<string, Placement>();
    /* Уже стоящие дорожки (их ряд и размах) и стволы веток (колонка источника и ряды, которые
       ствол проходит насквозь): новая дорожка не должна перечёркивать чужой ствол, а новый
       ствол — чужую дорожку. Иначе линии пересекаются. */
    const spans: { from?: string; max: number; min: number; row: number }[] = [];
    const trunks: { bottom: number; col: number; source: string; top: number }[] = [];
    const spanCrossesTrunk = (row: number, min: number, max: number, source?: string) =>
        trunks.some(t =>
            t.source !== source && row >= t.top && row <= t.bottom && min <= t.col && max >= t.col + 1);
    const trunkCrossesSpan = (col: number, fromRow: number, toRow: number, source?: string) =>
        spans.some(sp =>
            sp.from !== source && sp.row > fromRow && sp.row < toRow && sp.min <= col && sp.max >= col + 1);
    const put = (row: number, col: number, id: string, lane: number) => {
        (cells[row] ??= [])[col] = id;
        (laneOfCell[row] ??= [])[col] = lane;
        columnKind[col] ??= kindOf(id);
        placed.set(id, { col, lane, row });
    };
    /** Колонки дорожки: узел, чья колонка занята другим типом, съезжает вправо. */
    const columnsFor = (nodes: string[], startCol: number): number[] => {
        const cols: number[] = [];
        let col = startCol;

        nodes.forEach(id => {
            while (columnKind[col] && columnKind[col] !== kindOf(id)) {
                col++;
            }

            cols.push(col);
            col++;
        });

        return cols;
    };

    def.lanes[0]?.nodes.forEach((id, col) => put(0, col, id, 0));
    spans.push({ max: (def.lanes[0]?.nodes.length ?? 1) - 1, min: 0, row: 0 });

    /* Ветки — в порядке состава, отдельные истории (без источника) — последними. */
    const rest = [...def.lanes.keys()].slice(1);
    const pending = [...rest.filter(i => def.lanes[i].from), ...rest.filter(i => !def.lanes[i].from)];
    let guard = pending.length * (pending.length + 1);

    while (pending.length && guard-- > 0) {
        const index = pending.shift()!;
        const lane = def.lanes[index];
        const from = lane.from ? placed.get(lane.from) : undefined;

        if (lane.from && !from) {
            if (def.lanes.some((other, i) => i !== index && other.nodes.includes(lane.from!))) {
                pending.push(index);
                continue;
            }

            warn(RETIRED_IDS.has(lane.from) ?
                `дорожка «${lane.title ?? index}» растёт из снятого с карты «${lane.from}»: перенеси from на соседний узел или сними дорожку` :
                `дорожка «${lane.title ?? index}» растёт из «${lane.from}», которого нет в секции`);
        }

        const cols = columnsFor(lane.nodes, from ? from.col + 1 : 0);
        const first = cols[0];
        const last = cols[cols.length - 1];
        /* Свободны: коридор захода от источника, клетки дорожки и по одной клетке по краям. */
        const targetFree = (row: number) => {
            for (let col = Math.min(first - 1, from ? from.col + 1 : first - 1); col <= last + 1; col++) {
                if (cell(row, col)) {
                    return false;
                }
            }

            return !spanCrossesTrunk(row, from ? from.col : first, last, lane.from);
        };
        /* Ствол идёт в зазоре справа от источника: клетка за источником в промежуточных рядах
           свободна или занята дорожкой из того же источника (тот же ствол — тот же веер). */
        const trunkFree = (row: number) => {
            if (!from) {
                return true;
            }

            for (let r = from.row + 1; r < row; r++) {
                const occupant = laneOfCell[r]?.[from.col + 1];

                if (occupant !== undefined && def.lanes[occupant].from !== lane.from) {
                    return false;
                }
            }

            return !trunkCrossesSpan(from.col, from.row, row, lane.from);
        };

        let row = from ? from.row + 1 : Math.max(1, cells.length);
        let fallback: number | null = null;

        for (let tries = 0; tries < 16; tries++, row++) {
            if (targetFree(row)) {
                fallback ??= row;

                if (trunkFree(row)) {
                    break;
                }
            }
        }

        if (!targetFree(row) || !trunkFree(row)) {
            row = fallback ?? row;
        }

        lane.nodes.forEach((id, offset) => put(row, cols[offset], id, index));
        spans.push({ from: lane.from, max: last, min: from ? from.col : first, row });

        if (from && lane.from) {
            trunks.push({ bottom: row - 1, col: from.col, source: lane.from, top: from.row + 1 });
        }
    }

    return placed;
};

/* ------------------------------------------------------------------ */
/* Сборка борда — в два прохода: сначала узлы ВСЕХ секций, потом рёбра  */
/* (иначе переход в следующую секцию не находил узла и пропадал).       */
/* ------------------------------------------------------------------ */

interface SectionContext {
    colRight: (col: number) => number;
    def: MapSectionDef;
    index: number;
}

export const buildBoard = (): Board => {
    const defs = buildSectionDefs();
    const nodes: NodeBox[] = [];
    const nodeById = new Map<string, NodeBox>();
    const sections: SectionBox[] = [];
    const contexts: SectionContext[] = [];
    const edges: EdgePath[] = [];
    const chipsIn: Record<string, GoChip[]> = {};
    const chipsOut: Record<string, GoChip[]> = {};
    const decisionInput: Record<string, string> = {};

    const intro: Rect = { height: INTRO.height, width: INTRO.width, x: BOARD_PAD, y: BOARD_PAD };
    let cursorY = intro.y + intro.height + SECTION.gap;
    let boardWidth: number = INTRO.width;

    /* ---------------- проход 1: узлы ---------------- */

    defs.forEach((def, sectionIndex) => {
        const code = String(sectionIndex + 1).padStart(2, '0');
        const placement = placeLanes(def);
        const maxCol = Math.max(0, ...[...placement.values()].map(p => p.col));
        const maxRow = Math.max(0, ...[...placement.values()].map(p => p.row));

        /* Ширина колонки = самый широкий узел в ней; ромб и экран колонку не делят. */
        const colWidth = Array.from({ length: maxCol + 1 }, () => 0);

        placement.forEach((p, id) => {
            colWidth[p.col] = Math.max(colWidth[p.col], nodeWidthOf(id));
        });

        /* Шаг по X — только колонки с экранами: ромб номер не занимает, дыр нет. */
        const stepOfCol: number[] = [];
        let step = 0;

        for (let col = 0; col <= maxCol; col++) {
            step += [...placement.entries()].some(([id, p]) => p.col === col && FRAME_BY_ID.has(id)) ? 1 : 0;
            stepOfCol[col] = Math.max(1, step);
        }

        const x = BOARD_PAD;
        const y = cursorY;
        const originX = x + SECTION.padX;
        const originY = y + SECTION.padTop + SECTION.header;
        const colX: number[] = [];
        let runX = originX;

        colWidth.forEach((width, col) => {
            colX[col] = runX;
            runX += width + GEO.columnGap;
        });

        const rowTop = (row: number) => originY + row * ROW_PITCH;
        const colRight = (col: number) => colX[col] + colWidth[col];
        const lanes: LaneBox[] = [];

        def.lanes.forEach((lane, laneIndex) => {
            const first = placement.get(lane.nodes[0]);
            const last = placement.get(lane.nodes[lane.nodes.length - 1]);

            if (!first || !last) {
                return;
            }

            lanes.push({
                cases: Boolean(lane.cases),
                divider: laneIndex > 0 && !lane.from,
                index: laneIndex,
                note: lane.note,
                row: first.row,
                title: lane.title,
                width: colRight(last.col) - colX[first.col],
                x: colX[first.col],
                y: rowTop(first.row),
            });

            lane.nodes.forEach(id => {
                const p = placement.get(id)!;
                const cy = rowTop(p.row) + ROW_CY;
                const decision = DECISION_BY_ID.get(id);
                const frame = FRAME_BY_ID.get(id);

                if (decision) {
                    const cx = colX[p.col] + colWidth[p.col] / 2;
                    const box: Rect = { height: GEO.diamond, width: GEO.diamond, x: cx - DIAMOND_R, y: cy - DIAMOND_R };
                    const node: NodeBox = {
                        ...box,
                        code: '',
                        col: p.col,
                        cx,
                        cy,
                        decision,
                        id,
                        kind: 'decision',
                        lane: laneIndex,
                        row: p.row,
                        screen: box,
                        section: sectionIndex,
                    };

                    nodes.push(node);
                    nodeById.set(id, node);

                    return;
                }

                if (!frame) {
                    return;
                }

                const size = SCREEN[frame.platform];
                const screenY = rowTop(p.row) + GEO.laneHead;
                /* «02.3» — шаг 3 основного пути; «02.3А» — тот же шаг, ветка рядом ниже. Четырёхзвенный
                   адрес гайда («06.4.1.2») владелец назвал непонятным (29.09): глубину даёт буква. */
                const letter = p.row > 0 ? ROW_LETTERS[(p.row - 1) % ROW_LETTERS.length] : '';
                const node: NodeBox = {
                    code: `${code}.${stepOfCol[p.col]}${letter}`,
                    col: p.col,
                    cx: colX[p.col] + size.width / 2,
                    cy,
                    frame,
                    height: SCREEN.desktop.height + GEO.caption,
                    id,
                    kind: 'frame',
                    lane: laneIndex,
                    mobile: frame.platform === 'desktop' ? FRAME_BY_ID.get(`${id}@m`) : undefined,
                    row: p.row,
                    screen: { height: size.height, width: size.width, x: colX[p.col], y: screenY },
                    section: sectionIndex,
                    width: nodeWidthOf(id),
                    x: colX[p.col],
                    y: screenY,
                };

                nodes.push(node);
                nodeById.set(id, node);
            });
        });

        const width = SECTION.padX * 2 + runX - GEO.columnGap - originX;
        const height = SECTION.padTop + SECTION.header + (maxRow + 1) * ROW_PITCH - GEO.rowGap + SECTION.padBottom;

        boardWidth = Math.max(boardWidth, width);
        sections.push({
            code,
            features: { comb: false, decision: false, links: false, system: false },
            height,
            index: sectionIndex,
            lanes,
            rows: maxRow + 1,
            subtitle: def.subtitle,
            title: def.title,
            width,
            x,
            y,
        });
        contexts.push({ colRight, def, index: sectionIndex });
        cursorY = y + height + SECTION.gap;
    });

    /* ---------------- проход 2: рёбра ---------------- */

    const leftOf = (node: NodeBox) => (node.kind === 'decision' ? node.cx - DIAMOND_R : node.x);
    const rightOf = (node: NodeBox) => (node.kind === 'decision' ? node.cx + DIAMOND_R : node.x + node.width);

    const addChip = (edge: EdgeDef) => {
        const a = nodeById.get(edge.from)!;
        const b = nodeById.get(edge.to)!;
        const out = (chipsOut[edge.from] ??= []);

        if (out.some(item => item.to === edge.to)) {
            return;
        }

        const chip: GoChip = {
            back: a.section === b.section && (b.row < a.row || b.col <= a.col),
            from: edge.from,
            kind: edge.kind,
            label: edge.label,
            to: edge.to,
            tone: edge.tone,
        };

        out.push(chip);
        (chipsIn[edge.to] ??= []).push(chip);
        sections[a.section].features.links = true;
    };

    contexts.forEach(({ colRight, def, index: sectionIndex }) => {
        const inSection = (id: string) => nodeById.get(id)?.section === sectionIndex;
        const defsOfEdges: EdgeDef[] = [];
        const seen = new Set<string>();
        const push = (edge: EdgeDef) => {
            const key = `${edge.from}→${edge.to}`;

            if (!seen.has(key) && nodeById.has(edge.from) && nodeById.has(edge.to)) {
                seen.add(key);
                defsOfEdges.push(edge);
            }
        };

        /*
         * Вход в ромб — кадр, стоящий на дорожке прямо перед ним. Переход X→Y, который уже
         * показан веткой ромба за X, отдельной линией не дублируем — но его КНОПКУ переносим на
         * ребро «кадр → ромб»: иначе то, что нажали перед развилкой, пропадало с карты.
         */
        const decisionAfter = new Map<string, SpecDecision>();

        def.lanes.forEach(lane =>
            lane.nodes.forEach((id, index) => {
                const next = DECISION_BY_ID.get(lane.nodes[index + 1] ?? '');
                const frame = FRAME_BY_ID.get(id);

                if (!next || !frame) {
                    return;
                }

                decisionAfter.set(id, next);
                decisionInput[next.id] = id;

                const transitions = (frame.next ?? []).map(normalizeTransition);
                const own = transitions.find(item => item.to === next.id);
                const covered = transitions.find(item => next.branches.some(branch => branch.to === item.to));
                const via = own ?? covered;

                push({
                    anchorOf: via?.to,
                    from: id,
                    kind: via?.kind ?? 'user',
                    label: via?.label,
                    to: next.id,
                });
            }),
        );

        def.lanes.forEach(lane =>
            lane.nodes.forEach(id => {
                DECISION_BY_ID.get(id)?.branches.forEach(branch =>
                    push({ from: id, kind: branch.kind ?? 'user', label: branch.label, to: branch.to, tone: branch.tone }),
                );

                (FRAME_BY_ID.get(id)?.next ?? []).map(normalizeTransition).forEach(transition => {
                    if (decisionAfter.get(id)?.branches.some(branch => branch.to === transition.to)) {
                        return;
                    }

                    push({ ...transition, from: id });
                });
            }),
        );

        /* Дорожка растёт из узла, а явного перехода нет — связь задаёт сам состав карты. */
        def.lanes.forEach(lane => {
            if (lane.from) {
                (lane.cases ? lane.nodes : lane.nodes.slice(0, 1)).forEach(id =>
                    push({ from: lane.from!, kind: 'user', to: id }),
                );
            }
        });

        /* ---------------- маршруты ---------------- */

        const laneDefOf = (id: string): MapLaneDef | undefined => {
            const node = nodeById.get(id);

            return node ? def.lanes[node.lane] : undefined;
        };
        const occupied = (row: number, col: number) =>
            nodes.some(node => node.section === sectionIndex && node.row === row && node.col === col);

        /** Ствол веток узла: из низа ромба, если колонка под ним пуста, иначе — в зазоре справа. */
        const trunkOf = (source: NodeBox, deepest: number): { start: Point; x: number; bottom: boolean } => {
            if (source.kind === 'decision') {
                let free = true;

                for (let row = source.row + 1; row <= deepest; row++) {
                    free &&= !occupied(row, source.col);
                }

                if (free) {
                    return { bottom: true, start: [source.cx, source.cy + DIAMOND_R], x: source.cx };
                }
            }

            return { bottom: false, start: [rightOf(source), source.cy], x: colRight(source.col) + GEO.fork };
        };

        /** Кнопка перехода на снимке: у ветки ромба — на кадре перед ним (там её и нажимают). */
        const anchorRectOf = (edge: EdgeDef): Rect | undefined => {
            const sourceId = nodeById.get(edge.from)?.kind === 'decision' ? decisionInput[edge.from] : edge.from;
            const source = sourceId ? nodeById.get(sourceId) : undefined;
            const anchor = source ? SNAPSHOTS[source.id]?.anchors[edge.anchorOf ?? edge.to] : undefined;

            return source && anchor ?
                {
                    height: anchor.h * source.screen.height,
                    width: anchor.w * source.screen.width,
                    x: source.screen.x + (anchor.x - anchor.w / 2) * source.screen.width,
                    y: source.screen.y + (anchor.y - anchor.h / 2) * source.screen.height,
                } :
                undefined;
        };

        /* Сначала раскладываем на формы, потом рисуем: стволу нужно знать самую глубокую ветку. */
        const straight: EdgeDef[] = [];
        const branches = new Map<string, EdgeDef[]>();

        defsOfEdges.forEach(edge => {
            const a = nodeById.get(edge.from)!;
            const b = nodeById.get(edge.to)!;
            const laneA = laneDefOf(edge.from);
            const laneB = laneDefOf(edge.to);
            const neighbours =
                a.lane === b.lane &&
                a.row === b.row &&
                !laneA?.cases &&
                laneA!.nodes.indexOf(edge.to) === laneA!.nodes.indexOf(edge.from) + 1;
            const laneStart = laneB?.nodes[0] === edge.to && laneB.from === edge.from;
            const inComb = Boolean(laneB?.cases && laneB.from === edge.from);

            if (!inSection(edge.from) || !inSection(edge.to)) {
                addChip(edge);
            } else if (neighbours) {
                straight.push(edge);
            } else if (b.row > a.row && (inComb || laneStart)) {
                (branches.get(edge.from) ?? branches.set(edge.from, []).get(edge.from)!).push(edge);
            } else {
                addChip(edge);
            }
        });

        const trunks = new Map<string, ReturnType<typeof trunkOf>>();

        branches.forEach((list, from) => {
            const deepest = Math.max(...list.map(edge => nodeById.get(edge.to)!.row));

            trunks.set(from, trunkOf(nodeById.get(from)!, deepest));
        });

        const base = (edge: EdgeDef, shape: EdgeShape, points: Point[]): EdgePath => ({
            anchor: anchorRectOf(edge),
            d: roundedPath(points),
            from: edge.from,
            id: `${edge.from}→${edge.to}`,
            kind: edge.kind,
            label: edge.label,
            section: sectionIndex,
            shape,
            to: edge.to,
            tone: edge.tone,
        });
        /** Плашка — по центру видимого отрезка, с полем с обеих сторон. */
        const labelOn = (x1: number, x2: number, y: number) => ({
            width: Math.max(96, x2 - x1 - GEO.labelMargin * 2),
            x: (x1 + x2) / 2,
            y,
        });

        straight.forEach(edge => {
            const a = nodeById.get(edge.from)!;
            const b = nodeById.get(edge.to)!;
            const x1 = rightOf(a);
            const x2 = leftOf(b);
            /* Ствол веток того же узла стартует в этом же зазоре — плашку ставим правее него. */
            const trunk = trunks.get(edge.from);
            const from = trunk && !trunk.bottom ? trunk.x : x1;

            edges.push({ ...base(edge, 'straight', [[x1, a.cy], [x2, b.cy]]), labelBox: labelOn(from, x2 - 14, a.cy) });
        });

        branches.forEach((list, from) => {
            const trunk = trunks.get(from)!;
            const head: Point[] = trunk.bottom ? [trunk.start] : [trunk.start, [trunk.x, trunk.start[1]]];

            list.forEach(edge => {
                const b = nodeById.get(edge.to)!;
                const lane = laneDefOf(edge.to)!;

                if (lane.cases && lane.from === from) {
                    /* Гребёнка: ствол → рельс над рядом → стойка в верх экрана случая. */
                    const railY = b.screen.y - GEO.combDrop;
                    const dropX = b.kind === 'decision' ? b.cx : b.screen.x + b.screen.width / 2;
                    const first = nodeById.get(lane.nodes[0])!;
                    const segmentFrom = first.id === b.id ? trunk.x : leftOf(b) - GEO.columnGap / 2;
                    const bottomY = b.kind === 'decision' ? b.cy - DIAMOND_R : b.screen.y;

                    edges.push({
                        ...base(edge, 'comb', [...head, [trunk.x, railY], [dropX, railY], [dropX, bottomY]]),
                        labelBox: labelOn(segmentFrom, dropX, railY),
                    });

                    return;
                }

                const x2 = leftOf(b);

                edges.push({
                    ...base(edge, 'branch', [...head, [trunk.x, b.cy], [x2, b.cy]]),
                    labelBox: labelOn(trunk.x, x2 - 14, b.cy),
                });
            });
        });

        /* Вход без источника: первый узел секции и отдельные истории со своим входом. */
        const hasIncomingLine = new Set(edges.filter(edge => edge.section === sectionIndex).map(edge => edge.to));

        def.lanes.forEach(lane => {
            const first = nodeById.get(lane.nodes[0]);

            if (first && !lane.from && !hasIncomingLine.has(first.id) && inSection(first.id)) {
                const x2 = leftOf(first);

                edges.push({
                    d: roundedPath([[x2 - GEO.entry, first.cy], [x2, first.cy]]),
                    from: `entry:${first.id}`,
                    id: `entry→${first.id}`,
                    kind: 'user',
                    section: sectionIndex,
                    shape: 'entry',
                    start: { x: x2 - GEO.entry, y: first.cy },
                    to: first.id,
                });
            }
        });

        const own = edges.filter(edge => edge.section === sectionIndex);
        const features = sections[sectionIndex].features;

        features.comb = own.some(edge => edge.shape === 'comb');
        features.system = own.some(edge => edge.kind === 'system');
        features.decision = nodes.some(node => node.section === sectionIndex && node.kind === 'decision');
    });

    const last = sections[sections.length - 1];

    return {
        chipsIn,
        chipsOut,
        decisionInput,
        edges,
        features: {
            comb: sections.some(section => section.features.comb),
            decision: sections.some(section => section.features.decision),
            links: sections.some(section => section.features.links),
            system: sections.some(section => section.features.system),
        },
        height: (last ? last.y + last.height : intro.y + intro.height) + BOARD_PAD,
        intro,
        nodeById,
        nodes,
        sections,
        width: BOARD_PAD * 2 + boardWidth,
    };
};
