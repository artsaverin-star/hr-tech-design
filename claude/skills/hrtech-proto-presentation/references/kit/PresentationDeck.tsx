import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '@yandex-int/hr-components/HrButton';
import { ArrowShortLeftIcon, ArrowShortRightIcon } from '@yandex-int/hr-components/Icon';
import { RadioButton } from '@yandex-int/hr-components/RadioButton';
import { Text } from '@yandex-int/hr-components/Text';

import {
    type BarTone,
    type DeviceKind,
    type HotspotRect,
    type HotspotTarget,
    type PresentationConfig,
    type PresentationScreen,
    type ScreenStep,
} from './presentationTypes';
import { typograf } from './presentationTypograf';

import styles from './PresentationDeck.module.css';

interface DeviceSpec {
    innerW: number;
    innerH: number;
    offsetX: number;
    offsetY: number;
    outerW: number;
    outerH: number;
    maxSingleScale: number;
    maxMultiScale: number;
}

const DEVICE_SPEC: Record<DeviceKind, DeviceSpec> = {
    mobile: {
        innerW: 375,
        innerH: 812,
        offsetX: 12,
        offsetY: 12,
        outerW: 399,
        outerH: 836,
        maxSingleScale: 0.95,
        maxMultiScale: 0.8,
    },
    desktop: {
        innerW: 1440,
        innerH: 900,
        offsetX: 1,
        offsetY: 33,
        outerW: 1442,
        outerH: 934,
        maxSingleScale: 0.78,
        maxMultiScale: 0.44,
    },
};

const BAR_TONE_CLASS: Record<BarTone, string> = {
    indigo: styles.toneIndigo,
    purple: styles.tonePurple,
    orange: styles.toneOrange,
    blue: styles.toneBlue,
    green: styles.toneGreen,
    neutral: styles.toneNeutral,
};

const DEFAULT_HOTSPOT_SELECTOR = 'button, [role="button"], [role="tab"], a, article, [data-hotspot]';

function buildFrameSrc(query: string): string {
    const clean = query.startsWith('?') ? query.slice(1) : query;
    const p = new URLSearchParams(clean);
    p.delete('view');
    p.delete('slide');
    p.set('viewport', 'frame');
    return `${window.location.pathname}?${p.toString()}`;
}

function findElementInDoc(
    doc: Document,
    selector: string,
    matcher: { text?: string; aria?: string; nth?: number },
): HTMLElement | null {
    const nodes = Array.from(doc.querySelectorAll<HTMLElement>(selector));
    const matches = nodes.filter(node => {
        if (matcher.aria) {
            const label = node.getAttribute('aria-label') ?? '';
            if (!label.includes(matcher.aria)) {
                return false;
            }
        }
        if (matcher.text && !(node.textContent ?? '').includes(matcher.text)) {
            return false;
        }
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    });
    const idx = matcher.nth ?? 0;
    return matches[idx] ?? null;
}

function measureHotspotInDoc(doc: Document, target: HotspotTarget, device: DeviceKind): HotspotRect | null {
    const selector = target.selector ?? DEFAULT_HOTSPOT_SELECTOR;
    const el = findElementInDoc(doc, selector, target);
    if (!el) {
        return null;
    }
    const spec = DEVICE_SPEC[device];
    const b = el.getBoundingClientRect();
    const y = Math.max(0, b.y);
    const maxBottom = target.maxBottom ?? spec.innerH;
    const h = Math.max(16, Math.min(b.height, maxBottom - y));
    return { x: b.x, y, w: b.width, h };
}

