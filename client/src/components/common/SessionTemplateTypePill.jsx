import React from 'react';

import Badge from '../atoms/Badge';
import { getSessionRuntimeType, SESSION_TYPE_QUICK } from '../../utils/sessionRuntime';

function SessionTemplateTypePill({
    entity = null,
    sessionType,
    size = 'md',
    className = '',
}) {
    const resolvedType = sessionType || getSessionRuntimeType(entity);
    return (
        <Badge size={size} variant="neutral" className={className}>
            {resolvedType === SESSION_TYPE_QUICK ? 'Quick Session' : 'Normal Session'}
        </Badge>
    );
}

export default SessionTemplateTypePill;
