import React from 'react';

import { getSessionRuntimeType, SESSION_TYPE_QUICK } from '../../utils/sessionRuntime';
import styles from './SessionTemplateTypePill.module.css';

function SessionTemplateTypePill({
    entity = null,
    sessionType,
    size = 'md',
    className = '',
}) {
    const resolvedType = sessionType || getSessionRuntimeType(entity);
    const sizeClass = styles[`size${size.charAt(0).toUpperCase()}${size.slice(1)}`] || styles.sizeMd;

    return (
        <span className={`${styles.pill} ${sizeClass} ${className}`.trim()}>
            {resolvedType === SESSION_TYPE_QUICK ? 'Quick Session' : 'Normal Session'}
        </span>
    );
}

export default SessionTemplateTypePill;
