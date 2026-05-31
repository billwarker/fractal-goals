/**
 * ProfileWindowLayout - draggable, resizable analytics dashboard grid.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const GRID_UNIT = 20;
export const GRID_COLUMNS = 96;
export const GRID_ROWS = 48;
export const MIN_PANEL_W = 12;
export const MIN_PANEL_H = 6;
export const DEFAULT_PANEL_W = GRID_COLUMNS;
export const DEFAULT_PANEL_H = GRID_ROWS;
const PANEL_DRAG_BLOCKER_SELECTOR = [
    'button',
    'a',
    'input',
    'select',
    'textarea',
    'canvas',
    '[role="button"]',
    '[contenteditable="true"]',
    '[data-no-panel-drag="true"]',
].join(',');

function isGridLayout(layout) {
    return layout?.type === 'grid' && Array.isArray(layout.panels);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizePanel(panel, index = 0, bounds = { columns: GRID_COLUMNS, rows: GRID_ROWS }) {
    const maxColumns = Math.max(MIN_PANEL_W, bounds.columns || GRID_COLUMNS);
    const maxRows = Math.max(MIN_PANEL_H, bounds.rows || GRID_ROWS);
    const id = typeof panel?.id === 'string' && panel.id ? panel.id : `window-${index + 1}`;
    const w = clamp(Math.round(Number(panel?.w) || DEFAULT_PANEL_W), MIN_PANEL_W, maxColumns);
    const h = clamp(Math.round(Number(panel?.h) || DEFAULT_PANEL_H), MIN_PANEL_H, maxRows);
    const x = clamp(Math.round(Number(panel?.x) || 0), 0, maxColumns - w);
    const y = clamp(Math.round(Number(panel?.y) || 0), 0, maxRows - h);
    return { id, x, y, w, h };
}

function panelsOverlap(left, right) {
    return left.x < right.x + right.w
        && left.x + left.w > right.x
        && left.y < right.y + right.h
        && left.y + left.h > right.y;
}

function getOverlapIds(panels, target) {
    return panels
        .filter((panel) => panel.id !== target.id && panelsOverlap(panel, target))
        .map((panel) => panel.id);
}

function compactPanels(panels) {
    return [...panels]
        .sort((a, b) => (a.y - b.y) || (a.x - b.x))
        .map((panel) => ({ ...panel }));
}

function resolveCollisions(panels, activeId, bounds = { columns: GRID_COLUMNS, rows: GRID_ROWS }) {
    const maxColumns = Math.max(MIN_PANEL_W, bounds.columns || GRID_COLUMNS);
    const maxRows = Math.max(MIN_PANEL_H, bounds.rows || GRID_ROWS);
    const working = panels.map((panel) => ({ ...panel }));

    const queue = activeId
        ? [working.find((panel) => panel.id === activeId)].filter(Boolean)
        : [...working];

    let guard = 0;
    while (queue.length && guard < 500) {
        guard += 1;
        const source = queue.shift();
        if (!source) continue;
        for (const panel of working) {
            if (panel.id === source.id) continue;
            if (!panelsOverlap(source, panel)) continue;

            const targetY = source.y + source.h;
            if (targetY + panel.h <= maxRows) {
                panel.y = targetY;
            } else {
                const targetX = source.x + source.w;
                if (targetX + panel.w <= maxColumns) {
                    panel.x = targetX;
                } else {
                    panel.y = Math.max(0, maxRows - panel.h);
                    panel.x = Math.max(0, Math.min(panel.x, maxColumns - panel.w));
                }
            }
            queue.push(panel);
        }
    }

    return working.map((panel) => ({
        ...panel,
        x: clamp(panel.x, 0, maxColumns - panel.w),
        y: clamp(panel.y, 0, maxRows - panel.h),
    }));
}

function rescalePanels(panels, prevBounds, nextBounds) {
    if (!panels.length) return panels;
    const prevCols = Math.max(MIN_PANEL_W, prevBounds?.columns || GRID_COLUMNS);
    const prevRows = Math.max(MIN_PANEL_H, prevBounds?.rows || GRID_ROWS);
    const nextCols = Math.max(MIN_PANEL_W, nextBounds?.columns || GRID_COLUMNS);
    const nextRows = Math.max(MIN_PANEL_H, nextBounds?.rows || GRID_ROWS);
    if (prevCols === nextCols && prevRows === nextRows) return panels;
    const sx = nextCols / prevCols;
    const sy = nextRows / prevRows;
    const scaled = panels.map((panel) => {
        const w = clamp(Math.max(MIN_PANEL_W, Math.round(panel.w * sx)), MIN_PANEL_W, nextCols);
        const h = clamp(Math.max(MIN_PANEL_H, Math.round(panel.h * sy)), MIN_PANEL_H, nextRows);
        const x = clamp(Math.round(panel.x * sx), 0, nextCols - w);
        const y = clamp(Math.round(panel.y * sy), 0, nextRows - h);
        return { ...panel, x, y, w, h };
    });
    return resolveCollisions(scaled, null, { columns: nextCols, rows: nextRows });
}

export {
    resolveCollisions as __resolveCollisions,
    rescalePanels as __rescalePanels,
};

export function getGridLayoutExtent(layout) {
    const grid = migrateSplitLayoutToGrid(layout);
    if (!grid?.panels?.length) return { columns: 0, rows: 0 };
    return grid.panels.reduce((extent, panel) => ({
        columns: Math.max(extent.columns, panel.x + panel.w),
        rows: Math.max(extent.rows, panel.y + panel.h),
    }), { columns: 0, rows: 0 });
}

export function rescaleGridLayout(layout, prevBounds, nextBounds) {
    const grid = migrateSplitLayoutToGrid(layout);
    if (!grid?.panels?.length) return layout;
    return {
        type: 'grid',
        panels: rescalePanels(grid.panels, prevBounds, nextBounds),
    };
}

export function normalizeGridLayout(layout) {
    if (!isGridLayout(layout)) {
        return null;
    }

    const seen = new Set();
    const panels = layout.panels
        .map(normalizePanel)
        .filter((panel) => {
            if (seen.has(panel.id)) return false;
            seen.add(panel.id);
            return true;
        });

    return panels.length ? { type: 'grid', panels: resolveCollisions(compactPanels(panels), null) } : null;
}

function splitTreeToPanels(node, region = { x: 0, y: 0, w: DEFAULT_PANEL_W, h: DEFAULT_PANEL_H }, panels = []) {
    if (!node) return panels;
    if (node.type === 'window') {
        panels.push(normalizePanel({ id: node.id, ...region }));
        return panels;
    }

    if (node.type !== 'split') return panels;

    const position = clamp(Number(node.position) || 50, 25, 75) / 100;
    if (node.direction === 'vertical') {
        const firstW = clamp(Math.round(region.w * position), MIN_PANEL_W, region.w - MIN_PANEL_W);
        splitTreeToPanels(node.first, { ...region, w: firstW }, panels);
        splitTreeToPanels(node.second, {
            x: region.x + firstW,
            y: region.y,
            w: region.w - firstW,
            h: region.h,
        }, panels);
    } else {
        const firstH = Math.max(MIN_PANEL_H, Math.round(region.h * position));
        splitTreeToPanels(node.first, { ...region, h: firstH }, panels);
        splitTreeToPanels(node.second, {
            x: region.x,
            y: region.y + firstH,
            w: region.w,
            h: Math.max(MIN_PANEL_H, region.h - firstH),
        }, panels);
    }
    return panels;
}

export function migrateSplitLayoutToGrid(layout) {
    if (isGridLayout(layout)) return normalizeGridLayout(layout);
    if (layout?.type === 'window') {
        return { type: 'grid', panels: [normalizePanel({ id: layout.id, x: 0, y: 0, w: DEFAULT_PANEL_W, h: DEFAULT_PANEL_H })] };
    }
    const panels = splitTreeToPanels(layout);
    return panels.length ? { type: 'grid', panels: compactPanels(panels) } : null;
}

export function countWindows(layout) {
    return getWindowIds(layout).length;
}

export function getWindowIds(layout) {
    const grid = migrateSplitLayoutToGrid(layout);
    return grid?.panels.map((panel) => panel.id) || [];
}

export function splitWindow(layout, windowId, direction, newWindowId, bounds = { columns: GRID_COLUMNS, rows: GRID_ROWS }) {
    const grid = migrateSplitLayoutToGrid(layout) || { type: 'grid', panels: [] };
    const maxColumns = Math.max(MIN_PANEL_W, bounds.columns || GRID_COLUMNS);
    const maxRows = Math.max(MIN_PANEL_H, bounds.rows || GRID_ROWS);
    const panels = grid.panels.map((panel) => ({ ...panel }));
    const target = panels.find((panel) => panel.id === windowId);
    if (!target) return grid;
    const boundedTarget = normalizePanel(target, 0, { columns: maxColumns, rows: maxRows });
    Object.assign(target, boundedTarget);

    const canSplitVertically = target.w >= MIN_PANEL_W * 2;
    const canSplitHorizontally = target.h >= MIN_PANEL_H * 2;

    if (direction === 'vertical' && canSplitVertically) {
        const newW = Math.max(MIN_PANEL_W, Math.floor(target.w / 2));
        const oldW = target.w - newW;
        target.w = oldW;
        panels.push(normalizePanel({ id: newWindowId, x: target.x + oldW, y: target.y, w: newW, h: target.h }, 0, { columns: maxColumns, rows: maxRows }));
    } else if (canSplitHorizontally) {
        const newH = Math.max(MIN_PANEL_H, Math.floor(target.h / 2));
        const oldH = Math.max(MIN_PANEL_H, target.h - newH);
        target.h = oldH;
        panels.push(normalizePanel({ id: newWindowId, x: target.x, y: target.y + oldH, w: target.w, h: newH }, 0, { columns: maxColumns, rows: maxRows }));
    } else if (canSplitVertically) {
        const newW = Math.max(MIN_PANEL_W, Math.floor(target.w / 2));
        const oldW = target.w - newW;
        target.w = oldW;
        panels.push(normalizePanel({ id: newWindowId, x: target.x + oldW, y: target.y, w: newW, h: target.h }, 0, { columns: maxColumns, rows: maxRows }));
    } else {
        return grid;
    }

    return { type: 'grid', panels: resolveCollisions(panels, newWindowId, { columns: maxColumns, rows: maxRows }) };
}

export function removeWindow(layout, windowId) {
    const grid = migrateSplitLayoutToGrid(layout);
    if (!grid) return null;
    const panels = grid.panels.filter((panel) => panel.id !== windowId);
    return panels.length ? { type: 'grid', panels: compactPanels(panels) } : null;
}

export function updatePanel(layout, windowId, updates, bounds = { columns: GRID_COLUMNS, rows: GRID_ROWS }) {
    const maxColumns = Math.max(MIN_PANEL_W, bounds.columns || GRID_COLUMNS);
    const maxRows = Math.max(MIN_PANEL_H, bounds.rows || GRID_ROWS);
    const grid = migrateSplitLayoutToGrid(layout);
    if (!grid) return layout;
    const panels = grid.panels.map((panel) => {
        if (panel.id !== windowId) return { ...panel };
        const next = normalizePanel({ ...panel, ...updates }, 0, bounds);
        return {
            ...next,
            x: clamp(next.x, 0, maxColumns - next.w),
            y: clamp(next.y, 0, maxRows - next.h),
        };
    });
    return { type: 'grid', panels: resolveCollisions(panels, windowId, { columns: maxColumns, rows: maxRows }) };
}

export function updatePanelIfNoOverlap(layout, windowId, updates, bounds = { columns: GRID_COLUMNS, rows: GRID_ROWS }) {
    const maxColumns = Math.max(MIN_PANEL_W, bounds.columns || GRID_COLUMNS);
    const maxRows = Math.max(MIN_PANEL_H, bounds.rows || GRID_ROWS);
    const grid = migrateSplitLayoutToGrid(layout);
    if (!grid) return { layout, conflictIds: [] };

    let target = null;
    const panels = grid.panels.map((panel) => {
        const normalized = normalizePanel(panel, 0, { columns: maxColumns, rows: maxRows });
        if (panel.id !== windowId) return normalized;
        target = normalizePanel({ ...normalized, ...updates }, 0, { columns: maxColumns, rows: maxRows });
        return target;
    });

    if (!target) return { layout: grid, conflictIds: [] };
    const overlapIds = getOverlapIds(panels, target);
    if (overlapIds.length) {
        return { layout: grid, conflictIds: [windowId, ...overlapIds] };
    }

    return { layout: { type: 'grid', panels }, conflictIds: [] };
}

function ResizeHandle({ edge, onMouseDown }) {
    const isLeft = edge.includes('left');
    const isRight = edge.includes('right');
    const isTop = edge.includes('top');
    const isBottom = edge.includes('bottom');
    const isHorizontalOnly = edge === 'left' || edge === 'right';
    const isVerticalOnly = edge === 'top' || edge === 'bottom';
    const style = {
        position: 'absolute',
        zIndex: 20,
        background: 'transparent',
    };
    if (isLeft) {
        style.left = 0;
        style.top = isHorizontalOnly ? 10 : 0;
        style.bottom = isHorizontalOnly ? 10 : undefined;
        style.width = 10;
        style.cursor = isHorizontalOnly ? 'ew-resize' : isTop ? 'nwse-resize' : 'nesw-resize';
    }
    if (isRight) {
        style.right = 0;
        style.top = isHorizontalOnly ? 10 : undefined;
        style.bottom = isHorizontalOnly ? 10 : 0;
        style.width = 10;
        style.cursor = isHorizontalOnly ? 'ew-resize' : isTop ? 'nesw-resize' : 'nwse-resize';
    }
    if (isTop) {
        style.top = 0;
        style.left = isVerticalOnly ? 10 : style.left;
        style.right = isVerticalOnly ? 10 : style.right;
        style.height = 10;
        style.cursor = isVerticalOnly ? 'ns-resize' : style.cursor;
    }
    if (isBottom) {
        style.bottom = 0;
        style.left = isVerticalOnly ? 10 : style.left;
        style.right = isVerticalOnly ? 10 : style.right;
        style.height = 10;
        style.cursor = isVerticalOnly ? 'ns-resize' : style.cursor;
    }

    return <div aria-hidden="true" style={style} onMouseDown={(event) => onMouseDown(event, edge)} />;
}

function ProfileWindowLayout({
    layout,
    onLayoutChange,
    onBoundsChange,
    onBlankSpaceMouseDown,
    renderWindow,
    selectedWindowId = null,
    transitionsEnabled = true,
}) {
    const containerRef = useRef(null);
    const grid = useMemo(() => migrateSplitLayoutToGrid(layout) || { type: 'grid', panels: [] }, [layout]);
    const [interaction, setInteraction] = useState(null);
    const [conflictIds, setConflictIds] = useState([]);
    const [bounds, setBounds] = useState(null);
    const prevBoundsRef = useRef(null);
    const onLayoutChangeRef = useRef(onLayoutChange);
    const onBoundsChangeRef = useRef(onBoundsChange);
    const onBlankSpaceMouseDownRef = useRef(onBlankSpaceMouseDown);

    useEffect(() => {
        onLayoutChangeRef.current = onLayoutChange;
    }, [onLayoutChange]);

    useEffect(() => {
        onBoundsChangeRef.current = onBoundsChange;
    }, [onBoundsChange]);

    useEffect(() => {
        onBlankSpaceMouseDownRef.current = onBlankSpaceMouseDown;
    }, [onBlankSpaceMouseDown]);

    useEffect(() => {
        if (!containerRef.current) return undefined;

        const updateBounds = (width, height) => {
            const nextBounds = {
                columns: Math.max(MIN_PANEL_W, Math.floor(width / GRID_UNIT)),
                rows: Math.max(MIN_PANEL_H, Math.floor(height / GRID_UNIT)),
            };
            setBounds(nextBounds);
            onBoundsChangeRef.current?.(nextBounds);
        };

        if (typeof ResizeObserver !== 'function') {
            const rect = containerRef.current.getBoundingClientRect();
            updateBounds(rect.width, rect.height);
            return undefined;
        }

        const observer = new ResizeObserver(([entry]) => {
            const width = entry?.contentRect?.width || 0;
            const height = entry?.contentRect?.height || 0;
            updateBounds(width, height);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!bounds) return;
        const prev = prevBoundsRef.current;
        prevBoundsRef.current = bounds;
        if (!prev) return;
        if (prev.columns === bounds.columns && prev.rows === bounds.rows) return;
        onLayoutChangeRef.current((previous) => {
            const current = migrateSplitLayoutToGrid(previous);
            if (!current || !current.panels.length) return previous;
            const rescaled = rescalePanels(current.panels, prev, bounds);
            return { type: 'grid', panels: rescaled };
        });
    }, [bounds]);

    const startDrag = useCallback((windowId, event) => {
        if (selectedWindowId !== windowId) return;
        if (event.button !== 0 || event.target.closest(PANEL_DRAG_BLOCKER_SELECTOR)) return;
        const panel = grid.panels.find((item) => item.id === windowId);
        if (!panel) return;
        const boundedPanel = normalizePanel(panel, 0, bounds || { columns: GRID_COLUMNS, rows: GRID_ROWS });
        event.preventDefault();
        setConflictIds([]);
        setInteraction({
            type: 'drag',
            windowId,
            startX: event.clientX,
            startY: event.clientY,
            panel: boundedPanel,
        });
    }, [bounds, grid.panels, selectedWindowId]);

    const startResize = useCallback((event, windowId, edge) => {
        if (selectedWindowId !== windowId) return;
        if (event.button !== 0) return;
        const panel = grid.panels.find((item) => item.id === windowId);
        if (!panel) return;
        const boundedPanel = normalizePanel(panel, 0, bounds || { columns: GRID_COLUMNS, rows: GRID_ROWS });
        event.preventDefault();
        event.stopPropagation();
        setConflictIds([]);
        setInteraction({
            type: 'resize',
            edge,
            windowId,
            startX: event.clientX,
            startY: event.clientY,
            panel: boundedPanel,
        });
    }, [bounds, grid.panels, selectedWindowId]);

    useEffect(() => {
        if (!interaction || !containerRef.current) return undefined;

        const rect = containerRef.current.getBoundingClientRect();
        const maxColumns = Math.max(MIN_PANEL_W, Math.floor(rect.width / GRID_UNIT));
        const maxRows = Math.max(MIN_PANEL_H, Math.floor(rect.height / GRID_UNIT));

        const handleMove = (event) => {
            const deltaCols = Math.round((event.clientX - interaction.startX) / GRID_UNIT);
            const deltaRows = Math.round((event.clientY - interaction.startY) / GRID_UNIT);

            if (interaction.type === 'drag') {
                const updates = {
                    x: clamp(interaction.panel.x + deltaCols, 0, maxColumns - interaction.panel.w),
                    y: clamp(interaction.panel.y + deltaRows, 0, maxRows - interaction.panel.h),
                };
                onLayoutChange((previous) => {
                    const result = updatePanelIfNoOverlap(previous, interaction.windowId, updates, { columns: maxColumns, rows: maxRows });
                    setConflictIds(result.conflictIds);
                    return result.layout;
                });
                return;
            }

            let nextX = interaction.panel.x;
            let nextY = interaction.panel.y;
            let nextW = interaction.panel.w;
            let nextH = interaction.panel.h;
            if (interaction.edge.includes('left')) {
                nextX = clamp(interaction.panel.x + deltaCols, 0, interaction.panel.x + interaction.panel.w - MIN_PANEL_W);
                nextW = interaction.panel.w + interaction.panel.x - nextX;
            }
            if (interaction.edge.includes('right')) {
                nextW = clamp(interaction.panel.w + deltaCols, MIN_PANEL_W, maxColumns - interaction.panel.x);
            }
            if (interaction.edge.includes('top')) {
                nextY = clamp(interaction.panel.y + deltaRows, 0, interaction.panel.y + interaction.panel.h - MIN_PANEL_H);
                nextH = interaction.panel.h + interaction.panel.y - nextY;
            }
            if (interaction.edge.includes('bottom')) {
                nextH = clamp(interaction.panel.h + deltaRows, MIN_PANEL_H, maxRows - interaction.panel.y);
            }

            onLayoutChange((previous) => {
                const result = updatePanelIfNoOverlap(previous, interaction.windowId, {
                    x: nextX,
                    y: nextY,
                    w: nextW,
                    h: nextH,
                }, { columns: maxColumns, rows: maxRows });
                setConflictIds(result.conflictIds);
                return result.layout;
            });
        };

        const handleUp = () => {
            setConflictIds([]);
            setInteraction(null);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [interaction, onLayoutChange]);

    const handleBlankSpaceMouseDown = useCallback((event) => {
        if (event.target !== event.currentTarget) return;
        onBlankSpaceMouseDownRef.current?.(event);
    }, []);

    return (
        <div
            ref={containerRef}
            onMouseDown={handleBlankSpaceMouseDown}
            style={{
                width: '100%',
                height: '100%',
                minHeight: 0,
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            <div
                onMouseDown={handleBlankSpaceMouseDown}
                style={{ position: 'relative', width: '100%', height: '100%' }}
            >
                {grid.panels.map((panel) => {
                    const boundedPanel = normalizePanel(panel, 0, bounds || { columns: GRID_COLUMNS, rows: GRID_ROWS });
                    const left = boundedPanel.x * GRID_UNIT;
                    const top = boundedPanel.y * GRID_UNIT;
                    const width = boundedPanel.w * GRID_UNIT;
                    const height = boundedPanel.h * GRID_UNIT;
                    const hasConflict = conflictIds.includes(boundedPanel.id);
                    const isSelected = selectedWindowId === boundedPanel.id;

                    return (
                        <div
                            key={boundedPanel.id}
                            onMouseDown={(event) => startDrag(boundedPanel.id, event)}
                            style={{
                                position: 'absolute',
                                left,
                                top,
                                width,
                                height,
                                minWidth: 0,
                                minHeight: 0,
                                display: 'flex',
                                cursor: interaction?.type === 'drag' && interaction.windowId === boundedPanel.id ? 'grabbing' : undefined,
                                outline: hasConflict ? '2px solid var(--color-error)' : undefined,
                                outlineOffset: hasConflict ? '-2px' : undefined,
                                boxShadow: hasConflict ? '0 0 0 2px color-mix(in srgb, var(--color-error) 45%, transparent)' : undefined,
                                transition: interaction || !transitionsEnabled ? 'none' : 'left 120ms ease, top 120ms ease, width 120ms ease, height 120ms ease',
                            }}
                        >
                            {renderWindow(boundedPanel.id, {
                                onDragStart: (event) => startDrag(boundedPanel.id, event),
                            })}
                            {isSelected && (
                                <>
                                    <ResizeHandle edge="top" onMouseDown={(event, edge) => startResize(event, boundedPanel.id, edge)} />
                                    <ResizeHandle edge="right" onMouseDown={(event, edge) => startResize(event, boundedPanel.id, edge)} />
                                    <ResizeHandle edge="bottom" onMouseDown={(event, edge) => startResize(event, boundedPanel.id, edge)} />
                                    <ResizeHandle edge="left" onMouseDown={(event, edge) => startResize(event, boundedPanel.id, edge)} />
                                    <ResizeHandle edge="top-left" onMouseDown={(event, edge) => startResize(event, boundedPanel.id, edge)} />
                                    <ResizeHandle edge="top-right" onMouseDown={(event, edge) => startResize(event, boundedPanel.id, edge)} />
                                    <ResizeHandle edge="bottom-left" onMouseDown={(event, edge) => startResize(event, boundedPanel.id, edge)} />
                                    <ResizeHandle edge="bottom-right" onMouseDown={(event, edge) => startResize(event, boundedPanel.id, edge)} />
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default ProfileWindowLayout;
