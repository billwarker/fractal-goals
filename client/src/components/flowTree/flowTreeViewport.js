// Where the goal tree's view starts: the hierarchy layout's viewport, and on phones the shift
// that centres what is actually drawn.

export function getHierarchyViewport(bounds, viewportWidth, viewportHeight, isMobile, sidebarOpen = false) {
    if (!bounds || !viewportWidth || !viewportHeight) return null;

    const leftInset = sidebarOpen && !isMobile
        ? Math.min(420, viewportWidth * 0.32)
        : 0;
    const paddingX = isMobile ? 56 : 120;
    const paddingY = isMobile ? 120 : 96;
    const safeWidth = Math.max(viewportWidth - leftInset, 1);
    const safeHeight = Math.max(viewportHeight, 1);
    const zoomX = (safeWidth - paddingX) / Math.max(bounds.width, 1);
    const zoomY = (safeHeight - paddingY) / Math.max(bounds.height, 1);
    const zoom = Math.min(isMobile ? 1 : 1.08, Math.max(isMobile ? 0.22 : 0.28, Math.min(zoomX, zoomY)));
    const centerX = leftInset + (safeWidth / 2);
    const centerY = safeHeight / 2;

    return {
        x: centerX - ((bounds.x + (bounds.width / 2)) * zoom),
        y: centerY - ((bounds.y + (bounds.height / 2)) * zoom),
        zoom,
    };
}

/** The box (viewport px) of what the tree draws: icons, connector lines and the text itself. */
export function getDrawnBounds(container) {
    if (!container) return null;
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    const include = (rect) => {
        if (!rect?.width || !rect?.height) return;
        left = Math.min(left, rect.left);
        right = Math.max(right, rect.right);
        top = Math.min(top, rect.top);
        bottom = Math.max(bottom, rect.bottom);
    };
    // Node boxes are a fixed width wider than their labels, so measure what is drawn in them.
    container.querySelectorAll('.react-flow__node svg, .react-flow__edge path').forEach((part) => include(part.getBoundingClientRect()));
    container.querySelectorAll('.react-flow__node').forEach((node) => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        for (let text = walker.nextNode(); text; text = walker.nextNode()) {
            if (!text.textContent.trim() || text.parentElement?.closest('style')) continue;
            const range = document.createRange();
            range.selectNodeContents(text);
            include(range.getBoundingClientRect?.());
        }
    });
    return Number.isFinite(left) ? { left, right, top, bottom } : null;
}

/** How far the options pane (and the program label inside it) covers the top of the tree, in px. */
export function getTopOverlayInset(container) {
    const pane = container?.closest('.fractal-view-wrapper')?.querySelector('.flowtree-options-pane');
    if (!pane) return 0;
    const box = container.getBoundingClientRect();
    let bottom = pane.getBoundingClientRect().bottom;
    pane.querySelectorAll('*').forEach((part) => {
        const rect = part.getBoundingClientRect();
        if (rect.height) bottom = Math.max(bottom, rect.bottom);
    });
    return Math.max(0, bottom - box.top);
}

/**
 * The viewport that fits the drawn tree into the container's clear area (inside `insets`),
 * centred, at most `maxZoom`. Everything is measured at the current `viewport`, and the drawn
 * size scales linearly with zoom.
 */
export function fitViewportToDrawn({ drawn, box, viewport, insets, minZoom = 0.22, maxZoom = 1 }) {
    if (!drawn || !box || !viewport?.zoom) return null;
    const { zoom } = viewport;
    const flowWidth = (drawn.right - drawn.left) / zoom;
    const flowHeight = (drawn.bottom - drawn.top) / zoom;
    const flowLeft = (drawn.left - box.left - viewport.x) / zoom;
    const flowTop = (drawn.top - box.top - viewport.y) / zoom;
    const areaWidth = Math.max(box.width - insets.left - insets.right, 1);
    const areaHeight = Math.max(box.height - insets.top - insets.bottom, 1);
    const nextZoom = Math.min(maxZoom, Math.max(minZoom, Math.min(areaWidth / flowWidth, areaHeight / flowHeight)));
    return {
        x: insets.left + (areaWidth - flowWidth * nextZoom) / 2 - flowLeft * nextZoom,
        y: insets.top + Math.max(0, (areaHeight - flowHeight * nextZoom) / 2) - flowTop * nextZoom,
        zoom: nextZoom,
    };
}
