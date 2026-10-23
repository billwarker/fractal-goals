import React from 'react';

import Badge from '../atoms/Badge';
import styles from './ActivityTagBadges.module.css';

/**
 * Read-only presentation for direct activity-instance or set tags.
 * Callers deliberately pass direct tags only; inherited parent tags are
 * represented once at the activity-instance level. ``hideTags`` drops tags
 * already shown there (a set inherits its activity's tags, so they never repeat).
 */
export default function ActivityTagBadges({ tags = [], hideTags = [], className = '', ariaLabel = 'Tags' }) {
    const hidden = new Set((hideTags || []).map((tag) => tag.id));
    const shown = Array.isArray(tags) ? tags.filter((tag) => !hidden.has(tag.id)) : [];
    if (shown.length === 0) return null;

    return (
        <span className={`${styles.list} ${className}`.trim()} aria-label={ariaLabel}>
            {shown.map((tag) => (
                <Badge
                    key={tag.id}
                    size="sm"
                    className={`${styles.tag} ${tag.archived ? styles.archived : ''}`}
                    style={tag.color ? { '--activity-tag-color': tag.color } : undefined}
                    title={tag.archived ? `${tag.name} (archived)` : tag.name}
                >
                    {tag.name}
                </Badge>
            ))}
        </span>
    );
}
