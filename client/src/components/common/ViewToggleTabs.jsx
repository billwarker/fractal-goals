import React from 'react';
import styles from './ViewToggleTabs.module.css';

function ViewToggleTabs({
    items,
    value,
    onChange,
    ariaLabel,
    className = '',
    style,
}) {
    return (
        <div
            className={`${styles.tabs} ${className}`.trim()}
            style={style}
            role="tablist"
            aria-label={ariaLabel}
        >
            {items.map((item) => {
                const selected = item.value === value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        role="tab"
                        aria-selected={selected}
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
