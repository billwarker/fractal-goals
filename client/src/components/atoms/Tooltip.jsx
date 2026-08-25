import React, { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

import useAnchoredPortalPosition from '../../hooks/useAnchoredPortalPosition';
import styles from './Tooltip.module.css';

/**
 * Tooltip - CSS hover/focus tooltip wrapper for icon controls and compact
 * affordances that need keyboard-visible help text.
 */
function Tooltip({ children, label, className = '', portal = false }) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const anchorRef = useRef(null);
    const tooltipRef = useRef(null);

    useAnchoredPortalPosition({
        open: portal && open,
        anchorRef,
        overlayRef: tooltipRef,
        align: 'right',
        maxWidth: 300,
        estimatedHeight: 92,
    });

    if (!label) return children;

    const tooltip = <span ref={tooltipRef} id={id} className={`${styles.tooltip} ${portal ? styles.portalTooltip : ''}`.trim()} role="tooltip">{label}</span>;

    return (
        <span
            ref={anchorRef}
            className={`${styles.tooltipWrap} ${className}`.trim()}
            onMouseEnter={portal ? () => setOpen(true) : undefined}
            onMouseLeave={portal ? () => setOpen(false) : undefined}
            onFocus={portal ? () => setOpen(true) : undefined}
            onBlur={portal ? () => setOpen(false) : undefined}
        >
            {React.isValidElement(children)
                ? React.cloneElement(children, {
                    'aria-describedby': [children.props['aria-describedby'], id].filter(Boolean).join(' ') || undefined,
                })
                : children}
            {portal ? (open && createPortal(tooltip, document.body)) : tooltip}
        </span>
    );
}

Tooltip.propTypes = {
    children: PropTypes.node.isRequired,
    label: PropTypes.node,
    className: PropTypes.string,
    portal: PropTypes.bool,
};

export default Tooltip;
