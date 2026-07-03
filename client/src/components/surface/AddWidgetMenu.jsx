import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { listWidgetDefinitions } from './widgetRegistry';

/**
 * Dropdown anchored at a grid cell (in configure mode) for adding a widget at
 * that position. Closes on outside click or Escape.
 */
export default function AddWidgetMenu({ position, onSelect, onClose, onPreviewChange }) {
    const ref = useRef(null);

    useEffect(() => {
        const handlePointer = (event) => {
            if (ref.current && !ref.current.contains(event.target)) {
                onPreviewChange?.(null);
                onClose?.();
            }
        };
        const handleKey = (event) => {
            if (event.key === 'Escape') {
                onPreviewChange?.(null);
                onClose?.();
            }
        };
        document.addEventListener('mousedown', handlePointer);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handlePointer);
            document.removeEventListener('keydown', handleKey);
        };
    }, [onClose, onPreviewChange]);

    const left = Math.min(position?.x || 0, window.innerWidth - 240);
    const top = Math.min(position?.y || 0, window.innerHeight - 280);

    const menu = (
        <div
            ref={ref}
            className="surface-add-widget-menu"
            role="menu"
            style={{ position: 'fixed', left, top, zIndex: 10000 }}
        >
            <div className="surface-add-widget-menu-title">Add widget</div>
            {listWidgetDefinitions().map((def) => (
                <button
                    key={def.type}
                    type="button"
                    role="menuitem"
                    className="surface-add-widget-menu-item"
                    onMouseEnter={() => onPreviewChange?.(def.type)}
                    onFocus={() => onPreviewChange?.(def.type)}
                    onMouseLeave={() => onPreviewChange?.(null)}
                    onBlur={() => onPreviewChange?.(null)}
                    onClick={() => onSelect?.(def.type)}
                >
                    <span className="surface-add-widget-menu-item-name">{def.name}</span>
                    <span className="surface-add-widget-menu-item-desc">{def.description}</span>
                </button>
            ))}
        </div>
    );

    return createPortal(menu, document.body);
}