async function runStepsInDoc(doc: Document, steps: ScreenStep[]): Promise<void> {
    const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
    for (const step of steps) {
        if (step.click) {
            const sel = step.selector ?? DEFAULT_HOTSPOT_SELECTOR;
            const byText = findElementInDoc(doc, sel, { text: step.click });
            const byAria = byText ?? findElementInDoc(doc, sel, { aria: step.click });
            if (byAria) {
                byAria.click();
                byAria.blur();
            }
        }
        if (step.fill) {
            const inputs = Array.from(doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'));
            const input = inputs.find(el => {
                const ph = el.getAttribute('placeholder') ?? '';
                const al = el.getAttribute('aria-label') ?? '';
                return ph.includes(step.fill!.target) || al.includes(step.fill!.target);
            });
            if (input) {
                const proto = input.tagName === 'TEXTAREA' ?
                    window.HTMLTextAreaElement.prototype :
                    window.HTMLInputElement.prototype;
                const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                setter?.call(input, step.fill.value);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        if (step.scroll !== undefined) {
            const win = doc.defaultView;
            const top = step.scroll === 'bottom' ? doc.documentElement.scrollHeight : step.scroll;
            win?.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
        }
        await sleep(step.waitMs ?? 120);
    }
    if (doc.activeElement instanceof HTMLElement) {
        doc.activeElement.blur();
    }
}

function DeviceFrame({
    device,
    scale,
    src,
    ariaLabel,
    onFrameLoad,
}: {
    device: DeviceKind;
    scale: number;
    src: string;
    ariaLabel: string;
    onFrameLoad?: (iframe: HTMLIFrameElement) => void;
}) {
    const spec = DEVICE_SPEC[device];
    const isDesktop = device === 'desktop';

    return (
        <div
            className={styles.deviceScaled}
            /* hrds-check: allow inline-style — пропорциональный размер рамки под доступную область слайда */
            style={{ width: spec.outerW * scale, height: spec.outerH * scale }}
        >
            <div
                className={isDesktop ? styles.desktopDevice : styles.phoneDevice}
                /* hrds-check: allow inline-style — пропорциональный scale рамки устройства */
                style={{ transform: `scale(${scale})` }}
            >
                {isDesktop && (
                    <div className={styles.desktopChromeBar} aria-hidden="true">
                        <span className={styles.desktopDot} />
                        <span className={styles.desktopDot} />
                        <span className={styles.desktopDot} />
                    </div>
                )}
                <iframe
                    key={src}
                    allow="clipboard-write; web-share"
                    aria-label={ariaLabel}
                    className={isDesktop ? styles.desktopIframe : styles.phoneIframe}
                    height={spec.innerH}
                    src={src}
                    width={spec.innerW}
                    onLoad={e => onFrameLoad?.(e.currentTarget)}
                />
            </div>
        </div>
    );
}

function LiveSingleDevice({
    screen,
    defaultDevice,
    deckTitle,
}: {
    screen: PresentationScreen;
    defaultDevice: DeviceKind;
    deckTitle: string;
}) {
    const device = screen.device ?? defaultDevice;
    const spec = DEVICE_SPEC[device];
    const stageRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(device === 'desktop' ? 0.65 : 0.84);

    useLayoutEffect(() => {
        const el = stageRef.current;
        if (!el) {
            return;
        }
        const fit = () => {
            const w = el.clientWidth;
            const h = el.clientHeight;
            if (w > 0 && h > 0) {
                const minScale = device === 'desktop' ? 0.25 : 0.42;
                setScale(Math.max(minScale, Math.min(spec.maxSingleScale, w / spec.outerW, h / spec.outerH)));
            }
        };
        fit();
        const obs = new ResizeObserver(fit);
        obs.observe(el);
        return () => obs.disconnect();
    }, [device, spec.maxSingleScale, spec.outerH, spec.outerW]);

    const src = buildFrameSrc(screen.query);
    const handleLoad = (iframe: HTMLIFrameElement) => {
        if (!screen.steps?.length) {
            return;
        }
        try {
            const doc = iframe.contentDocument;
            if (doc) {
                void runStepsInDoc(doc, screen.steps);
            }
        } catch {
            // cross-origin fallback
        }
    };

    return (
        <div ref={stageRef} className={styles.deviceStage}>
            <DeviceFrame
                ariaLabel={`Интерактивный прототип «${deckTitle}»`}
                device={device}
                scale={scale}
                src={src}
                onFrameLoad={handleLoad}
            />
        </div>
    );
}

interface MeasuredHotspot {
    rect: HotspotRect;
    source: 'dom' | 'fallback';
}

function MultiScreenStage({
    screens,
    defaultDevice,
    showArrows,
}: {
    screens: PresentationScreen[];
    defaultDevice: DeviceKind;
    showArrows: boolean;
}) {
    const stageRef = useRef<HTMLDivElement>(null);
    const count = screens.length;
    const devices = screens.map(s => s.device ?? defaultDevice);
    const hasDesktop = devices.includes('desktop');
    const hasCaptions = screens.some(s => Boolean(s.caption));
    const gap = hasDesktop ? 84 : count >= 3 ? 76 : 108;

    const [stageSize, setStageSize] = useState({ w: 1200, h: 640 });
    const [measured, setMeasured] = useState<Record<number, MeasuredHotspot>>({});
    const screensKey = screens.map(s => `${s.device ?? defaultDevice}:${s.query}`).join('|');

    useEffect(() => {
        setMeasured({});
    }, [screensKey]);

    useLayoutEffect(() => {
        const el = stageRef.current;
        if (!el) {
            return;
        }
        const fit = () => {
            const w = el.clientWidth;
            const h = el.clientHeight - (hasCaptions ? 30 : 0);
            if (w > 0 && h > 0) {
                setStageSize({ w, h });
            }
        };
        fit();
        const obs = new ResizeObserver(fit);
        obs.observe(el);
        return () => obs.disconnect();
    }, [hasCaptions]);

    /* Выравниваем высоту всех устройств на слайде (работает и для одинаковых, и для пары desktop + mobile). */
    const refHeight = Math.max(...devices.map(d => DEVICE_SPEC[d].outerH));
    const unitWidthSum = devices.reduce(
        (sum, d) => sum + DEVICE_SPEC[d].outerW * (refHeight / DEVICE_SPEC[d].outerH),
        0,
    );
    const maxByW = (stageSize.w - (count - 1) * gap) / unitWidthSum;
    const maxByH = stageSize.h / refHeight;
    const maxCap = Math.min(...devices.map(d => DEVICE_SPEC[d].maxMultiScale * (DEVICE_SPEC[d].outerH / refHeight)));
    const rowHeightFactor = Math.max(0.24, Math.min(maxCap, maxByW, maxByH));

    const slots = devices.map(d => {
        const spec = DEVICE_SPEC[d];
        const scale = (refHeight * rowHeightFactor) / spec.outerH;
        return {
            device: d,
            spec,
            scale,
            w: spec.outerW * scale,
            h: spec.outerH * scale,
        };
    });

    const totalW = slots.reduce((sum, s) => sum + s.w, 0) + (count - 1) * gap;
    const rowH = Math.max(...slots.map(s => s.h));

    const slotLefts: number[] = [];
    let cursorX = 0;
    for (const s of slots) {
        slotLefts.push(cursorX);
        cursorX += s.w + gap;
    }

    const handleFrameLoad = (idx: number, iframe: HTMLIFrameElement, sc: PresentationScreen, device: DeviceKind) => {
        const capture = () => {
            if (!sc.hotspot) {
                return;
            }
            try {
                const doc = iframe.contentDocument;
                if (!doc) {
                    return;
                }
                const rect = measureHotspotInDoc(doc, sc.hotspot, device);
                if (rect) {
                    setMeasured(prev => ({ ...prev, [idx]: { rect, source: 'dom' } }));
                }
            } catch {
                // cross-origin fallback
            }
        };

        const runAndCapture = async() => {
            if (sc.steps?.length) {
                try {
                    const doc = iframe.contentDocument;
                    if (doc) {
                        await runStepsInDoc(doc, sc.steps);
                    }
                } catch {
                    // cross-origin fallback
                }
            }
            capture();
            window.setTimeout(capture, 160);
            window.setTimeout(capture, 500);
            iframe.contentDocument?.fonts?.ready.then(capture).catch(() => undefined);
        };

        void runAndCapture();
    };

    return (
        <div ref={stageRef} className={styles.flowStage}>
            <div
                className={styles.flowRow}
                /* hrds-check: allow inline-style — точный зазор между экранами для расчёта координат SVG-стрелок */
                style={{ width: totalW, gap }}
            >
                {screens.map((sc, idx) => {
                    const slot = slots[idx];
                    const src = buildFrameSrc(sc.query);
                    return (
                        <div key={`${sc.query}-${idx}`} className={styles.flowDeviceSlot}>
                            <DeviceFrame
                                ariaLabel={`Экран ${idx + 1}`}
                                device={slot.device}
                                scale={slot.scale}
                                src={src}
                                onFrameLoad={iframe => handleFrameLoad(idx, iframe, sc, slot.device)}
                            />
                            {sc.caption && (
                                <Text as="span" color="secondary" typography="bodyS" weight="medium">
                                    {typograf(sc.caption)}
                                </Text>
                            )}
                        </div>
                    );
                })}

                {showArrows && count > 1 && (
                    <svg
                        aria-hidden="true"
                        className={styles.flowSvg}
                        height={rowH}
                        viewBox={`0 0 ${totalW} ${rowH}`}
                        width={totalW}
                    >
                        {screens.slice(0, -1).map((sc, idx) => {
                            const next = screens[idx + 1];
                            const curSlot = slots[idx];
                            const nextSlot = slots[idx + 1];
                            const leftCur = slotLefts[idx];
                            const leftNext = slotLefts[idx + 1];
                            const endX = leftNext - 8;

                            if (sc.hotspot) {
                                const hit = measured[idx] ??
                                    (sc.hotspot.fallback ? { rect: sc.hotspot.fallback, source: 'fallback' as const } : null);
                                if (!hit) {
                                    return (
                                        <g key={`conn-${idx}`} data-hotspot-index={idx} data-hotspot-source="missing" />
                                    );
                                }
                                const { rect, source } = hit;
                                const pad = curSlot.device === 'desktop' ? 6 : 4;
                                const hx = leftCur + (curSlot.spec.offsetX + rect.x - pad) * curSlot.scale;
                                const hy = (curSlot.spec.offsetY + rect.y - pad) * curSlot.scale;
                                const hw = (rect.w + pad * 2) * curSlot.scale;
                                const hh = (rect.h + pad * 2) * curSlot.scale;
                                const startX = hx + hw;
                                const startY = hy + hh / 2;
                                const endY = next.targetY !== undefined ?
                                    (nextSlot.spec.offsetY + next.targetY) * nextSlot.scale :
                                    Math.max(nextSlot.h * 0.22, Math.min(nextSlot.h * 0.78, startY));
                                const midX = leftCur + curSlot.w + gap * 0.52;
                                const ctrl1X = Math.max(startX + 26, midX);
                                const ctrl2X = Math.min(endX - 24, midX);
                                const d = `M ${startX} ${startY} C ${ctrl1X} ${startY}, ${ctrl2X} ${endY}, ${endX - 8} ${endY}`;

                                return (
                                    <g key={`conn-${idx}`} data-hotspot-index={idx} data-hotspot-source={source}>
                                        <rect
                                            className={styles.hotspotRect}
                                            height={hh}
                                            rx={Math.min(12 * curSlot.scale, hh / 2)}
                                            width={hw}
                                            x={hx}
                                            y={hy}
                                        />
                                        <path className={styles.flowConnector} d={d} fill="none" />
                                        <circle className={styles.hotspotDot} cx={startX} cy={startY} r={5} />
                                        <polygon
                                            className={styles.flowArrowHead}
                                            points={`${endX},${endY} ${endX - 11},${endY - 6} ${endX - 11},${endY + 6}`}
                                        />
                                    </g>
                                );
                            }

                            const startX = leftCur + curSlot.w + 10;
                            const y = rowH * 0.5;
                            return (
                                <g key={`conn-${idx}`}>
                                    <line
                                        className={styles.flowConnector}
                                        x1={startX}
                                        x2={endX - 8}
                                        y1={y}
                                        y2={y}
                                    />
                                    <polygon
                                        className={styles.flowArrowHead}
                                        points={`${endX},${y} ${endX - 11},${y - 6} ${endX - 11},${y + 6}`}
                                    />
                                </g>
                            );
                        })}
                    </svg>
                )}
            </div>
        </div>
    );
}

export function PresentationDeck({
    config,
    slideIndex,
    onChangeSlide,
    onOpenPrototype,
    onOpenSecondary,
}: {
    config: PresentationConfig;
    slideIndex: number;
    onChangeSlide: (index: number) => void;
    onOpenPrototype: (targetSearch: string) => void;
    onOpenSecondary?: () => void;
}) {
    const slides = config.slides;
    const safeIndex = Math.max(0, Math.min(slides.length - 1, slideIndex));
    const slide = slides[safeIndex];
    const [toggleGroupId, setToggleGroupId] = useState<string>(() => {
        const firstToggle = slides.find(s => s.kind === 'toggleNumbers');
        return firstToggle && firstToggle.kind === 'toggleNumbers' ? (firstToggle.groups[0]?.id ?? '') : '';
    });
    const canvasRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        canvasRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        if (slide.kind === 'toggleNumbers' && slide.groups.length > 0) {
            setToggleGroupId(slide.groups[0].id);
        }
    }, [safeIndex, slide]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                return;
            }
            if ((e.key === 'ArrowRight' || e.key === ' ') && safeIndex < slides.length - 1) {
                e.preventDefault();
                onChangeSlide(safeIndex + 1);
            } else if (e.key === 'ArrowLeft' && safeIndex > 0) {
                e.preventDefault();
                onChangeSlide(safeIndex - 1);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [safeIndex, slides.length, onChangeSlide]);

    const progressPct = Math.round(((safeIndex + 1) / slides.length) * 100);
    const currentQuery =
        slide.kind === 'single' ?
            slide.screen.query :
            slide.kind === 'flow' || slide.kind === 'compare' ?
                slide.screens[slide.screens.length - 1]?.query ?? '' :
                slide.kind === 'checklist' ?
                    slide.primaryQuery ?? null :
                    null;

    return (
        <div
            className={styles.deck}
            data-presentation-deck="1"
            data-slide-count={slides.length}
            data-slide-id={slide.id}
            data-slide-index={safeIndex}
            data-slide-kind={slide.kind}
        >
            <div className={styles.progressTrack} aria-hidden="true">
                {/* hrds-check: allow inline-style — ширина прогресса слайдов в % */}
                <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
            </div>

            <main ref={canvasRef} className={styles.canvas}>
                {slide.kind === 'single' && (
                    (slide.screen.device ?? config.defaultDevice) === 'desktop' ? (
                        <div className={styles.flowSlide}>
                            <div className={styles.flowHeader}>
                                <Text as="h1" className={styles.slideTitleWide} typography="displayS" weight="medium">
                                    {typograf(slide.title)}
                                </Text>
                                <Text as="p" className={styles.slideLeadWide} color="secondary" typography="bodyL">
                                    {typograf(slide.body)}
                                </Text>
                            </div>
                            <LiveSingleDevice
                                deckTitle={config.title}
                                defaultDevice={config.defaultDevice}
                                screen={slide.screen}
                            />
                        </div>
                    ) : (
                        <div className={styles.splitSlide}>
                            <div className={styles.storyCol}>
                                <Text as="h1" className={styles.slideTitle} typography="displayM" weight="medium">
                                    {typograf(slide.title)}
                                </Text>
                                <Text as="p" className={styles.slideLead} color="secondary" typography="bodyL">
                                    {typograf(slide.body)}
                                </Text>
                            </div>
                            <aside className={styles.deviceCol} aria-label="Интерактивный экран прототипа">
                                <LiveSingleDevice
                                    deckTitle={config.title}
                                    defaultDevice={config.defaultDevice}
                                    screen={slide.screen}
                                />
                            </aside>
                        </div>
                    )
                )}

                {(slide.kind === 'flow' || slide.kind === 'compare') && (
                    <div className={styles.flowSlide}>
                        <div className={styles.flowHeader}>
                            <Text as="h1" className={styles.slideTitleWide} typography="displayS" weight="medium">
                                {typograf(slide.title)}
                            </Text>
                            <Text as="p" className={styles.slideLeadWide} color="secondary" typography="bodyL">
                                {typograf(slide.body)}
                            </Text>
                        </div>
                        <MultiScreenStage
                            defaultDevice={config.defaultDevice}
                            screens={slide.screens}
                            showArrows={slide.kind === 'flow' ? true : slide.arrows !== false}
                        />
                    </div>
                )}

                {slide.kind === 'numbers' && (
                    <div className={styles.centerSlide}>
                        <div className={styles.storyCol}>
                            <Text as="h1" className={styles.slideTitleWide} typography="displayM" weight="medium">
                                {typograf(slide.title)}
                            </Text>
                            <Text as="p" className={styles.slideLeadWide} color="secondary" typography="bodyL">
                                {typograf(slide.body)}
                            </Text>
                        </div>
                        <div
                            className={`${styles.heroNumbers} ${slide.items.length === 2 ? styles.heroNumbersTwo : ''}`}
                        >
                            {slide.items.slice(0, 3).map(item => (
                                <div key={item.label} className={styles.heroNumberItem}>
                                    <Text as="span" className={styles.tabular} typography="displayL" weight="medium">
                                        {item.value}
                                    </Text>
                                    <Text as="span" color="secondary" typography="bodyM">
                                        {typograf(item.label)}
                                    </Text>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {slide.kind === 'bars' && (
                    <div className={styles.centerSlide}>
                        <div className={styles.storyCol}>
                            <Text as="h1" className={styles.slideTitleWide} typography="displayM" weight="medium">
                                {typograf(slide.title)}
                            </Text>
                            <Text as="p" className={styles.slideLeadWide} color="secondary" typography="bodyL">
                                {typograf(slide.body)}
                            </Text>
                        </div>
                        <div className={styles.barList}>
                            {slide.bars.slice(0, 5).map(bar => {
                                const max = bar.max ?? 100;
                                const pct = Math.min(100, Math.max(5, Math.round((bar.value / max) * 100)));
                                return (
                                    <div key={bar.label} className={styles.barItem}>
                                        <div className={styles.barTop}>
                                            <Text as="span" typography="bodyM" weight="medium">
                                                {typograf(bar.label)}
                                            </Text>
                                            <Text as="span" className={styles.tabular} color="secondary" typography="bodyM">
                                                {bar.display}
                                            </Text>
                                        </div>
                                        <div className={styles.barTrack} aria-hidden="true">
                                            {/* hrds-check: allow inline-style — процентная длина полосы метрики */}
                                            <span
                                                className={`${styles.barFill} ${BAR_TONE_CLASS[bar.tone]}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {slide.kind === 'toggleNumbers' && (() => {
                    const activeGroup = slide.groups.find(g => g.id === toggleGroupId) ?? slide.groups[0];
                    return (
                        <div className={styles.centerSlide}>
                            <div className={styles.storyCol}>
                                <Text as="h1" className={styles.slideTitleWide} typography="displayM" weight="medium">
                                    {typograf(slide.title)}
                                </Text>
                                <Text as="p" className={styles.slideLeadWide} color="secondary" typography="bodyL">
                                    {typograf(slide.body)}
                                </Text>
                            </div>
                            <div className={styles.toggleRow}>
                                <RadioButton
                                    aria-label={slide.ariaLabel}
                                    name={`deck-toggle-${slide.id}`}
                                    options={slide.groups.map(g => ({ value: g.id, children: g.label }))}
                                    size="m"
                                    value={activeGroup?.id ?? ''}
                                    onChange={e => setToggleGroupId(e.currentTarget.value)}
                                />
                            </div>
                            {activeGroup && (
                                <div
                                    className={`${styles.heroNumbers} ${activeGroup.items.length === 2 ? styles.heroNumbersTwo : ''}`}
                                >
                                    {activeGroup.items.slice(0, 3).map(item => (
                                        <div key={item.label} className={styles.heroNumberItem}>
                                            <Text as="span" className={styles.tabular} typography="displayL" weight="medium">
                                                {item.value}
                                            </Text>
                                            <Text as="span" color="secondary" typography="bodyM">
                                                {typograf(item.label)}
                                            </Text>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {slide.kind === 'checklist' && (
                    <div className={styles.centerSlide}>
                        <div className={styles.storyCol}>
                            <Text as="h1" className={styles.slideTitleWide} typography="displayM" weight="medium">
                                {typograf(slide.title)}
                            </Text>
                            <Text as="p" className={styles.slideLeadWide} color="secondary" typography="bodyL">
                                {typograf(slide.body)}
                            </Text>
                        </div>
                        <div className={styles.checklistGrid}>
                            {slide.items.slice(0, 6).map((item, idx) => (
                                <div key={item.title} className={styles.checklistRow}>
                                    <Text as="span" className={styles.checklistNum} color="secondary" typography="bodyM">
                                        {`0${idx + 1}`}
                                    </Text>
                                    <div className={styles.checklistCopy}>
                                        <Text as="span" typography="bodyM" weight="medium">
                                            {typograf(item.title)}
                                        </Text>
                                        {item.detail && (
                                            <Text as="span" color="secondary" typography="bodyS">
                                                {typograf(item.detail)}
                                            </Text>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className={styles.finalActions}>
                            <Button
                                size="m"
                                view="primary"
                                onClick={() => onOpenPrototype(slide.primaryQuery ? `?${slide.primaryQuery}` : '')}
                            >
                                {slide.primaryActionLabel ?? 'Открыть прототип'}
                            </Button>
                            {onOpenSecondary && (
                                <Button size="m" view="secondary" onClick={onOpenSecondary}>
                                    {slide.secondaryActionLabel ?? 'Открыть карту'}
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </main>

            <footer className={styles.footerNav}>
                <div className={styles.footerGroup}>
                    <Button
                        iconLeft={ArrowShortLeftIcon}
                        isDisabled={safeIndex === 0}
                        size="s"
                        view="secondary"
                        onClick={() => onChangeSlide(safeIndex - 1)}
                    >
                        Назад
                    </Button>
                    <Text as="span" className={styles.tabular} color="secondary" typography="bodyS">
                        {`${safeIndex + 1} / ${slides.length}`}
                    </Text>
                    <Button
                        iconRight={ArrowShortRightIcon}
                        isDisabled={safeIndex === slides.length - 1}
                        size="s"
                        view="primary"
                        onClick={() => onChangeSlide(safeIndex + 1)}
                    >
                        Дальше
                    </Button>
                </div>

                <div className={styles.footerGroup}>
                    {currentQuery !== null && (
                        <Button
                            size="s"
                            view="ghost"
                            onClick={() => onOpenPrototype(currentQuery ? `?${currentQuery}` : '')}
                        >
                            Попробовать в прототипе
                        </Button>
                    )}
                    {onOpenSecondary && (
                        <Button size="s" view="ghost" onClick={onOpenSecondary}>
                            Карта
                        </Button>
                    )}
                </div>
            </footer>
        </div>
    );
}
