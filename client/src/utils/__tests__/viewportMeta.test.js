import { describe, expect, it } from 'vitest';

import { getViewportMetaContent, isFlowTreeRoute, shouldAllowZoom } from '../viewportMeta';

describe('getViewportMetaContent', () => {
    it('disables pinch zoom for non-desktop non-flowtree routes', () => {
        expect(getViewportMetaContent({ isMobile: true, allowZoom: false })).toContain('user-scalable=no');
        expect(getViewportMetaContent({ isMobile: true, allowZoom: false })).toContain('maximum-scale=1.0');
    });

    it('disables browser zoom for the mobile flowtree route so the app shell remains anchored', () => {
        expect(getViewportMetaContent({
            isMobile: true,
            allowZoom: shouldAllowZoom({ isMobile: true, pathname: '/root-1/goals' }),
        })).toContain('user-scalable=no');
    });

    it('keeps the desktop viewport unrestricted', () => {
        expect(getViewportMetaContent({ isMobile: false, allowZoom: false })).toBe(
            'width=device-width, initial-scale=1.0, viewport-fit=cover'
        );
    });

    it('still detects the goals route for route-specific viewport decisions', () => {
        expect(isFlowTreeRoute('/root-1/goals')).toBe(true);
        expect(isFlowTreeRoute('/root-1/sessions')).toBe(false);
    });

    it('allows browser zoom only on desktop', () => {
        expect(shouldAllowZoom({ isMobile: true, pathname: '/root-1/goals' })).toBe(false);
        expect(shouldAllowZoom({ isMobile: true, pathname: '/root-1/sessions' })).toBe(false);
        expect(shouldAllowZoom({ isMobile: false, pathname: '/root-1/sessions' })).toBe(true);
    });
});
