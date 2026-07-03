import React from 'react';

import CloseIcon from './CloseIcon';
import IconButton from './IconButton';

/**
 * CloseButton — shared modal/dialog close affordance. A muted X that highlights
 * red on hover. Use wherever a modal needs a dismiss control.
 */
function CloseButton({
    size = 18,
    buttonSize = 'md',
    className = '',
    type = 'button',
    'aria-label': ariaLabel = 'Close',
    ...props
}) {
    return (
        <IconButton
            type={type}
            className={className}
            size={buttonSize}
            variant="danger"
            aria-label={ariaLabel}
            {...props}
        >
            <CloseIcon size={size} />
        </IconButton>
    );
}

export default CloseButton;
