import {
    createDashboardLayoutPayload,
    getDefaultWindowState,
    getHighestWindowIndex,
    sanitizeDashboardLayoutPayload,
} from '../dashboardState';

describe('dashboardState helpers', () => {
    it('normalizes dashboard payloads to the active window ids', () => {
        const payload = createDashboardLayoutPayload({
            layout: {
                type: 'split',
                direction: 'vertical',
                position: 50,
                first: { type: 'window', id: 'window-1' },
                second: { type: 'window', id: 'window-3' },
            },
            windowStates: {
                'window-1': { ...getDefaultWindowState(), selectedCategory: 'sessions' },
                'window-2': { ...getDefaultWindowState(), selectedCategory: 'goals' },
                'window-3': { ...getDefaultWindowState(), selectedCategory: 'activities' },
            },
            selectedWindowId: 'window-2',
        });

        expect(payload.selected_window_id).toBe('window-1');
        expect(Object.keys(payload.window_states)).toEqual(['window-1', 'window-3']);
        expect(payload.window_states['window-3'].selectedCategory).toBe('activities');
    });

    it('rejects incompatible payloads and calculates the highest window index', () => {
        expect(sanitizeDashboardLayoutPayload({ version: 999 })).toBeNull();

        const sanitized = sanitizeDashboardLayoutPayload({
            version: 1,
            layout: {
                type: 'split',
                direction: 'horizontal',
                position: 40,
                first: { type: 'window', id: 'window-2' },
                second: { type: 'window', id: 'window-5' },
            },
            window_states: {
                'window-2': { selectedCategory: 'goals' },
                'window-5': { selectedCategory: 'sessions' },
            },
            selected_window_id: 'window-5',
        });

        expect(sanitized.windowStates['window-2'].selectedCategory).toBe('goals');
        expect(sanitized.selectedWindowId).toBe('window-5');
        expect(getHighestWindowIndex(sanitized.layout)).toBe(5);
    });

    it('preserves nested split positions when saving and restoring analytics views', () => {
        const payload = createDashboardLayoutPayload({
            layout: {
                type: 'split',
                direction: 'vertical',
                position: 62.5,
                first: {
                    type: 'split',
                    direction: 'horizontal',
                    position: '33.3',
                    first: { type: 'window', id: 'window-1' },
                    second: { type: 'window', id: 'window-2' },
                },
                second: { type: 'window', id: 'window-3' },
            },
            windowStates: {
                'window-1': { selectedCategory: 'goals' },
                'window-2': { selectedCategory: 'sessions' },
                'window-3': { selectedCategory: 'activities' },
            },
            selectedWindowId: 'window-2',
        });

        expect(payload.layout.position).toBe(62.5);
        expect(payload.layout.first.position).toBe(33.3);

        const sanitized = sanitizeDashboardLayoutPayload(payload);

        expect(sanitized.layout.position).toBe(62.5);
        expect(sanitized.layout.first.position).toBe(33.3);
        expect(sanitized.selectedWindowId).toBe('window-2');
    });

    it('clamps out-of-range split positions to safe panel sizes', () => {
        const sanitized = sanitizeDashboardLayoutPayload({
            version: 1,
            layout: {
                type: 'split',
                direction: 'vertical',
                position: 99,
                first: { type: 'window', id: 'window-1' },
                second: {
                    type: 'split',
                    direction: 'horizontal',
                    position: 5,
                    first: { type: 'window', id: 'window-2' },
                    second: { type: 'window', id: 'window-3' },
                },
            },
            window_states: {
                'window-1': {},
                'window-2': {},
                'window-3': {},
            },
            selected_window_id: 'window-1',
        });

        expect(sanitized.layout.position).toBe(75);
        expect(sanitized.layout.second.position).toBe(25);
    });
});
