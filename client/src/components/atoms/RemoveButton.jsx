import React from 'react';

import CloseIcon from './CloseIcon';
import IconButton from './IconButton';

/**
 * RemoveButton - destructive remove/cancel-chip affordance. Use CloseButton
 * for dismissing dialogs; use this for removing an item from a collection.
 */
function RemoveButton({
    className = '',
    iconSize = 14,
    size = 'sm',
    'aria-label': ariaLabel,
    ...props
}) {
    return (
        <IconButton
            className={className}
            size={size}
            variant="danger"
            aria-label={ariaLabel || 'Remove'}
            {...props}
        >
            <CloseIcon size={iconSize} />
        </IconButton>
    );
}

export default RemoveButton;
