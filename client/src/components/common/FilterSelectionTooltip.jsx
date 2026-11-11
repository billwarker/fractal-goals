import React from 'react';

import { FilterIcon } from '../atoms/AppIcons';
import IconButton from '../atoms/IconButton';
import Tooltip from '../atoms/Tooltip';

/**
 * A filter mark beside a filter's heading, shown while the filter is applied, whose tooltip holds the full
 * selection, however long, so the sidebar never grows with it. Portalled beyond scrolling panes.
 */
export default function FilterSelectionTooltip({ title, details }) {
    return (
        <Tooltip label={details} portal>
            <IconButton size="sm" variant="plain" aria-label={`View ${title.toLowerCase()} filter selections`}
                onClick={(event) => event.currentTarget.focus()}>
                <FilterIcon size={14} />
            </IconButton>
        </Tooltip>
    );
}
