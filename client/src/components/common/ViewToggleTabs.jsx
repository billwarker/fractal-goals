import React, { useRef } from 'react';
import styles from './ViewToggleTabs.module.css';

const SIZE_CLASSES = { header: styles.header, compact: styles.compact };
const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp']);

function ViewToggleTabs({
    items,
    value,
    onChange,
    ariaLabel,
    className = '',
    size = 'fill',
    semantics = 'tabs',
    // Tabs semantics: ids `${idPrefix}-tab-${value}`, controlling `${idPrefix}-panel-${value}`.
    idPrefix,
    style,
}) {
    // 'radio' is for a setting chosen from a few values, where no panel switches with it.
    const radio = semantics === 'radio';
    const buttons = useRef([]);
    // The one tab stop: the selected tab, or the first when none is.
    const tabStop = Math.max(0, items.findIndex((item) => item.value === value));

    // The tabs pattern: one tab stop, arrows move and select, Home/End jump to the ends.
    const handleKeyDown = (event, index) => {
        if (radio) return;
        let next = null;
        if (NEXT_KEYS.has(event.key)) next = (index + 1) % items.length;
        else if (PREVIOUS_KEYS.has(event.key)) next = (index - 1 + items.length) % items.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        if (next === null) return;
        event.preventDefault();
        buttons.current[next]?.focus();
        onChange(items[next].value);
    };

    return (
        <div
            className={`${styles.tabs} ${SIZE_CLASSES[size] || ''} ${className}`.replace(/\s+/g, ' ').trim()}
            style={style}
            role={radio ? 'radiogroup' : 'tablist'}
            aria-label={ariaLabel}
        >
            {items.map((item, index) => {
                const selected = item.value === value;
                const ids = !radio && idPrefix
                    ? { id: `${idPrefix}-tab-${item.value}`, 'aria-controls': `${idPrefix}-panel-${item.value}` }
                    : {};
                return (
                    <button
                        key={item.value}
                        ref={(element) => { buttons.current[index] = element; }}
                        type="button"
                        role={radio ? 'radio' : 'tab'}
                        {...(radio ? { 'aria-checked': selected } : { 'aria-selected': selected, tabIndex: index === tabStop ? 0 : -1 })}
                        {...ids}
                        className={`${styles.tab} ${selected ? styles.tabActive : ''}`}
                        onClick={() => onChange(item.value)}
                        onKeyDown={(event) => handleKeyDown(event, index)}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}

export default ViewToggleTabs;
