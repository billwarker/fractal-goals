export function isFlowTreeRoute(pathname = '') {
    return /^\/[^/]+\/goals(?:\/)?$/.test(pathname);
}

export function shouldAllowZoom({ isMobile, pathname = '' }) {
    return !isMobile || isFlowTreeRoute(pathname);
}

export function getViewportMetaContent({ isMobile, allowZoom }) {
    if (!isMobile) {
        return 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    }

    if (allowZoom) {
        return 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    }

    return 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
}
