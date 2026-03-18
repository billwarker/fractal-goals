import React from 'react';

import { getReadableTextColor, getTemplateColor } from '../../utils/sessionRuntime';
import styles from './SessionTemplateNameBadge.module.css';

function SessionTemplateNameBadge({
    entity = null,
    name,
    color,
    size = 'md',
    className = '',
}) {
    const resolvedColor = color || getTemplateColor(entity);
    const resolvedName = name || entity?.name || 'Template';
    const textColor = getReadableTextColor(resolvedColor);
    const sizeClass = styles[`size${size.charAt(0).toUpperCase()}${size.slice(1)}`] || styles.sizeMd;

    return (
        <span
            className={`${styles.badge} ${sizeClass} ${className}`.trim()}
            style={{ backgroundColor: resolvedColor, color: textColor }}
        >
            {resolvedName}
        </span>
    );
}

export default SessionTemplateNameBadge;
