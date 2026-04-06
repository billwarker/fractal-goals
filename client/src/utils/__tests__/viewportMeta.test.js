import { describe, expect, it } from 'vitest';

import { getViewportMetaContent, isFlowTreeRoute, shouldAllowZoom } from '../viewportMeta';

describe('getViewportMetaContent', () => {
    it('disables pinch zoom for non-desktop non-flowtree routes', () => {
        expect(getViewportMetaContent({ isMobile: true, allowZoom: false })).toContain('user-scalable=no');
        expect(getViewportMetaContent({ isMobile: true, allowZoom: false })).toContain('maximum-scale=1.0');
    });

    it('keeps zoom enabled for the mobile flowtree route', () => {
        expect(getViewportMetaContent({ isMobile: true, allowZoom: true })).not.toContain('user-scalable=no');
    });

    it('keeps the desktop viewport unrestricted', () => {
        expect(getViewportMetaContent({ isMobile: false, allowZoom: false })).toBe(
            'width=device-width, initial-scale=1.0, viewport-fit=cover'
        );
    });

    it('detects the goals route as the only mobile zoom-enabled route', () => {
        expect(isFlowTreeRoute('/root-1/goals')).toBe(true);
        expect(isFlowTreeRoute('/root-1/sessions')).toBe(false);
    });

    it('allows zoom only for desktop or the mobile goals route', () => {
        expect(shouldAllowZoom({ isMobile: true, pathname: '/root-1/goals' })).toBe(true);
        expect(shouldAllowZoom({ isMobile: true, pathname: '/root-1/sessions' })).toBe(false);
        expect(shouldAllowZoom({ isMobile: false, pathname: '/root-1/sessions' })).toBe(true);
    });
});
