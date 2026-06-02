import React from 'react';

import GoalIcon from '../atoms/GoalIcon';
import styles from './GoalNameBadge.module.css';

function GoalNameBadge({
    goal = null,
    label,
    type,
    color,
    secondaryColor,
    shape,
    isSmart = false,
    isCompleted = false,
    as: Component = 'span',
    onClick,
    className = '',
    iconSize = 14,
}) {
    const resolvedLabel = label || goal?.name || goal?.attributes?.name || 'Goal';
    const resolvedColor = color || 'var(--color-brand-primary)';
    const resolvedShape = shape || 'circle';
    const componentProps = {};
    if (Component === 'button') {
        componentProps.type = 'button';
    }
    if (onClick) {
        componentProps.onClick = onClick;
    }

    return (
        <Component
            {...componentProps}
            className={`${styles.badge} ${isCompleted ? styles.completed : ''} ${className}`.trim()}
            style={{ '--goal-badge-color': resolvedColor }}
            title={resolvedLabel}
        >
            <GoalIcon
                shape={resolvedShape}
                color={resolvedColor}
                secondaryColor={secondaryColor}
                isSmart={isSmart}
                size={iconSize}
            />
            <span className={styles.name}>{resolvedLabel}</span>
        </Component>
    );
}

export default GoalNameBadge;
