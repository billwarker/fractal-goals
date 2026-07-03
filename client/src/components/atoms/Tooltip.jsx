import React, { useId } from 'react';

import styles from './Tooltip.module.css';

/**
 * Tooltip - CSS hover/focus tooltip wrapper for icon controls and compact
 * affordances that need keyboard-visible help text.
 */
function Tooltip({ children, label, className = '' }) {
    const id = useId();

    if (!label) return children;

    return (
        <span className={`${styles.tooltipWrap} ${className}`.trim()}>
            {React.isValidElement(children)
                ? React.cloneElement(children, {
                    'aria-describedby': [children.props['aria-describedby'], id].filter(Boolean).join(' ') || undefined,
                })
                : children}
            <span id={id} className={styles.tooltip} role="tooltip">
                {label}
            </span>
        </span>
    );
}

export default Tooltip;
