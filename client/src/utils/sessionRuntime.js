export const DEFAULT_TEMPLATE_COLOR = '#4A90E2';
export const SESSION_TYPE_NORMAL = 'normal';
export const SESSION_TYPE_QUICK = 'quick';

export function normalizeSessionType(value) {
    if (typeof value !== 'string') return SESSION_TYPE_NORMAL;
    const normalized = value.trim().toLowerCase();
    return normalized === SESSION_TYPE_QUICK ? SESSION_TYPE_QUICK : SESSION_TYPE_NORMAL;
}

export function getTemplateData(entity) {
    if (!entity || typeof entity !== 'object') return {};
    if (entity.template_data && typeof entity.template_data === 'object') return entity.template_data;
    if (entity.attributes?.session_data && typeof entity.attributes.session_data === 'object') {
        return entity.attributes.session_data;
    }
    if (entity.session_data && typeof entity.session_data === 'object') return entity.session_data;
    return {};
}

export function getSessionRuntimeType(entity) {
    const data = getTemplateData(entity);
    return normalizeSessionType(data.session_type || entity?.session_type);
}

export function isQuickSession(entity) {
    return getSessionRuntimeType(entity) === SESSION_TYPE_QUICK;
}

export function getTemplateColor(entity) {
    const data = getTemplateData(entity);
    const color = data.template_color || entity?.template_color;
    if (typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color.trim())) {
        return color.trim();
    }
    return DEFAULT_TEMPLATE_COLOR;
}

export function getReadableTextColor(backgroundColor) {
    if (typeof backgroundColor !== 'string' || !backgroundColor.startsWith('#') || backgroundColor.length !== 7) {
        return '#FFFFFF';
    }

    const r = parseInt(backgroundColor.slice(1, 3), 16);
    const g = parseInt(backgroundColor.slice(3, 5), 16);
    const b = parseInt(backgroundColor.slice(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? '#1A1A1A' : '#FFFFFF';
}
