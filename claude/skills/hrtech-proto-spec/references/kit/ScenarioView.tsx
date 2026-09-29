import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@yandex-int/hr-components/HrButton';
import { HrSelect } from '@yandex-int/hr-components/HrSelect';
import { Link } from '@yandex-int/hr-components/Link';
import { RadioButton } from '@yandex-int/hr-components/RadioButton';
import { Text } from '@yandex-int/hr-components/Text';

import { buildBoard, type NodeBox, nodeTitle, normalizeTransition, type SectionBox } from './map-board';
import { type SpecFrame, type SpecStatus } from './spec';
import { SNAPSHOTS } from './spec-snapshots';
import { useUrlState } from './url-state';

import styles from './ScenarioView.module.css';

/**
 * «Сценарий» — та же спека, что «Карта», но прочитанная по шагам: один крупный ЖИВОЙ экран,
 * снизу лента пути (снимки, стрелки, ромбы), сверху — что происходит на шаге и куда из него
 * можно пойти. Состав общий с картой (`spec-sections.ts` → `buildBoard`): секция = сценарий,
 * основной путь = шаги «Назад / Дальше», дорожки ниже = исходы. Коды экранов совпадают с
 * картой, поэтому «02.3А» в обсуждении находится и там, и здесь.
 */

const VIEWPORT = { desktop: { height: 860, width: 1440 }, mobile: { height: 812, width: 375 } };

/** Подписи — как у светофора на борде в Figma и на «Карте». */
const STATUS_LABEL: Record<SpecStatus, string> = { question: 'Нужен редактор', ready: 'Готово', wip: 'На ревью' };

/** Шаг с рецептом (`?seed=`) показываем, когда путь доигран, — а не промежуточные экраны. */
const seedState = (iframe: HTMLIFrameElement | null): string | undefined => {
    try {
        return iframe?.contentDocument?.documentElement.dataset.specSeed;
    } catch {
        return undefined;
    }
};

const option = (value: string, label: string) => ({
    type: 'simple' as const,
    id: value,
    itemData: { value, label },
});

const frameSrc = (frame: SpecFrame) => {
    const params = new URLSearchParams(frame.url.replace(/^\?/, ''));

    params.set('viewport', 'frame');
    params.set('motion', 'off');

    return `${window.location.pathname}?${params}`;
};

/** Один живой кадр: масштаб меняет только внешнюю рамку, не сбрасывает действия внутри. */
const ScenarioPreview = ({ frame, reset, zoom }: { frame: SpecFrame; reset: number; zoom: 'fit' | 'actual' }) => {
    const host = useRef<HTMLDivElement>(null);
    const [available, setAvailable] = useState({ height: 0, width: 0 });
    const iframe = useRef<HTMLIFrameElement>(null);
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const dimensions = VIEWPORT[frame.platform];
    const seeded = new URLSearchParams(frame.url.replace(/^\?/, '')).has('seed');
    /* «Вписать» — экран целиком: и по ширине, и по высоте (иначе поле ввода внизу срезалось). */
    const fitScale = Math.min(1, (available.height - 16) / dimensions.height, available.width / dimensions.width);
    const scale = zoom === 'actual' ? 1 : Math.max(0.1, fitScale);

    useLayoutEffect(() => {
        const element = host.current;

        if (!element) {
            return undefined;
        }

        const observer = new ResizeObserver(([entry]) => {
            setAvailable({ height: entry.contentRect.height, width: entry.contentRect.width });
        });

        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        setLoaded(false);
        setFailed(false);
        const timer = window.setTimeout(() => setFailed(true), 20000);

        return () => window.clearTimeout(timer);
    }, [frame.id, reset]);

    return (
        <div
            ref={host}
            aria-label="Экран прототипа"
            className={styles.preview}
            data-platform={frame.platform}
        >
            {!loaded && (
                <div className={styles.loading} role="status">
                    <Text color="secondary" typography="bodyS">
                        {failed ?
                            'Экран не загрузился. Нажмите «Сбросить экран» или откройте его в новой вкладке.' :
                            seeded ? 'Проигрываем путь к этому шагу…' : 'Загружаем экран…'}
                    </Text>
                </div>
            )}
            {available.width > 0 && (
                <div
                    className={styles.canvas}
                    style={{ height: dimensions.height * scale, width: dimensions.width * scale }}
                >
                    <iframe
                        key={`${frame.id}:${reset}`}
                        className={styles.frame}
                        src={frameSrc(frame)}
                        style={{
                            height: dimensions.height,
                            opacity: loaded ? 1 : 0,
                            transform: `scale(${scale})`,
                            width: dimensions.width,
                        }}
                        title={frame.title}
                        ref={iframe}
                        onLoad={() => {
                            const reveal = () => {
                                setLoaded(true);
                                host.current?.scrollTo(0, 0);
                            };

                            if (!seeded) {
                                reveal();

                                return;
                            }

                            /* Ждём, пока рецепт доиграет путь; сломанный рецепт показывает свою плашку. */
                            const started = performance.now();
                            const poll = () => {
                                const state = seedState(iframe.current);

                                if (state === 'ready' || state === 'failed' || performance.now() - started > 20000) {
                                    reveal();
                                } else {
                                    window.setTimeout(poll, 150);
                                }
                            };

                            poll();
                        }}
                    />
                </div>
            )}
        </div>
    );
};

