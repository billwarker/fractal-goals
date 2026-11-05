import React, { useMemo, useState } from 'react';

import styles from './ChartLegendPanel.module.css';

/**
 * The legend for many-series charts: grouped entries with each series' total and share in range.
 * Hover highlights a series, click hides or shows it, Alt/⌥-click shows only that series, and
 * "Other" lists what it folds in. In compact charts it collapses to an "n series" toggle.
 *
 * @param {{
 *   series: Array<{ key: string, label: string, group?: string, total: number, folded?: Array<{ key: string, label: string }> }>,
 *   colorOf: (series: any) => string,
 *   formatValue: (value: number) => string,
 *   hiddenKeys: Set<string>,
 *   onHiddenKeysChange: (keys: Set<string>) => void,
 *   onHoverKeyChange: (key: string | null) => void,
 *   compact?: boolean,
 *   title?: string,
 * }} props
 */
export default function ChartLegendPanel({
    series, colorOf, formatValue, hiddenKeys, onHiddenKeysChange, onHoverKeyChange, compact = false, title = 'Series',
}) {
    const [open, setOpen] = useState(false);
    const [expandedOther, setExpandedOther] = useState(false);
    const total = series.reduce((sum, item) => sum + item.total, 0);
    const groups = useMemo(() => {
        const byGroup = new Map();
        series.forEach((item) => {
            const group = item.group || '';
            if (!byGroup.has(group)) byGroup.set(group, []);
            byGroup.get(group).push(item);
        });
        return [...byGroup.entries()];
    }, [series]);
    const showGroupHeadings = groups.length > 1;

    const toggle = (event, key) => {
        if (event.altKey) {
            const isolated = hiddenKeys.size === series.length - 1 && !hiddenKeys.has(key);
            onHiddenKeysChange(isolated ? new Set() : new Set(series.map((item) => item.key).filter((other) => other !== key)));
            return;
        }
        const next = new Set(hiddenKeys);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        onHiddenKeysChange(next);
    };

    if (series.length === 0) return null;
    const list = (
        <ul className={styles.list} aria-label={title} onMouseLeave={() => onHoverKeyChange(null)}>
            {groups.map(([group, items]) => (
                <li key={group || 'all'} className={styles.group}>
                    {showGroupHeadings && group ? <span className={styles.groupHeading}>{group}</span> : null}
                    <ul className={styles.entries}>
                        {items.map((item) => {
                            const hidden = hiddenKeys.has(item.key);
                            return (
                                <li key={item.key}>
                                    <button
                                        type="button"
                                        className={`${styles.entry} ${hidden ? styles.entryHidden : ''}`}
                                        aria-pressed={!hidden}
                                        title="Click to hide or show · Alt-click to show only this"
                                        onClick={(event) => toggle(event, item.key)}
                                        onMouseEnter={() => onHoverKeyChange(hidden ? null : item.key)}
                                        onFocus={() => onHoverKeyChange(hidden ? null : item.key)}
                                        onBlur={() => onHoverKeyChange(null)}
                                    >
                                        <span className={styles.swatch} style={{ background: colorOf(item) }} aria-hidden="true" />
                                        <span className={styles.name}>{item.label}</span>
                                        <span className={styles.value}>{formatValue(item.total)}</span>
                                        <span className={styles.share}>{total > 0 ? `${Math.round((item.total / total) * 100)}%` : ''}</span>
                                    </button>
                                    {item.folded?.length ? (
                                        <>
                                            <button type="button" className={styles.otherToggle} onClick={() => setExpandedOther((value) => !value)}>
                                                {expandedOther ? 'Hide what’s in Other' : 'What’s in Other?'}
                                            </button>
                                            {expandedOther ? (
                                                <ul className={styles.folded}>
                                                    {item.folded.map((entry) => <li key={entry.key}>{entry.label}</li>)}
                                                </ul>
                                            ) : null}
                                        </>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                </li>
            ))}
        </ul>
    );

    if (!compact) return <div className={styles.panel}>{list}</div>;
    return (
        <div className={styles.compact}>
            <button type="button" className={styles.compactToggle} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
                {series.length} series
            </button>
            {open ? <div className={styles.compactPopover}>{list}</div> : null}
        </div>
    );
}
