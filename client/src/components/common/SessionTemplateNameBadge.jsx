import React from 'react';

import { getTemplateColor } from '../../utils/sessionRuntime';
import useReadableColor from '../../hooks/useReadableColor';
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
    const markColor = useReadableColor(resolvedColor, 'mark');
    const textColor = useReadableColor(resolvedColor, 'tintedText');
    const resolvedName = name || entity?.name || 'Template';
    const sizeClass = styles[`size${size.charAt(0).toUpperCase()}${size.slice(1)}`] || styles.sizeMd;
    const wrapClass = wrap ? styles.wrap : '';

    return (
        <span
            className={`${styles.badge} ${sizeClass} ${wrapClass} ${className}`.trim()}
            title={resolvedName}
            style={{
                borderColor: markColor,
                color: textColor,
                // Opaque, so a tinted calendar cell behind it can't lower the text's contrast.
                background: `color-mix(in srgb, ${markColor} 10%, var(--color-bg-card))`,
            }}
        >
            <span className={styles.label}>{resolvedName}</span>
        </span>
    );
}

export default SessionTemplateNameBadge;
