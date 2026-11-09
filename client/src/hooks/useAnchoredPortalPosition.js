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
    // Size to the content, up to maxWidth, instead of always taking maxWidth.
    fitContent = false,
}) {
    useLayoutEffect(() => {
        if (!open) return undefined;

        const positionOverlay = () => {
            const anchorRoot = anchorRef.current;
            const anchor = anchorSelector ? anchorRoot?.querySelector(anchorSelector) : anchorRoot;
            const overlay = overlayRef.current;
            if (!anchor || !overlay) return;

            const rect = anchor.getBoundingClientRect();
            const visualViewport = window.visualViewport;
            const viewportLeft = visualViewport?.offsetLeft || 0;
            const viewportTop = visualViewport?.offsetTop || 0;
            const viewportWidth = visualViewport?.width
                || document.documentElement.clientWidth
                || window.innerWidth;
            const viewportHeight = visualViewport?.height
                || document.documentElement.clientHeight
                || window.innerHeight;
            const viewportRight = viewportLeft + viewportWidth;
            const viewportBottom = viewportTop + viewportHeight;
            if (fitContent) {
                overlay.style.setProperty('width', 'max-content');
                overlay.style.setProperty('min-width', '0');
            }
            const widestAllowed = fitContent ? Math.min(maxWidth, overlay.getBoundingClientRect().width) : maxWidth;
            const width = Math.min(widestAllowed, Math.max(0, viewportWidth - (margin * 2)));
            const preferredLeft = align === 'left'
                ? rect.left
                : align === 'center' ? rect.left + ((rect.width - width) / 2) : rect.right - width;
            const left = Math.max(
                viewportLeft + margin,
                Math.min(preferredLeft, viewportRight - width - margin),
            );
            const availableHeight = Math.max(0, viewportHeight - (margin * 2));
            const measuredHeight = Math.min(
                overlay.offsetHeight || estimatedHeight,
                availableHeight,
            );
            const spaceBelow = viewportBottom - rect.bottom - gap - margin;
            const preferredTop = spaceBelow >= measuredHeight
                ? rect.bottom + gap
                : rect.top - gap - measuredHeight;
            const top = Math.max(
                viewportTop + margin,
                Math.min(preferredTop, viewportBottom - measuredHeight - margin),
            );

            overlay.style.setProperty('position', 'fixed');
            overlay.style.setProperty('left', `${left}px`);
            overlay.style.setProperty('top', `${top}px`);
            overlay.style.setProperty('width', `${width}px`);
            overlay.style.setProperty('min-width', `${width}px`);
            overlay.style.setProperty('max-height', `${availableHeight}px`);
            overlay.style.setProperty('overflow-y', 'auto');
        };

        positionOverlay();
        window.addEventListener('resize', positionOverlay);
        window.addEventListener('scroll', positionOverlay, true);
        window.visualViewport?.addEventListener('resize', positionOverlay);
        window.visualViewport?.addEventListener('scroll', positionOverlay);
        return () => {
            window.removeEventListener('resize', positionOverlay);
            window.removeEventListener('scroll', positionOverlay, true);
            window.visualViewport?.removeEventListener('resize', positionOverlay);
            window.visualViewport?.removeEventListener('scroll', positionOverlay);
        };
    }, [align, anchorRef, anchorSelector, estimatedHeight, fitContent, gap, margin, maxWidth, open, overlayRef]);
}
