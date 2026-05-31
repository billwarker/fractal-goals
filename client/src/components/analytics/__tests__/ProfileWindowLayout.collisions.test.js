import {
    getGridLayoutExtent,
    __resolveCollisions as resolveCollisions,
    __rescalePanels as rescalePanels,
    rescaleGridLayout,
    updatePanelIfNoOverlap,
} from '../ProfileWindowLayout';

const bounds = { columns: 96, rows: 48 };

describe('ProfileWindowLayout collision logic', () => {
    it('pushes a chain of siblings downward when active panel covers them', () => {
        const panels = [
            { id: 'a', x: 0, y: 0, w: 24, h: 12 },
            { id: 'b', x: 0, y: 12, w: 24, h: 12 },
            { id: 'c', x: 0, y: 24, w: 24, h: 12 },
        ];
        const resolved = resolveCollisions([
            { ...panels[0], y: 6 },
            panels[1],
            panels[2],
        ], 'a', bounds);
        const map = Object.fromEntries(resolved.map((p) => [p.id, p]));
        expect(map.a.y).toBe(6);
        expect(map.b.y).toBeGreaterThanOrEqual(18);
        expect(map.c.y).toBeGreaterThan(map.b.y);
        const overlap = resolved.some((p, i) =>
            resolved.slice(i + 1).some((q) =>
                p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y
            )
        );
        expect(overlap).toBe(false);
    });

    it('falls back to horizontal push when vertical is bounded out', () => {
        const panels = [
            { id: 'a', x: 0, y: 0, w: 24, h: 48 },
            { id: 'b', x: 0, y: 0, w: 24, h: 12 },
        ];
        const resolved = resolveCollisions(panels, 'a', bounds);
        const map = Object.fromEntries(resolved.map((p) => [p.id, p]));
        expect(map.b.x).toBeGreaterThanOrEqual(24);
    });

    it('preserves empty space when panels are not colliding', () => {
        const panels = [
            { id: 'a', x: 0, y: 12, w: 24, h: 12 },
            { id: 'b', x: 0, y: 24, w: 24, h: 12 },
        ];
        const resolved = resolveCollisions(panels, null, bounds);
        expect(resolved).toEqual(panels);
    });

    it('leaves an actively moved panel where it was dropped while pushing collisions away', () => {
        const panels = [
            { id: 'a', x: 20, y: 10, w: 24, h: 12 },
            { id: 'b', x: 20, y: 10, w: 24, h: 12 },
        ];
        const resolved = resolveCollisions(panels, 'a', bounds);
        const map = Object.fromEntries(resolved.map((p) => [p.id, p]));
        expect(map.a).toEqual(panels[0]);
        expect(map.b.y).toBe(22);
    });
});

describe('ProfileWindowLayout rescale logic', () => {
    it('scales panels proportionally when bounds shrink', () => {
        const panels = [
            { id: 'a', x: 0, y: 0, w: 48, h: 24 },
            { id: 'b', x: 48, y: 0, w: 48, h: 24 },
        ];
        const scaled = rescalePanels(panels, { columns: 96, rows: 48 }, { columns: 48, rows: 48 });
        const map = Object.fromEntries(scaled.map((p) => [p.id, p]));
        expect(map.a.w).toBe(24);
        expect(map.b.w).toBe(24);
        expect(map.a.x).toBe(0);
        expect(map.b.x).toBe(24);
    });

    it('scales panels proportionally when bounds grow', () => {
        const panels = [
            { id: 'a', x: 0, y: 0, w: 24, h: 12 },
        ];
        const scaled = rescalePanels(panels, { columns: 48, rows: 24 }, { columns: 96, rows: 48 });
        const map = Object.fromEntries(scaled.map((p) => [p.id, p]));
        expect(map.a.w).toBe(48);
        expect(map.a.h).toBe(24);
    });

    it('returns input unchanged when bounds equal', () => {
        const panels = [{ id: 'a', x: 5, y: 3, w: 24, h: 12 }];
        const scaled = rescalePanels(panels, { columns: 96, rows: 48 }, { columns: 96, rows: 48 });
        expect(scaled).toBe(panels);
    });

    it('enforces minimum panel size when shrinking aggressively', () => {
        const panels = [{ id: 'a', x: 0, y: 0, w: 24, h: 12 }];
        const scaled = rescalePanels(panels, { columns: 96, rows: 48 }, { columns: 12, rows: 6 });
        expect(scaled[0].w).toBeGreaterThanOrEqual(12);
        expect(scaled[0].h).toBeGreaterThanOrEqual(6);
    });

    it('rescales a restored grid layout from saved workspace bounds', () => {
        const layout = {
            type: 'grid',
            panels: [
                { id: 'a', x: 0, y: 0, w: 40, h: 12 },
                { id: 'b', x: 40, y: 0, w: 40, h: 12 },
            ],
        };
        const scaled = rescaleGridLayout(layout, { columns: 80, rows: 48 }, { columns: 96, rows: 48 });
        expect(scaled.panels.find((panel) => panel.id === 'a')).toEqual({ id: 'a', x: 0, y: 0, w: 48, h: 12 });
        expect(scaled.panels.find((panel) => panel.id === 'b')).toEqual({ id: 'b', x: 48, y: 0, w: 48, h: 12 });
    });

    it('reports the occupied grid extent for legacy saved layouts', () => {
        expect(getGridLayoutExtent({
            type: 'grid',
            panels: [
                { id: 'a', x: 0, y: 0, w: 40, h: 12 },
                { id: 'b', x: 40, y: 12, w: 40, h: 10 },
            ],
        })).toEqual({ columns: 80, rows: 22 });
    });
});

describe('ProfileWindowLayout guarded updates', () => {
    it('accepts a panel move when the proposed position is empty', () => {
        const layout = {
            type: 'grid',
            panels: [
                { id: 'a', x: 0, y: 0, w: 24, h: 12 },
                { id: 'b', x: 48, y: 0, w: 24, h: 12 },
            ],
        };
        const result = updatePanelIfNoOverlap(layout, 'a', { x: 24, y: 0 }, bounds);
        expect(result.conflictIds).toEqual([]);
        expect(result.layout.panels.find((panel) => panel.id === 'a')).toEqual({ id: 'a', x: 24, y: 0, w: 24, h: 12 });
    });

    it('rejects a panel move that would overlap another panel', () => {
        const layout = {
            type: 'grid',
            panels: [
                { id: 'a', x: 0, y: 0, w: 24, h: 12 },
                { id: 'b', x: 24, y: 0, w: 24, h: 12 },
            ],
        };
        const result = updatePanelIfNoOverlap(layout, 'a', { x: 20, y: 0 }, bounds);
        expect(result.conflictIds).toEqual(['a', 'b']);
        expect(result.layout).toEqual(layout);
    });

    it('rejects a resize from the left edge that would overlap another panel', () => {
        const layout = {
            type: 'grid',
            panels: [
                { id: 'a', x: 0, y: 0, w: 24, h: 12 },
                { id: 'b', x: 24, y: 0, w: 24, h: 12 },
            ],
        };
        const result = updatePanelIfNoOverlap(layout, 'b', { x: 12, w: 36 }, bounds);
        expect(result.conflictIds).toEqual(['b', 'a']);
        expect(result.layout).toEqual(layout);
    });
});