/** Лента пути: снимки шагов основного пути со стрелками и ромбами — где я и что дальше. */
const PathStrip = ({
    current,
    mobile,
    nodes,
    onSelect,
}: {
    current: string;
    /** Режим «Телефон»: миниатюры — снимки 375, если они есть. */
    mobile: boolean;
    nodes: NodeBox[];
    onSelect: (id: string) => void;
}) => {
    const strip = useRef<HTMLOListElement>(null);

    /* Текущий шаг всегда в поле зрения ленты. */
    useEffect(() => {
        strip.current
            ?.querySelector('[aria-current="step"]')
            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [current]);

    return (
        <ol ref={strip} aria-label="Путь сценария" className={styles.strip}>
            {nodes.map((node, index) => (
                <li key={node.id} className={styles.stripItem}>
                    {index > 0 ? <span aria-hidden="true" className={styles.stripArrow} /> : null}
                    {node.kind === 'decision' ? (
                        <span className={styles.stripDiamond} title={node.decision?.question}>
                            <span className={styles.stripDiamondShape} />
                            <Text as="span" className={styles.stripDiamondText} typography="captionM">
                                {node.decision?.question}
                            </Text>
                        </span>
                    ) : (
                        /* Миниатюра шага — кнопка ДС со снимком внутри, подпись под ней. */
                        <span className={styles.stripStep}>
                            <Button
                                aria-current={node.id === current ? 'step' : undefined}
                                aria-label={`${node.code} ${nodeTitle(node)}`}
                                className={styles.stripThumb}
                                data-platform={mobile && node.mobile ? 'mobile' : 'desktop'}
                                hasOverflowTooltip={false}
                                hasSlots={false}
                                view="ghost"
                                onClick={() => onSelect(node.id)}
                            >
                                {(mobile && SNAPSHOTS[`${node.id}@m`]) || SNAPSHOTS[node.id] ? (
                                    <img
                                        alt=""
                                        draggable={false}
                                        src={((mobile && SNAPSHOTS[`${node.id}@m`]) || SNAPSHOTS[node.id]).url}
                                    />
                                ) : null}
                            </Button>
                            <Text
                                as="span"
                                className={styles.stripCaption}
                                color={node.id === current ? 'primary' : 'secondary'}
                                typography="captionM"
                            >
                                {node.code} {nodeTitle(node)}
                            </Text>
                        </span>
                    )}
                </li>
            ))}
        </ol>
    );
};

/** Источник дорожки: кадр или ромб, из которого она растёт (по ребру ветки на карте). */
const findLaneSource = (board: ReturnType<typeof buildBoard>, node: NodeBox): string | undefined => {
    const firstOfLane = board.nodes
        .filter(item => item.section === node.section && item.lane === node.lane)
        .sort((a, b) => a.col - b.col)[0];
    const edge = board.edges.find(
        item => item.to === firstOfLane?.id && (item.shape === 'branch' || item.shape === 'comb'),
    );

    return edge?.from;
};

type ScenarioViewProps = {
    /** Переход на «Карту» к секции текущего шага; вид принадлежит панели `PrototypeDraft`. */
    onOpenMap: () => void;
};

export const ScenarioView = ({ onOpenMap }: ScenarioViewProps) => {
    const { pathname, replaceParams, searchParams } = useUrlState();
    const board = useMemo(buildBoard, []);
    const frames = board.nodes.filter(node => node.kind === 'frame');

    /* Шаг — id кадра (у телефона `<id>@m`); без шага — начало первого сценария. */
    const requestedStep = searchParams.get('step') ?? '';
    const requestedDesktop = requestedStep.replace(/@m$/, '');
    const node =
        board.nodeById.get(requestedDesktop)?.kind === 'frame' ?
            board.nodeById.get(requestedDesktop)! :
            (frames[0] as NodeBox | undefined);
    const section: SectionBox | undefined = node ? board.sections[node.section] : undefined;
    const wantsMobile = requestedStep.endsWith('@m') || searchParams.get('device') === 'mobile';
    const platform: 'desktop' | 'mobile' = wantsMobile && node?.mobile ? 'mobile' : 'desktop';
    const frame = platform === 'mobile' ? node?.mobile : node?.frame;

    const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
    const [reset, setReset] = useState(0);
    const [copied, setCopied] = useState(false);
    const copyTimer = useRef<number>();

    useEffect(() => () => window.clearTimeout(copyTimer.current), []);
    useEffect(() => setCopied(false), [node?.id, platform]);

    if (!node || !frame || !section) {
        return (
            <div className={styles.empty}>
                <Text color="secondary" typography="bodyM">
                    В спеке нет ни одного экрана.
                </Text>
            </div>
        );
    }

    const sectionNodes = board.nodes.filter(item => item.section === section.index);
    const nodesOfLane = (index: number) =>
        sectionNodes.filter(item => item.lane === index).sort((a, b) => a.col - b.col);
    /* Основной путь — первая дорожка; ветки и отдельные истории — остальные, по порядку состава. */
    const mainLane = section.lanes[0]?.index ?? 0;
    const path = nodesOfLane(mainLane);
    /* Лента и «Назад / Дальше» идут по дорожке текущего шага: на ветке — по ветке. */
    const lane = section.lanes.find(item => item.index === node.lane);
    const laneNodes = nodesOfLane(node.lane);
    const laneFrames = laneNodes.filter(item => item.kind === 'frame');
    const stepIndex = laneFrames.findIndex(item => item.id === node.id);
    const branchLanes = section.lanes
        .filter(item => item.index !== mainLane)
        .map(item => ({ lane: item, nodes: nodesOfLane(item.index) }))
        .filter(group => group.nodes.length);

    const select = (id: string, nextPlatform: 'desktop' | 'mobile' = platform) => {
        const target = board.nodeById.get(id);

        if (!target || target.kind !== 'frame') {
            return;
        }

        const params = new URLSearchParams(window.location.search);

        params.set('spec', '1');
        params.set('step', nextPlatform === 'mobile' && target.mobile ? `${id}@m` : id);
        params.delete('scenario');
        params.delete('state');
        params.delete('device');
        replaceParams(params);
    };

    /* Куда можно пойти отсюда: переходы кадра и ветки ромба, который стоит на дорожке сразу за ним. */
    const decision = laneNodes[laneNodes.indexOf(node) + 1]?.decision;
    const outgoing = [
        ...(node.frame?.next ?? [])
            .map(normalizeTransition)
            .map(item => ({ label: item.label, system: item.kind === 'system', to: item.to })),
        ...(decision?.branches ?? []).map(branch => ({
            label: branch.label,
            system: branch.kind === 'system',
            to: branch.to,
        })),
    ].filter((item, index, list) => {
        const target = board.nodeById.get(item.to);

        return target?.kind === 'frame' && list.findIndex(other => other.to === item.to) === index;
    });

    const openParams = new URLSearchParams(frame.url.replace(/^\?/, ''));

    if (platform === 'mobile') {
        openParams.set('viewport', 'mobile');
    }

    const copyLink = async() => {
        const url = new URL(window.location.href);

        url.searchParams.set('spec', '1');
        url.searchParams.set('step', frame.id);

        try {
            await navigator.clipboard.writeText(url.href);
            setCopied(true);
            window.clearTimeout(copyTimer.current);
            copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    };

    const openOnMap = () => {
        const params = new URLSearchParams(window.location.search);

        params.set('zone', section.code);
        params.set('node', node.id);
        window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
        onOpenMap();
    };

    /* Источник ветки (кадр или ромб над ней) — первым в ленте, чтобы было видно, откуда пришли. */
    const laneSource = lane && lane.index !== mainLane ?
        board.nodes.find(item => item.section === section.index && item.id === findLaneSource(board, node)) :
        undefined;
    const strip = laneSource ? [laneSource, ...laneNodes] : laneNodes;
    const prev = stepIndex > 0 ? laneFrames[stepIndex - 1] : laneSource?.kind === 'frame' ? laneSource : null;
    const next = stepIndex >= 0 && stepIndex < laneFrames.length - 1 ? laneFrames[stepIndex + 1] : null;
    const onMain = node.lane === mainLane;
    const restart = onMain ? path.find(item => item.kind === 'frame') : laneSource?.kind === 'frame' ? laneSource : path.find(item => item.kind === 'frame');

    return (
        <div className={styles.root}>
            <aside aria-label="Выбор сценария" className={styles.sidebar}>
                <Text as="h2" className={styles.sidebarTitle} typography="titleS">
                    Сценарии
                </Text>
                <nav aria-label="Сценарии прототипа" className={styles.nav}>
                    {board.sections.map(item => {
                        const firstFrame = board.nodes
                            .filter(n => n.section === item.index && n.kind === 'frame')
                            .sort((a, b) => a.row - b.row || a.col - b.col)[0];
                        const isOpen = item.index === section.index;

                        return (
                            <div key={item.code} className={styles.navGroup}>
                                <Button
                                    aria-expanded={isOpen}
                                    isChecked={isOpen}
                                    size="m"
                                    stretch
                                    textProps={{ align: 'left' }}
                                    view="ghost"
                                    onClick={() => firstFrame && select(firstFrame.id)}
                                >
                                    <span className={styles.navItem}>
                                        <Text as="span" color="secondary" typography="captionM">
                                            {item.code}
                                        </Text>
                                        <Text as="span" className={styles.navTitle} typography="bodyS">
                                            {item.title}
                                        </Text>
                                    </span>
                                </Button>
                                {isOpen ? (
                                    <div className={styles.navSteps}>
                                        <ol aria-label="Основной путь" className={styles.steps}>
                                            {path.map(step =>
                                                step.kind === 'decision' ? (
                                                    <li key={step.id} className={styles.stepFork}>
                                                        <span aria-hidden="true" className={styles.forkMark} />
                                                        <Text as="span" color="secondary" typography="captionM">
                                                            {step.decision?.question}
                                                        </Text>
                                                    </li>
                                                ) : (
                                                    <li key={step.id}>
                                                        <Button
                                                            aria-current={step.id === node.id ? 'step' : undefined}
                                                            isChecked={step.id === node.id}
                                                            size="s"
                                                            stretch
                                                            textProps={{ align: 'left' }}
                                                            view="ghost"
                                                            onClick={() => select(step.id)}
                                                        >
                                                            <span className={styles.stepLabel}>
                                                                <Text as="span" color="secondary" typography="captionM">
                                                                    {step.code}
                                                                </Text>
                                                                <Text as="span" className={styles.stepTitle} typography="bodyS">
                                                                    {nodeTitle(step)}
                                                                </Text>
                                                            </span>
                                                        </Button>
                                                    </li>
                                                ),
                                            )}
                                        </ol>
                                        {branchLanes.map(group => (
                                            <div key={group.lane.index} className={styles.branch}>
                                                <Text as="p" className={styles.branchTitle} color="secondary" typography="captionM">
                                                    {group.lane.title ?? 'Ветка'}
                                                </Text>
                                                <ul className={styles.steps}>
                                                    {group.nodes.map(step => step.kind === 'decision' ? (
                                                        <li key={step.id} className={styles.stepFork}>
                                                            <span aria-hidden="true" className={styles.forkMark} />
                                                            <Text as="span" color="secondary" typography="captionM">
                                                                {step.decision?.question}
                                                            </Text>
                                                        </li>
                                                    ) : (
                                                        <li key={step.id}>
                                                            <Button
                                                                aria-current={step.id === node.id ? 'step' : undefined}
                                                                isChecked={step.id === node.id}
                                                                size="s"
                                                                stretch
                                                                textProps={{ align: 'left' }}
                                                                view="ghost"
                                                                onClick={() => select(step.id)}
                                                            >
                                                                <span className={styles.stepLabel}>
                                                                    <Text as="span" color="secondary" typography="captionM">
                                                                        {step.code}
                                                                    </Text>
                                                                    <Text as="span" className={styles.stepTitle} typography="bodyS">
                                                                        {nodeTitle(step)}
                                                                    </Text>
                                                                </span>
                                                            </Button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </nav>
            </aside>

            <main className={styles.main}>
                <div className={styles.mobileNavigation}>
                    <HrSelect
                        aria-label="Шаг сценария"
                        options={frames.map(item => option(item.id, `${item.code} · ${nodeTitle(item)}`))}
                        value={node.id}
                        width="fill"
                        onValueChange={value => select(String(value))}
                    />
                </div>

                <header className={styles.header}>
                    <div className={styles.heading} aria-live="polite">
                        <Text as="p" color="secondary" typography="captionM">
                            {section.code} · {section.title} ·{' '}
                            {onMain ? '' : `${lane?.title ?? 'ветка'} · `}
                            шаг {stepIndex + 1} из {laneFrames.length}
                        </Text>
                        <div className={styles.titleRow}>
                            <Text as="span" className={styles.code} typography="titleM">
                                {node.code}
                            </Text>
                            <Text as="h1" className={styles.title} typography="titleM">
                                {frame.title}
                            </Text>
                            {frame.status ? (
                                <span className={styles.statusPill} data-status={frame.status}>
                                    <span className={styles.statusDot} />
                                    <Text as="span" typography="captionM">
                                        {STATUS_LABEL[frame.status]}
                                    </Text>
                                </span>
                            ) : null}
                        </div>
                        {node.frame?.caption ? (
                            <Text as="p" className={styles.caption} color="secondary" typography="bodyM">
                                {platform === 'mobile' && node.mobile?.caption ? node.mobile.caption : node.frame.caption}
                            </Text>
                        ) : null}
                    </div>
                    <div className={styles.links}>
                        <Button size="s" view="ghost" onClick={openOnMap}>
                            На карте
                        </Button>
                        <Button size="s" view="ghost" onClick={copyLink}>
                            {copied ? 'Ссылка скопирована' : 'Ссылка на шаг'}
                        </Button>
                        <Link
                            href={`${pathname}?${openParams}`}
                            overflowTooltipProps={null}
                            rel="noopener noreferrer"
                            size="s"
                            target="_blank"
                            view="link"
                        >
                            Открыть экран ↗
                        </Link>
                    </div>
                </header>

                <div className={styles.toolbar}>
                    <RadioButton
                        aria-label="Устройство"
                        name="scenario-platform"
                        options={[
                            { children: 'Десктоп', value: 'desktop' },
                            { children: 'Телефон', disabled: !node.mobile, value: 'mobile' },
                        ]}
                        size="s"
                        value={platform}
                        onChange={event => select(node.id, event.target.value as 'desktop' | 'mobile')}
                    />
                    <RadioButton
                        aria-label="Масштаб экрана"
                        name="scenario-zoom"
                        options={[
                            { children: 'Вписать', value: 'fit' },
                            { children: '100%', value: 'actual' },
                        ]}
                        size="s"
                        value={zoom}
                        onChange={event => setZoom(event.target.value as 'fit' | 'actual')}
                    />
                    <Button size="s" view="ghost" onClick={() => setReset(value => value + 1)}>
                        Сбросить экран
                    </Button>
                    {outgoing.length ? (
                        <div aria-label="Куда отсюда" className={styles.outgoing} role="group">
                            <Text as="span" color="secondary" typography="captionM">
                                Отсюда:
                            </Text>
                            {outgoing.map(item => {
                                const target = board.nodeById.get(item.to)!;

                                return (
                                    <Button
                                        key={item.to}
                                        size="s"
                                        title={`${item.label ?? 'Переход'} → ${nodeTitle(target)}`}
                                        view="secondary"
                                        onClick={() => select(item.to)}
                                    >
                                        <span className={styles.outgoingInk}>
                                            <span>{target.code}</span>
                                            {item.label ?? nodeTitle(target)}
                                        </span>
                                    </Button>
                                );
                            })}
                        </div>
                    ) : null}
                </div>

                <ScenarioPreview frame={frame} reset={reset} zoom={zoom} />

                <footer className={styles.footer}>
                    <Button
                        isDisabled={!prev}
                        size="m"
                        view="secondary"
                        onClick={() => prev && select(prev.id)}
                    >
                        ← Назад
                    </Button>
                    <PathStrip current={node.id} mobile={platform === 'mobile'} nodes={strip} onSelect={select} />
                    <Button
                        size="m"
                        view="primary"
                        onClick={() => select((next ?? restart ?? node).id)}
                    >
                        {next ? 'Дальше →' : onMain ? 'Сначала' : 'К началу ветки'}
                    </Button>
                </footer>
            </main>
        </div>
    );
};
