import React from 'react';

import Button from '../atoms/Button';

function SessionCompletionButton({
    completed = false,
    onClick,
    className = '',
    title = 'Mark Session Complete',
    pendingLabel = 'Complete',
    doneLabel = '✓ Done',
    ...props
}) {
    return (
        <Button
            onClick={onClick}
            variant={completed ? 'success' : 'secondary'}
            title={title}
            className={className}
            {...props}
        >
            {completed ? doneLabel : pendingLabel}
        </Button>
    );
}

export default SessionCompletionButton;
