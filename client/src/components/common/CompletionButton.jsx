import React from 'react';

import Button from '../atoms/Button';
import CompletionCheckBadge from './CompletionCheckBadge';

import buttonStyles from '../atoms/Button.module.css';
import styles from './CompletionButton.module.css';

function CompletionButton({
    completed = false,
    onClick,
    className = '',
    title,
    entityName = 'Item',
    pendingLabel = '✓ Complete',
    doneLabel = 'Completed',
    asStatus = false,
    size = 'md',
    fullWidth = false,
    ...props
}) {
    const resolvedTitle = title ?? `Mark ${entityName} ${completed ? 'Incomplete' : 'Complete'}`;
    const compactBadge = size === 'sm';

    if (asStatus) {
        return (
            <div
                role="status"
                title={resolvedTitle}
                className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles[size] || buttonStyles.md} ${fullWidth ? buttonStyles.fullWidth : ''} ${styles.control} ${styles.completed} ${styles.status} ${className}`.trim()}
                {...props}
            >
                <CompletionCheckBadge decorative compact={compactBadge} />
                {doneLabel}
            </div>
        );
    }

    return (
        <Button
            onClick={onClick}
            variant={completed ? 'secondary' : 'success'}
            size={size}
            fullWidth={fullWidth}
            title={resolvedTitle}
            aria-pressed={completed}
            className={`${styles.control} ${completed ? styles.completed : ''} ${className}`.trim()}
            leftIcon={completed ? <CompletionCheckBadge decorative compact={compactBadge} /> : null}
            {...props}
        >
            {completed ? doneLabel : pendingLabel}
        </Button>
    );
}

export default CompletionButton;
