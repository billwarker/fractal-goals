import React from 'react';

import { getTemplateColor } from '../../utils/sessionRuntime';
import styles from './SessionTemplateNameBadge.module.css';

function SessionTemplateNameBadge({
    entity = null,
    name,
    color,
    size = 'md',
    wrap = false,
    className = '',
}) {
    const resolvedColor = color || getTemplateColor(entity);
    const resolvedName = name || entity?.name || 'Template';
    const sizeClass = styles[`size${size.charAt(0).toUpperCase()}${size.slice(1)}`] || styles.sizeMd;
    const wrapClass = wrap ? styles.wrap : '';

    return (
        <span
            className={`${styles.badge} ${sizeClass} ${wrapClass} ${className}`.trim()}
            title={resolvedName}
            style={{
                borderColor: resolvedColor,
                color: resolvedColor,
                background: `color-mix(in srgb, ${resolvedColor} 14%, transparent)`,
            }}
        >
            <span className={styles.label}>{resolvedName}</span>
        </span>
    );
}

export default SessionTemplateNameBadge;
