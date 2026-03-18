import React from 'react';

import styles from './ActivityCompletionButton.module.css';

function ActivityCompletionButton({
    completed = false,
    onClick,
    className = '',
    pendingLabel = 'Mark Complete',
    doneLabel = 'Completed',
    ...props
}) {
    const stateClass = completed ? styles.done : styles.pending;

    return (
        <button
            type="button"
            onClick={onClick}
            className={`${styles.button} ${stateClass} ${className}`.trim()}
            {...props}
        >
            {completed ? doneLabel : pendingLabel}
        </button>
    );
}

export default ActivityCompletionButton;
