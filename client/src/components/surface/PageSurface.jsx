import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import GridLayout, {
    GRID_UNIT,
    GRID_COLUMNS,
    GRID_ROWS,
    migrateSplitLayoutToGrid,
    updatePanelIfNoOverlap,
} from './gridLayout/GridLayout';
import SurfaceWidget from './SurfaceWidget';
import AddWidgetMenu from './AddWidgetMenu';
import { getWidgetDefinition, getWidgetMinimumSize } from './widgetRegistry';
import {
    generatePanelId,
    fitConfigToBounds,
    getDefaultSurfaceConfig,
    getHighestPanelIndex,
    getTreePanelId,
    sanitizeSurfaceConfig,
} from './surfaceState';

const DEFAULT_DETAIL_PCT = 34;
const MIN_DETAIL_PCT = 20;
const MAX_DETAIL_PCT = 70;

function clampDetailCells(cells, totalColumns) {
    const cols = Math.max(1, totalColumns || GRID_COLUMNS);
    const minCells = Math.max(1, Math.round((MIN_DETAIL_PCT / 100) * cols));
    const maxCells = Math.max(minCells, Math.round((MAX_DETAIL_PCT / 100) * cols));
    return Math.min(maxCells, Math.max(minCells, Math.round(cells)));
}

/** Detail region width (in whole-surface grid cells) from the detail_panel hint. */
function detailCellsFromHint(hint, totalColumns) {
    const cols = Math.max(1, totalColumns || GRID_COLUMNS);
    if (hint && typeof hint === 'object') {
        const savedCols = hint.cols || cols;
        if (hint.w && savedCols) {
            return clampDetailCells(Math.round((hint.w / savedCols) * cols), cols);
        }
    }
    return clampDetailCells(Math.round((DEFAULT_DETAIL_PCT / 100) * cols), cols);
}

const PANEL_CLICK_BLOCKER_SELECTOR = [
    'button',
    'a',
    'input',
    'select',
    'textarea',
    'canvas',
    '[role="button"]',
    '[contenteditable="true"]',
    '[data-no-panel-drag="true"]',
    '[data-resize-edge]',
    '.surface-panel-tree',
    '.react-flow__node',
    '.react-flow__edge',
    '.react-flow__handle',
    '.react-flow__controls',
    '.react-flow__attribution',
    '.surface-panel-widget',
    '.surface-add-widget-menu',
    '.surface-window-chrome',
    '.surface-splitter',
].join(',');

function panelsOverlap(left, right) {
    return left.x < right.x + right.w
        && left.x + left.w > right.x
        && left.y < right.y + right.h
        && left.y + left.h > right.y;
}

function findAvailablePlacement(panels, preferred, size, bounds) {
    const cols = bounds?.columns || GRID_COLUMNS;
    const rows = bounds?.rows || GRID_ROWS;
    const maxX = Math.max(0, cols - size.w);
    const maxY = Math.max(0, rows - size.h);
    const start = {
        x: Math.max(0, Math.min(preferred.x, maxX)),
        y: Math.max(0, Math.min(preferred.y, maxY)),
    };
    const fits = (candidate) => !panels.some((panel) => panelsOverlap(panel, candidate));
    const first = { ...start, ...size };
    if (fits(first)) return first;

    const maxRadius = Math.max(cols, rows);
    for (let radius = 1; radius <= maxRadius; radius += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                const candidate = {
                    x: Math.max(0, Math.min(start.x + dx, maxX)),
                    y: Math.max(0, Math.min(start.y + dy, maxY)),
                    ...size,
                };
                if (fits(candidate)) return candidate;
            }
        }
    }

    return null;
}

function getScopedHierarchyGapCells(layout, treePanelId, columns) {
    if (!columns || !treePanelId || !layout?.panels?.length) return 0;
    const treePanel = layout.panels.find((panel) => panel.id === treePanelId);
    if (!treePanel) return 0;
    return Math.max(0, columns - (treePanel.x + treePanel.w));
}

function clampLayoutInsideBounds(layout, { columns, rows }) {
    const grid = migrateSplitLayoutToGrid(layout);
    if (!grid?.panels?.length) return layout;
    const maxColumns = Math.max(1, Math.round(Number(columns) || GRID_COLUMNS));
    const maxRows = Math.max(1, Math.round(Number(rows) || GRID_ROWS));
    return {
        type: 'grid',
        panels: grid.panels.map((panel) => {
            const w = Math.min(panel.w, maxColumns);
            const h = Math.min(panel.h, maxRows);
            return {
                ...panel,
                x: Math.max(0, Math.min(panel.x, maxColumns - w)),
                y: Math.max(0, Math.min(panel.y, maxRows - h)),
                w,
                h,
            };
        }),
    };
}

