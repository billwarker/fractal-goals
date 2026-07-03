import React from 'react';

import ChevronIcon from './ChevronIcon';
import IconButton from './IconButton';

/**
 * DisclosureButton - shared expand/collapse affordance. Use for sections,
 * panels, tree rows, and compact controls that toggle hidden content.
 */
function DisclosureButton({
    expanded,
    className = '',
    iconSize = 16,
    size = 'sm',
    expandedDirection = 'up',
    collapsedDirection = 'down',
    'aria-label': ariaLabel,
    ...props
}) {
    const direction = expanded ? expandedDirection : collapsedDirection;

    return (
        <IconButton
            className={className}
            size={size}
            variant="plain"
            aria-expanded={expanded}
            aria-label={ariaLabel || (expanded ? 'Collapse' : 'Expand')}
            {...props}
        >
            <ChevronIcon size={iconSize} direction={direction} />
        </IconButton>
    );
}

export default DisclosureButton;
