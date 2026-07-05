import React from 'react';

import styles from './DropdownMenu.module.css';

function DropdownMenu({
    children,
    className = '',
    align = 'right',
    'aria-label': ariaLabel,
    ...props
}) {
    const alignClass = align === 'left' ? styles.alignLeft : styles.alignRight;

    return (
        <div
            className={`${styles.menu} ${alignClass} ${className}`.trim()}
            role="menu"
            aria-label={ariaLabel}
            {...props}
        >
            {children}
        </div>
    );
}

export function DropdownMenuItem({
    children,
    className = '',
    danger = false,
    disabled = false,
    type = 'button',
    ...props
}) {
    return (
        <button
            type={type}
            role="menuitem"
            className={`${styles.item} ${danger ? styles.danger : ''} ${className}`.trim()}
            disabled={disabled}
            {...props}
        >
            {children}
        </button>
    );
}

export default DropdownMenu;
