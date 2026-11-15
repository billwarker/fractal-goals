import React from 'react';

import styles from './PlanItem.module.css';

/**
 * One activity or circuit in a plan-shaped list: its name (with any `badges`), its `actions`
 * (move, tags, remove) on the right, and the item's editor as children. Program day plans,
 * logged sessions on the Days view and Create Session's quick session share it.
 *
 * `selectable` items scope on click like session page cards; `selected` marks the scoped one.
 * Other props (click and focus handlers, data attributes) go to the row element.
 */
export default function PlanItemRow({
    name,
    badges = null,
    actions = null,
    selectable = true,
    selected = false,
    alignKey,
    children,
    ...rowProps
}) {
    return (
        <div
            className={[
                styles.planItem,
                selectable ? styles.planItemSelectable : '',
                selected ? styles.planItemSelected : '',
            ].filter(Boolean).join(' ')}
            data-align-key={alignKey}
            data-plan-item
            data-selected={selected ? 'true' : undefined}
            {...rowProps}
        >
            <div className={styles.planItemHeader}>
                <span className={styles.planItemName}>
                    {name}
                    {badges}
                </span>
                {actions ? <span className={styles.planItemActions}>{actions}</span> : null}
            </div>
            {children}
        </div>
    );
}
