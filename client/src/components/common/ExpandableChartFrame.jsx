import React from 'react';

import Button from '../atoms/Button';
import ExpandIcon from '../atoms/ExpandIcon';
import styles from './ExpandableChartFrame.module.css';

/** Controls inside the chart (e.g. Retry) keep their own clicks. */
const fromInnerControl = (event) => Boolean(event.target.closest?.('button, a, input, select, textarea'));

/**
 * A compact chart card that expands into a bigger view (goal details, the Session Detail
 * Progress pane). The whole card is the control: it highlights on hover and focus, Enter or
 * Space activates it, and a corner icon says what clicking does. The mini chart inside is a
 * preview with no tooltips of its own. While the chart is shown elsewhere, the card holds the
 * way back instead: `expandedNote` and Collapse, after any `expandedContent` (e.g. the chart's
 * controls, which then act on the expanded chart).
 *
 * Without `onExpand` it is a plain frame. `className` gives the card its box (border, padding).
 */
export default function ExpandableChartFrame({
    className = '',
    onExpand = null,
    label = 'Expand chart',
    title = 'Expand chart',
    icon = null,
    isExpanded = false,
    expandedNote = null,
    expandedContent = null,
    onCollapse = null,
    children,
    ...rest
}) {
    if (isExpanded) {
        return (
            <div className={`${styles.frame} ${styles.placeholder} ${className}`} {...rest}>
                {expandedContent}
                <p className={styles.note}>{expandedNote}</p>
                <Button variant="secondary" size="sm" onClick={onCollapse}>Collapse</Button>
            </div>
        );
    }
    if (!onExpand) return <div className={`${styles.frame} ${className}`} {...rest}>{children}</div>;
    return (
        <div
            className={`${styles.frame} ${styles.expandable} ${className}`}
            role="button"
            tabIndex={0}
            aria-label={label}
            title={title}
            onClick={(event) => { if (!fromInnerControl(event)) onExpand(); }}
            onKeyDown={(event) => {
                if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                onExpand();
            }}
            {...rest}
        >
            {children}
            <span className={styles.icon}>{icon || <ExpandIcon size={14} />}</span>
        </div>
    );
}
