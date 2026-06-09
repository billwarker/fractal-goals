import { useCallback, useRef } from 'react';

const TEXT_INPUT_TYPES = new Set([
    '',
    'date',
    'datetime-local',
    'email',
    'month',
    'number',
    'password',
    'search',
    'tel',
    'text',
    'time',
    'url',
    'week',
]);

export function isTextEditingElement(element) {
    if (!element) return false;
    if (element.isContentEditable) return true;

    const tagName = element.tagName?.toLowerCase();
    if (tagName === 'textarea') return !element.disabled && !element.readOnly;
    if (tagName !== 'input') return false;

    const type = element.getAttribute('type')?.toLowerCase() || '';
    return TEXT_INPUT_TYPES.has(type) && !element.disabled && !element.readOnly;
}

export function isTextEditingActive(ownerDocument = typeof document !== 'undefined' ? document : null) {
    return isTextEditingElement(ownerDocument?.activeElement);
}

export function useModalBackdropDismiss(onClose, { guardTextEditing = true } = {}) {
    const shouldBlockNextBackdropClickRef = useRef(false);

    const handleBackdropMouseDown = useCallback((event) => {
        if (event.target !== event.currentTarget) return;

        shouldBlockNextBackdropClickRef.current = guardTextEditing
            && isTextEditingActive(event.currentTarget.ownerDocument);
    }, [guardTextEditing]);

    const handleBackdropClick = useCallback((event) => {
        if (event.target !== event.currentTarget) return;

        if (
            shouldBlockNextBackdropClickRef.current
            || (guardTextEditing && isTextEditingActive(event.currentTarget.ownerDocument))
        ) {
            shouldBlockNextBackdropClickRef.current = false;
            event.preventDefault();
            return;
        }

        onClose?.(event);
    }, [guardTextEditing, onClose]);

    return {
        onMouseDown: handleBackdropMouseDown,
        onClick: handleBackdropClick,
    };
}
