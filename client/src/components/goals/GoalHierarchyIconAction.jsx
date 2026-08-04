import React from 'react';

import IconButton from '../atoms/IconButton';
import styles from './GoalHierarchyList.module.css';

export default function GoalHierarchyIconAction({
    children,
    goal,
    selected,
    onClick,
    getActionLabel,
}) {
    if (!onClick) return children;

    return (
        <IconButton
            size="sm"
            variant="plain"
            className={styles.sessionIconButton}
            aria-pressed={selected}
            aria-label={getActionLabel
                ? getActionLabel(goal, selected)
                : `${selected ? 'Deselect' : 'Select'} ${goal.name}`}
            onClick={(event) => {
                event.stopPropagation();
                onClick(goal);
            }}
        >
            {children}
        </IconButton>
    );
}
