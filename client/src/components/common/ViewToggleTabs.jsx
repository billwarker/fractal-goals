import React from 'react';
import styles from './ViewToggleTabs.module.css';

const SIZE_CLASSES = { header: styles.header, compact: styles.compact };

function ViewToggleTabs({
    items,
    value,
    onChange,
    ariaLabel,
    className = '',
    size = 'fill',
    semantics = 'tabs',
    style,
}) {
    // 'radio' is for a setting chosen from a few values, where no panel switches with it.
    const radio = semantics === 'radio';
    return (
        <div
            className={`${styles.tabs} ${SIZE_CLASSES[size] || ''} ${className}`.replace(/\s+/g, ' ').trim()}
            style={style}
            role={radio ? 'radiogroup' : 'tablist'}
            aria-label={ariaLabel}
        >
            {items.map((item) => {
                const selected = item.value === value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        role={radio ? 'radio' : 'tab'}
                        {...(radio ? { 'aria-checked': selected } : { 'aria-selected': selected })}
                        className={`${styles.tab} ${selected ? styles.tabActive : ''}`}
                        onClick={() => onChange(item.value)}
                    >
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}

export default ViewToggleTabs;
