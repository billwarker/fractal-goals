import React from 'react';

import { ChevronDownIcon, ChevronUpIcon } from '../atoms/AppIcons';
import IconButton from '../atoms/IconButton';
import RemoveButton from '../atoms/RemoveButton';

export default function LandingExampleOrderControls({
    example,
    index,
    total,
    name,
    onMove,
    onRemove,
    styles,
}) {
    const label = example.label || name;
    return (
        <div className={styles.landingExampleHeader}>
            <span className={styles.landingExampleIndex} aria-label={`Position ${index + 1}`}>
                {index + 1}
            </span>
            <div className={styles.landingExampleIdentity}>
                <strong>{name}</strong>
                <span>{example.root_id}</span>
            </div>
            <div className={styles.landingExampleActions}>
                <IconButton size="sm" variant="subtle" disabled={index === 0}
                    aria-label={`Move ${label} up`} onClick={() => onMove(example.root_id, -1)}>
                    <ChevronUpIcon size={15} />
                </IconButton>
                <IconButton size="sm" variant="subtle" disabled={index === total - 1}
                    aria-label={`Move ${label} down`} onClick={() => onMove(example.root_id, 1)}>
                    <ChevronDownIcon size={15} />
                </IconButton>
                <RemoveButton className={styles.landingExampleRemoveButton}
                    aria-label={`Remove ${label}`} onClick={() => onRemove(example.root_id)} />
            </div>
        </div>
    );
}