function detailHintWithGap(detailPanel, gap, { columns, rows }) {
    const cols = Math.max(1, columns || GRID_COLUMNS);
    const resolvedRows = Math.max(1, rows || GRID_ROWS);
    const resolvedGap = Math.max(0, Math.round(Number(gap) || 0));

    if (detailPanel && typeof detailPanel === 'object') {
        const w = clampDetailCells(detailPanel.w || Math.round((DEFAULT_DETAIL_PCT / 100) * cols), cols);
        return {
            ...detailPanel,
            x: cols - w,
            y: 0,
            w,
            h: detailPanel.h || resolvedRows,
            cols,
            gap: resolvedGap,
        };
    }

    const w = detailCellsFromHint(detailPanel, cols);
    return {
        x: cols - w,
        y: 0,
        w,
        h: resolvedRows,
        cols,
        gap: resolvedGap,
    };
}

/**
 * Configurable page surface shell with two explicit view modes:
 *
 *  - "overview"  (no goal selected): the goal-hierarchy + widgets own the full
 *    surface.
 *  - "scoped"    (a goal is selected): the surface splits into a grid region
 *    (tree + widgets) and a goal-detail region, sharing space via flexbox so
 *    they never overlap. The split ratio is the persisted detail_panel width.
 *
 * In scoped configure mode both regions are outlined like analytics profile
 * windows, and a splitter between them adjusts (and persists) the split ratio.
 * In overview configure mode only the grid is shown so the user can resize the
 * hierarchy viewport and place widgets across the rest of the surface.
 */
