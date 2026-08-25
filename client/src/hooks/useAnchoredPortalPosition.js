import { useLayoutEffect } from 'react';

/**
 * Positions a portalled overlay against an anchor without allowing it to
 * escape the visual viewport. The overlay is updated during captured scrolls
 * so anchors inside horizontal toolbars and nested scrollers remain aligned.
 */
export default function useAnchoredPortalPosition({
    open,
    anchorRef,
    anchorSelector = null,
    overlayRef,
    align = 'right',
    gap = 6,
    margin = 8,
    maxWidth = 280,
    estimatedHeight = 190,
}) {
    useLayoutEffect(() => {
        if (!open) return undefined;

        const positionOverlay = () => {
            const anchorRoot = anchorRef.current;
            const anchor = anchorSelector ? anchorRoot?.querySelector(anchorSelector) : anchorRoot;
            const overlay = overlayRef.current;
            if (!anchor || !overlay) return;

            const rect = anchor.getBoundingClientRect();
            const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
            const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
            const width = Math.min(maxWidth, Math.max(0, viewportWidth - (margin * 2)));
            const preferredLeft = align === 'left' ? rect.left : rect.right - width;
            const left = Math.max(margin, Math.min(preferredLeft, viewportWidth - width - margin));
            const measuredHeight = overlay.offsetHeight || estimatedHeight;
            const spaceBelow = viewportHeight - rect.bottom - gap - margin;
            const top = spaceBelow >= measuredHeight
                ? rect.bottom + gap
                : Math.max(margin, rect.top - gap - measuredHeight);

            overlay.style.setProperty('position', 'fixed');
            overlay.style.setProperty('left', `${left}px`);
            overlay.style.setProperty('top', `${top}px`);
            overlay.style.setProperty('width', `${width}px`);
        };

        positionOverlay();
        window.addEventListener('resize', positionOverlay);
        window.addEventListener('scroll', positionOverlay, true);
        return () => {
            window.removeEventListener('resize', positionOverlay);
            window.removeEventListener('scroll', positionOverlay, true);
        };
    }, [align, anchorRef, anchorSelector, estimatedHeight, gap, margin, maxWidth, open, overlayRef]);
}
