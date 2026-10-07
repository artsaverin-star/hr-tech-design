import { type ReactNode, useEffect, useState } from 'react';

import { RadioButton } from '@yandex-int/hr-components/RadioButton';
import { Text } from '@yandex-int/hr-components/Text';

import { seedStarted } from './spec-seed-runtime';
import { applySpecSeed, hasSpecSeed } from './spec-seeds';
import { SpecView } from './SpecView';

import styles from './SpecGate.module.css';

/**
 * ВХОД В СПЕКУ для прототипа без своей панели режимов (комплект hrtech-proto-spec v6).
 *
 * Подключение — одна обёртка в `src/index.tsx`, ВНУТРИ `PrototypeProviders` (виды спеки собраны
 * на HRDS и без провайдеров не работают). Установщик вписывает её сам, если корень стандартный:
 *
 *     <PrototypeProviders>
 *         <SpecGate title="Название прототипа">
 *             <PrototypeDraft />
 *         </SpecGate>
 *     </PrototypeProviders>
 *
 * Что делает:
 * - нет `spec` в адресе — рендерится сам прототип, как раньше;
 * - `?spec=map` (и любой `?spec`) — «Карта»; вида «Сценарий» нет (владелец 6.10.2026: «никогда не делай»);
 * - `?seed=<id>` — запускает рецепт из `spec-seeds.ts` после первой отрисовки (вариант Б — рецепты
 *   из одних `clicks`); если модель прототипа уже запустила рецепт сама (вариант А), не мешает.
 *   Хранилище прототипа на шаге спеки — память страницы (чистый старт, `spec-seed-runtime.ts`);
 * - `motion=off` — без анимаций и переходов (так снимаются кадры карты);
 * - `viewport=frame` — голая сцена кадра: элементы с `data-spec-chrome` (демо-панель прототипа,
 *   переключатели сценариев) прячутся, когда рецепт доиграл — кликнуть по ним рецепт успевает;
 * - `viewport=mobile` — прототип в рамке телефона 375×812 (так клик по телефону на карте открывает шаг).
 *
 * У прототипа уже есть своя панель режимов (как у «Я Team & Mars») — обёртка не нужна:
 * рендери `SpecView` там, где панель переключает вид, и повтори здесь то, что нужно из списка выше.
 */

const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search);

if (typeof document !== 'undefined') {
    if (params.get('motion') === 'off') {
        document.documentElement.dataset.specMotion = 'off';
    }

    /* specprobe=1 — разведка (`--probe`): панель прототипа оставляем, её кнопки нужны рецептам. */
    if (params.get('viewport') === 'frame' && !params.has('specprobe')) {
        document.documentElement.dataset.specViewport = 'frame';
    }

    /* С рецептом панель прототипа прячется только после `data-spec-seed="ready"`. */
    if (params.has('seed')) {
        document.documentElement.dataset.specHasSeed = '';
    }
}

/* «Вид» — как панель режимов эталона: из спеки можно вернуться в прототип и переключить вид. */
const VIEW_OPTIONS = [
    { children: 'Прототип', value: 'prototype' },
    { children: 'Карта', value: 'map' },
];

type SpecMode = 'map';

/* Любой `spec` — «Карта»: старые ссылки `?spec=1` («Сценарий») тоже открывают карту. */
const readMode = (): SpecMode | null => (new URLSearchParams(window.location.search).has('spec') ? 'map' : null);

/** Адрес того же экрана голой сценой — для рамки телефона. */
const frameAddress = (): string => {
    const current = new URLSearchParams(window.location.search);

    current.set('viewport', 'frame');

    return `${window.location.pathname}?${current}`;
};

type SpecGateProps = {
    /** Заголовок борда — название прототипа из manifest.json. */
    title: string;
    /** Сам прототип. */
    children: ReactNode;
};

export const SpecGate = ({ children, title }: SpecGateProps) => {
    const [mode, setMode] = useState<SpecMode | null>(readMode);
    const phone = !mode && params.get('viewport') === 'mobile';

    useEffect(() => {
        const sync = () => setMode(readMode());

        window.addEventListener('popstate', sync);

        return () => window.removeEventListener('popstate', sync);
    }, []);

    useEffect(() => {
        /* Вариант Б: модель прототипа рецепт не запускала — запускаем клики сами. */
        if (!mode && !phone && hasSpecSeed() && !seedStarted()) {
            applySpecSeed(null as never, state => state);
        }
    }, [mode, phone]);

    if (mode) {
        const change = (next: SpecMode | 'prototype') => {
            const current = new URLSearchParams(window.location.search);

            if (next === 'prototype') {
                current.delete('spec');
            } else {
                current.set('spec', 'map');
            }

            window.history.replaceState(null, '', `${window.location.pathname}?${current}`);
            setMode(next === 'prototype' ? null : next);
        };

        return (
            <div className={styles.gate}>
                <div className={styles.bar}>
                    <Text as="span" typography="bodyS" weight="medium">
                        Вид
                    </Text>
                    <RadioButton
                        aria-label="Вид: прототип или спека"
                        name="spec-gate-view"
                        options={VIEW_OPTIONS}
                        size="s"
                        value={mode}
                        onChange={event => change(event.target.value as SpecMode | 'prototype')}
                    />
                </div>
                <SpecView title={title} />
            </div>
        );
    }

    if (phone) {
        return (
            <div className={styles.phoneStage}>
                <iframe className={styles.phone} src={frameAddress()} title={title} />
            </div>
        );
    }

    return <div className={styles.passthrough}>{children}</div>;
};