export default function PageSurface({
    activeConfig,
    onConfigChange,
    configureMode = false,
    viewMode = 'overview',
    selectedPanelId,
    onSelectedPanelIdChange,
    onPointerCellChange,
    renderTree,
    renderDetail,
    sharedWidgetData,
}) {
    const [bounds, setBounds] = useState(null);
    const [isSettling, setIsSettling] = useState(false);
    const [addMenu, setAddMenu] = useState(null); // { cell:{x,y}, screen:{x,y} }
    const [previewWidgetType, setPreviewWidgetType] = useState(null);
    const [hoveredCell, setHoveredCell] = useState(null);
    const [dragDetailCells, setDragDetailCells] = useState(null); // live splitter drag value
    const [surfaceBounds, setSurfaceBounds] = useState(null);
    const containerRef = useRef(null);
    const gridRegionRef = useRef(null);
    const prevConfigKeyRef = useRef(null);
    const splitterDragLayoutRef = useRef(null);

    const storedConfig = useMemo(
        () => sanitizeSurfaceConfig(activeConfig) || getDefaultSurfaceConfig(),
        [activeConfig],
    );
    const config = useMemo(
        () => {
            if (!bounds) return storedConfig;
            if (viewMode === 'scoped' && dragDetailCells != null) {
                return storedConfig;
            }
            return fitConfigToBounds(storedConfig, bounds);
        },
        [bounds, dragDetailCells, storedConfig, viewMode],
    );

    const treePanelId = getTreePanelId(config.panel_contents);
    const liveLayout = useMemo(
        () => migrateSplitLayoutToGrid(config.layout) || { type: 'grid', panels: [] },
        [config.layout],
    );

    // The detail region only exists in scoped mode. Overview configuration is a
    // pure grid surface: hierarchy + widgets, with no impossible detail panel.
    const detailFullscreen = config.detail_panel === 'fullscreen';
    const showDetailRegion = !detailFullscreen && viewMode === 'scoped';
    const surfaceColumns = surfaceBounds?.columns || config.detail_panel?.cols || GRID_COLUMNS;
    const detailCells = dragDetailCells != null
        ? clampDetailCells(dragDetailCells, surfaceColumns)
        : detailCellsFromHint(config.detail_panel, surfaceColumns);
    const minDetailCells = clampDetailCells(1, surfaceColumns);
    const maxDetailCells = clampDetailCells(surfaceColumns, surfaceColumns);
    const detailWidthFromCells = useCallback((cells) => {
        const startPx = (surfaceColumns - cells) * GRID_UNIT;
        return surfaceBounds?.width
            ? Math.max(GRID_UNIT, surfaceBounds.width - startPx)
            : cells * GRID_UNIT;
    }, [surfaceBounds?.width, surfaceColumns]);
    const detailWidthPx = detailWidthFromCells(detailCells);
    const minDetailWidthPx = detailWidthFromCells(minDetailCells);
    const maxDetailWidthPx = detailWidthFromCells(maxDetailCells);
    const splitterRightPx = Math.max(0, detailWidthPx - (GRID_UNIT / 2));
    const displayLayout = liveLayout;
    const widgetFootprintPreview = useMemo(() => {
        if (!addMenu || !previewWidgetType || !bounds) return null;
        const size = getWidgetMinimumSize(previewWidgetType);
        const w = Math.min(size.w, bounds.columns);
        const h = Math.min(size.h, bounds.rows);
        const placement = findAvailablePlacement(
            liveLayout.panels,
            addMenu.cell,
            { w, h },
            { columns: bounds.columns, rows: bounds.rows }
        );
        return placement ? { ...placement, widgetType: previewWidgetType } : null;
    }, [addMenu, bounds, liveLayout.panels, previewWidgetType]);

    // Settle (suppress transitions for one paint) on config identity change or
    // when the split appears/disappears, mirroring analytics' restore behavior.
    useEffect(() => {
        const key = `${activeConfig ? 'cfg' : 'def'}:${showDetailRegion}`;
        if (prevConfigKeyRef.current === key) return;
        prevConfigKeyRef.current = key;
        setIsSettling(true);
    }, [activeConfig, showDetailRegion]);

    useEffect(() => {
        if (!isSettling || !bounds) return undefined;
        let second = 0;
        const first = window.requestAnimationFrame(() => {
            second = window.requestAnimationFrame(() => setIsSettling(false));
        });
        return () => {
            window.cancelAnimationFrame(first);
            if (second) window.cancelAnimationFrame(second);
        };
    }, [isSettling, bounds]);

    useEffect(() => {
        const measure = () => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;
            setSurfaceBounds({
                columns: Math.max(1, Math.floor(rect.width / GRID_UNIT)),
                rows: Math.max(1, Math.floor(rect.height / GRID_UNIT)),
                width: rect.width,
                height: rect.height,
            });
        };
        measure();
        if (!containerRef.current || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const handleBoundsChange = useCallback((next) => {
        setBounds(next);
    }, []);

    // Persist tree/widget drag-resize back to the layout.
    const handleLayoutChange = useCallback((updater) => {
        if (!onConfigChange) return;
        onConfigChange((prevConfig) => {
            const prev = sanitizeSurfaceConfig(prevConfig) || getDefaultSurfaceConfig();
            const fittedPrev = bounds ? fitConfigToBounds(prev, bounds) : prev;
            const prevGrid = migrateSplitLayoutToGrid(fittedPrev.layout) || { type: 'grid', panels: [] };
            const nextLayout = typeof updater === 'function' ? updater(prevGrid) : updater;
            const nextGrid = migrateSplitLayoutToGrid(nextLayout) || prevGrid;
            const scopedGap = viewMode === 'scoped'
                ? getScopedHierarchyGapCells(nextGrid, getTreePanelId(fittedPrev.panel_contents), bounds?.columns)
                : null;
            return {
                ...fittedPrev,
                layout: nextGrid,
                layout_bounds: bounds || fittedPrev.layout_bounds,
                detail_panel: scopedGap == null
                    ? fittedPrev.detail_panel
                    : detailHintWithGap(fittedPrev.detail_panel, scopedGap, {
                        columns: surfaceBounds?.columns || fittedPrev.detail_panel?.cols || GRID_COLUMNS,
                        rows: surfaceBounds?.rows || bounds?.rows || GRID_ROWS,
                    }),
            };
        });
    }, [onConfigChange, bounds, surfaceBounds, viewMode]);

    // Persist the split ratio as the detail_panel hint (width in grid cells
    // over the current bounds, so it scales like every other panel).
    const persistDetailCells = useCallback((cells, totalColumns) => {
        if (!onConfigChange) return;
        onConfigChange((prevConfig) => {
            const prev = sanitizeSurfaceConfig(prevConfig) || getDefaultSurfaceConfig();
            const fittedPrev = bounds ? fitConfigToBounds(prev, bounds) : prev;
            const basePrev = viewMode === 'scoped' ? prev : fittedPrev;
            const cols = Math.max(1, totalColumns || surfaceBounds?.columns || GRID_COLUMNS);
            const rows = Math.max(1, surfaceBounds?.rows || bounds?.rows || GRID_ROWS);
            const w = clampDetailCells(cells, cols);
            const gridColumns = Math.max(1, cols - w);
            const gridRows = bounds?.rows || basePrev.layout_bounds?.rows || rows;
            const dragBaseLayout = viewMode === 'scoped' && splitterDragLayoutRef.current
                ? splitterDragLayoutRef.current
                : basePrev.layout;
            const nextLayout = viewMode === 'scoped'
                ? clampLayoutInsideBounds(dragBaseLayout, { columns: gridColumns, rows: gridRows })
                : basePrev.layout;
            const scopedGap = viewMode === 'scoped'
                ? getScopedHierarchyGapCells(
                    migrateSplitLayoutToGrid(nextLayout) || nextLayout,
                    getTreePanelId(basePrev.panel_contents),
                    gridColumns
                )
                : 0;
            return {
                ...basePrev,
                layout: nextLayout,
                layout_bounds: { columns: gridColumns, rows: gridRows },
                detail_panel: { x: cols - w, y: 0, w, h: rows, cols, gap: scopedGap },
            };
        });
    }, [onConfigChange, bounds, surfaceBounds, viewMode]);

    // Splitter drag: adjust the detail region width (snapped to grid cells).
    const handleSplitterMouseDown = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        splitterDragLayoutRef.current = liveLayout;
        const cols = Math.max(1, Math.floor(rect.width / GRID_UNIT));
        let latestCells = detailCells;

        const onMove = (e) => {
            const boundaryCellsFromLeft = Math.round((e.clientX - rect.left) / GRID_UNIT);
            const cellsFromRight = cols - boundaryCellsFromLeft;
            latestCells = clampDetailCells(cellsFromRight, cols);
            setDragDetailCells(latestCells);
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            persistDetailCells(latestCells, cols);
            setDragDetailCells(null);
            splitterDragLayoutRef.current = null;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [detailCells, liveLayout, persistDetailCells]);

    const handleBlankSpaceMouseDown = useCallback((cellInfo, event) => {
        onSelectedPanelIdChange?.(null);
        if (!configureMode || !event) return;
        const cellX = Number.isFinite(cellInfo?.x) ? cellInfo.x : 0;
        const cellY = Number.isFinite(cellInfo?.y) ? cellInfo.y : 0;
        setAddMenu({
            cell: { x: Math.max(0, cellX), y: Math.max(0, cellY) },
            screen: { x: event.clientX, y: event.clientY },
        });
        setPreviewWidgetType(null);
    }, [configureMode, onSelectedPanelIdChange]);

    const shouldIgnoreSurfaceCellEvent = useCallback((event) => {
        return Boolean(event.target?.closest?.(PANEL_CLICK_BLOCKER_SELECTOR));
    }, []);

    const getGridCellFromEvent = useCallback((event) => {
        const rect = gridRegionRef.current?.getBoundingClientRect();
        const cols = Math.max(1, bounds?.columns || GRID_COLUMNS);
        const rows = Math.max(1, bounds?.rows || GRID_ROWS);
        const left = rect?.left || 0;
        const top = rect?.top || 0;
        const rawX = Math.floor((event.clientX - left) / GRID_UNIT);
        const rawY = Math.floor((event.clientY - top) / GRID_UNIT);
        const x = Math.max(0, Math.min(cols - 1, rawX));
        const y = Math.max(0, Math.min(rows - 1, rawY));
        return {
            x,
            y,
            columns: cols,
            rows,
            fromRight: cols - x - 1,
            fromBottom: rows - y - 1,
            relativeX: cols > 1 ? x / (cols - 1) : 0,
            relativeY: rows > 1 ? y / (rows - 1) : 0,
            screen: { x: event.clientX, y: event.clientY },
        };
    }, [bounds]);

    const handleGridRegionMouseMove = useCallback((event) => {
        if (!configureMode || shouldIgnoreSurfaceCellEvent(event)) {
            setHoveredCell(null);
            return;
        }
        setHoveredCell(getGridCellFromEvent(event));
    }, [configureMode, getGridCellFromEvent, shouldIgnoreSurfaceCellEvent]);

    const handleGridRegionMouseDownCapture = useCallback((event) => {
        if (!configureMode || event.button !== 0 || shouldIgnoreSurfaceCellEvent(event)) return;
        event.stopPropagation();
        handleBlankSpaceMouseDown(getGridCellFromEvent(event), event);
    }, [configureMode, getGridCellFromEvent, handleBlankSpaceMouseDown, shouldIgnoreSurfaceCellEvent]);

    const handleGridRegionMouseLeave = useCallback(() => {
        setHoveredCell(null);
    }, []);

    const handleAddWidget = useCallback((widgetType) => {
        const cell = addMenu?.cell || { x: 0, y: 0 };
        setAddMenu(null);
        setPreviewWidgetType(null);
        if (!onConfigChange) return;
        const def = getWidgetDefinition(widgetType);
        onConfigChange((prevConfig) => {
            const prev = sanitizeSurfaceConfig(prevConfig) || getDefaultSurfaceConfig();
            const fittedPrev = bounds ? fitConfigToBounds(prev, bounds) : prev;
            const grid = migrateSplitLayoutToGrid(fittedPrev.layout) || { type: 'grid', panels: [] };
            const nextIndex = getHighestPanelIndex(grid) + 1;
            const id = generatePanelId(nextIndex);
            const cols = bounds?.columns || GRID_COLUMNS;
            const rows = bounds?.rows || GRID_ROWS;
            const size = getWidgetMinimumSize(widgetType);
            const w = Math.min(size.w, cols);
            const h = Math.min(size.h, rows);
            const placement = findAvailablePlacement(grid.panels, cell, { w, h }, { columns: cols, rows });
            if (!placement) return fittedPrev;
            const candidate = { type: 'grid', panels: [...grid.panels, { id, ...placement }] };
            const result = updatePanelIfNoOverlap(candidate, id, placement, { columns: cols, rows });
            if (result.conflictIds.length) {
                return fittedPrev;
            }
            return {
                ...fittedPrev,
                layout: result.layout,
                layout_bounds: bounds || fittedPrev.layout_bounds,
                panel_contents: {
                    ...fittedPrev.panel_contents,
                    [id]: { kind: 'widget', widgetType, state: { ...def.defaultState } },
                },
            };
        });
        onSelectedPanelIdChange?.(null);
    }, [addMenu, onConfigChange, bounds, onSelectedPanelIdChange]);

    const handleRemovePanel = useCallback((panelId) => {
        if (!onConfigChange) return;
        onConfigChange((prevConfig) => {
            const prev = sanitizeSurfaceConfig(prevConfig) || getDefaultSurfaceConfig();
            const fittedPrev = bounds ? fitConfigToBounds(prev, bounds) : prev;
            const grid = migrateSplitLayoutToGrid(fittedPrev.layout) || { type: 'grid', panels: [] };
            const panels = grid.panels.filter((p) => p.id !== panelId);
            const { [panelId]: _removed, ...restContents } = fittedPrev.panel_contents;
            return { ...fittedPrev, layout: { type: 'grid', panels }, panel_contents: restContents };
        });
        if (selectedPanelId === panelId) onSelectedPanelIdChange?.(null);
    }, [onConfigChange, bounds, selectedPanelId, onSelectedPanelIdChange]);

    const handleWidgetStateChange = useCallback((panelId, nextState) => {
        if (!onConfigChange) return;
        onConfigChange((prevConfig) => {
            const prev = sanitizeSurfaceConfig(prevConfig) || getDefaultSurfaceConfig();
            const fittedPrev = bounds ? fitConfigToBounds(prev, bounds) : prev;
            const existing = fittedPrev.panel_contents[panelId];
            if (!existing || existing.kind !== 'widget') return prevConfig;
            return {
                ...fittedPrev,
                panel_contents: {
                    ...fittedPrev.panel_contents,
                    [panelId]: { ...existing, state: { ...existing.state, ...nextState } },
                },
            };
        });
    }, [onConfigChange, bounds]);

    const renderWindow = useCallback((panelId, { onDragStart }) => {
        const onSelect = () => {
            if (configureMode && selectedPanelId !== panelId) {
                onSelectedPanelIdChange?.(panelId);
            }
        };
        const isSelected = configureMode && selectedPanelId === panelId;
        const content = config.panel_contents[panelId];
        const isTree = content?.kind === 'tree' || panelId === treePanelId;

        if (isTree) {
            return (
                <div
                    className={`surface-panel surface-panel-tree ${configureMode ? 'surface-window-outline surface-panel-configurable' : ''} ${isSelected ? 'surface-window-selected' : ''}`}
                    style={{ width: '100%', height: '100%', position: 'relative' }}
                >
                    {configureMode && (
                        <div className="surface-window-chrome surface-window-chrome-tree" onMouseDown={onDragStart} style={{ cursor: 'grab' }}>
                            <span className="surface-window-title">Goal Hierarchy</span>
                        </div>
                    )}
                    {renderTree?.({ treeView: content?.treeView, configureMode })}
                </div>
            );
        }

        return (
            <div
                className={`surface-panel surface-panel-widget ${configureMode ? 'surface-window-outline' : ''} ${isSelected ? 'surface-window-selected' : ''}`}
                style={{ width: '100%', height: '100%' }}
                onMouseDown={onSelect}
            >
                <SurfaceWidget
                    widgetType={content?.widgetType}
                    state={content?.state}
                    onStateChange={(next) => handleWidgetStateChange(panelId, next)}
                    sharedData={sharedWidgetData}
                    viewMode={viewMode}
                    configureMode={configureMode}
                    onDragStart={onDragStart}
                    onRemove={() => handleRemovePanel(panelId)}
                />
            </div>
        );
    }, [config.panel_contents, treePanelId, configureMode, selectedPanelId, onSelectedPanelIdChange, renderTree, sharedWidgetData, viewMode, handleWidgetStateChange, handleRemovePanel]);

    const detailLive = viewMode === 'scoped';

    return (
        <div
            ref={containerRef}
            className={`page-surface ${configureMode ? 'page-surface-configuring' : ''}`}
            style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'row' }}
        >
            <div
                ref={gridRegionRef}
                className="page-surface-grid-region"
                style={{ flex: 1, minWidth: 0, height: '100%', position: 'relative' }}
                onMouseDownCapture={handleGridRegionMouseDownCapture}
                onMouseMove={handleGridRegionMouseMove}
                onMouseLeave={handleGridRegionMouseLeave}
            >
                {configureMode && hoveredCell && (
                    <div
                        className="surface-grid-cell-hover"
                        data-testid="surface-grid-cell-hover"
                        style={{
                            left: `${hoveredCell.x * GRID_UNIT}px`,
                            top: `${hoveredCell.y * GRID_UNIT}px`,
                            width: `${GRID_UNIT}px`,
                            height: `${GRID_UNIT}px`,
                        }}
                    />
                )}
                {configureMode && widgetFootprintPreview && (
                    <div
                        className="surface-widget-footprint-preview"
                        data-testid="surface-widget-footprint-preview"
                        style={{
                            left: `${widgetFootprintPreview.x * GRID_UNIT}px`,
                            top: `${widgetFootprintPreview.y * GRID_UNIT}px`,
                            width: `${widgetFootprintPreview.w * GRID_UNIT}px`,
                            height: `${widgetFootprintPreview.h * GRID_UNIT}px`,
                        }}
                    />
                )}
                <GridLayout
                    layout={displayLayout}
                    onLayoutChange={handleLayoutChange}
                    onBoundsChange={handleBoundsChange}
                    onBlankSpaceMouseDown={handleBlankSpaceMouseDown}
                    onPointerCellChange={onPointerCellChange}
                    renderWindow={renderWindow}
                    selectedWindowId={configureMode ? selectedPanelId : null}
                    windowsEditable={configureMode}
                    rescaleOnBoundsChange={false}
                    transitionsEnabled={!isSettling}
                />
                {addMenu && (
                    <AddWidgetMenu
                        position={addMenu.screen}
                        onSelect={handleAddWidget}
                        onPreviewChange={setPreviewWidgetType}
                        onClose={() => {
                            setPreviewWidgetType(null);
                            setAddMenu(null);
                        }}
                    />
                )}
            </div>

            {showDetailRegion && (
                <>
                    {configureMode && (
                        <div
                            className="surface-splitter"
                            data-no-panel-drag="true"
                            role="separator"
                            aria-orientation="vertical"
                            title="Drag to resize"
                            style={{ right: `${splitterRightPx}px` }}
                            onMouseDown={handleSplitterMouseDown}
                        />
                    )}
                    <div
                        className="page-surface-detail-region"
                        style={{
                            width: `${detailWidthPx}px`,
                            minWidth: `${minDetailWidthPx}px`,
                            maxWidth: `${maxDetailWidthPx}px`,
                            height: '100%',
                            flex: `0 0 ${detailWidthPx}px`,
                            transition: isSettling || dragDetailCells != null ? 'none' : 'width 120ms ease, flex-basis 120ms ease',
                        }}
                    >
                        {detailLive
                            ? renderDetail?.()
                            : (
                                <div className="surface-window-placeholder">
                                    Goal detail opens here
                                </div>
                            )}
                    </div>
                </>
            )}
        </div>
    );
}
