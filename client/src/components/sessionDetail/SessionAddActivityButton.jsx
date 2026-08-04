import React from 'react';

import AddItemButton from '../atoms/AddItemButton';
import GoalIcon from '../atoms/GoalIcon';
import styles from './SessionAddActivityButton.module.css';

export default function SessionAddActivityButton({ activityGoalScope, onClick }) {
    const scopedGoal = activityGoalScope?.goal || null;

    return (
        <AddItemButton
            className={scopedGoal ? styles.scopedButton : ''}
            onClick={onClick}
        >
            {scopedGoal ? (
                <span className={styles.scopedLabel}>
                    <span>+ Add Activity associated to</span>
                    <GoalIcon
                        shape={scopedGoal.scopePresentation?.icon || 'circle'}
                        color={scopedGoal.scopePresentation?.color || 'var(--color-brand-primary)'}
                        secondaryColor={scopedGoal.scopePresentation?.secondaryColor || 'var(--color-brand-secondary)'}
                        isSmart={scopedGoal.is_smart}
                        size={16}
                    />
                    <strong>{scopedGoal.name}</strong>
                </span>
            ) : '+ Add Activity'}
        </AddItemButton>
    );
}
