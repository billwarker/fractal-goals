import { useEffect, useRef } from 'react';

import useAnchoredPortalPosition from './useAnchoredPortalPosition';

/**
 * Owns the shared interaction contract for a menu portalled outside its anchor:
 * viewport positioning, initial focus, outside-pointer dismissal, and Escape.
 */
export default function useAnchoredMenuController({
    open,
    setOpen,
    maxWidth = 240,
    estimatedHeight = 190,
}) {
    const anchorRef = useRef(null);
    const menuRef = useRef(null);

    useAnchoredPortalPosition({
        open,
        anchorRef,
        anchorSelector: 'button',
        overlayRef: menuRef,
        maxWidth,
        estimatedHeight,
    });

    useEffect(() => {
        if (open) menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;

        const handlePointerDown = (event) => {
            if (anchorRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
            setOpen(false);
        };
        const handleKeyDown = (event) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            anchorRef.current?.querySelector('button')?.focus();
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, setOpen]);

    return { anchorRef, menuRef };
}
