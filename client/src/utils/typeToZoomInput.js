export function shouldIgnoreTypeToZoomKey(event) {
    const target = event.target;
    const activeElement = document.activeElement;
    const element = target instanceof Element ? target : activeElement;

    if (!element) return false;
    if (element.closest('[role="dialog"], [aria-modal="true"]')) return true;
    if (element.isContentEditable) return true;

    const tagName = element.tagName?.toLowerCase();
    return ['input', 'textarea', 'select'].includes(tagName);
}

export function isSearchCharacter(key) {
    return typeof key === 'string' && key.length === 1 && /^[a-z0-9]$/i.test(key);
}

export function getQueryCharacter(event) {
    if (event.key === ' ' || event.key === 'Space' || event.key === 'Spacebar' || event.code === 'Space') {
        return ' ';
    }
    return typeof event.key === 'string' && event.key.length === 1 ? event.key : null;
}

export function renderTypeToZoomQuery(query) {
    return String(query).replace(/ /g, '\u00a0');
}
