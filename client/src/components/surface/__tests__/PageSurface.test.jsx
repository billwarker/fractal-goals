import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import PageSurface from '../PageSurface';
import { getDefaultSurfaceConfig, updateSurfaceModeConfig } from '../surfaceState';

function getConfigWithOpenBackground() {
    const config = getDefaultSurfaceConfig();
    return updateSurfaceModeConfig(config, 'overview', {
        ...config,
        layout: {
            ...config.layout,
            panels: [{ id: 'tree-1', x: 0, y: 0, w: 8, h: 8 }],
        },
    });
}

vi.mock('../gridLayout/GridLayout', async (importOriginal) => {
    const actual = await importOriginal();
    function MockGridLayout({ layout, renderWindow, onBlankSpaceMouseDown, onPointerCellChange, onBoundsChange, windowsEditable }) {
        React.useEffect(() => {
            onBoundsChange?.({ columns: 50, rows: 48 });
        }, [onBoundsChange]);
        const cellInfo = {
            x: 12,
            y: 8,
            columns: 96,
            rows: 48,
            relativeX: 12 / 95,
            relativeY: 8 / 47,
            fromRight: 83,
            fromBottom: 39,
            screen: { x: 240, y: 160 },
        };
        const openAtCell = (event) => onBlankSpaceMouseDown?.(cellInfo, event);
        const openBlankSpace = (event) => {
            if (event.target !== event.currentTarget) return;
            openAtCell(event);
        };
        return (
            <div
                data-testid="grid-layout"
                data-windows-editable={String(Boolean(windowsEditable))}
                data-layout-panels={JSON.stringify(layout?.panels || [])}
                onMouseMove={() => onPointerCellChange?.(cellInfo)}
                onMouseDown={openBlankSpace}
            >
                <div data-testid="grid-background-child" />
                {(layout?.panels || []).map((panel) => (
                    <div key={panel.id} data-testid={`grid-panel-${panel.id}`}>
                        {renderWindow(panel.id, { onDragStart: vi.fn() })}
                    </div>
                ))}
            </div>
        );
    }
    return {
        ...actual,
        default: MockGridLayout,
    };
});

describe('PageSurface', () => {
    it('keeps overview configure mode as a widget grid without a detail placeholder', () => {
        render(
            <PageSurface
                activeConfig={getDefaultSurfaceConfig()}
                configureMode
                viewMode="overview"
                renderTree={() => <div>Tree content</div>}
            />
        );

        expect(screen.getByText('Tree content')).toBeInTheDocument();
        expect(screen.queryByText('Goal detail opens here')).not.toBeInTheDocument();
        expect(screen.queryByRole('separator')).not.toBeInTheDocument();
        expect(screen.getByTestId('grid-layout')).toHaveAttribute('data-windows-editable', 'true');
    });

    it('offers all overview widget types from blank grid space', () => {
        render(
            <PageSurface
                activeConfig={getConfigWithOpenBackground()}
                configureMode
                viewMode="overview"
                renderTree={() => <div>Tree content</div>}
            />
        );

        fireEvent.mouseDown(screen.getByTestId('grid-layout'), { clientX: 240, clientY: 160 });

        expect(screen.getByRole('menuitem', { name: /Last Session/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Calendar/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Metric Card/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /Analytics Panel/i })).toBeInTheDocument();
    });

    it('opens the widget menu from background grid child targets', () => {
        render(
            <PageSurface
                activeConfig={getConfigWithOpenBackground()}
                configureMode
                viewMode="overview"
                renderTree={() => <div>Tree content</div>}
            />
        );

        fireEvent.mouseDown(screen.getByTestId('grid-background-child'), { clientX: 240, clientY: 160 });

        expect(screen.getByRole('menuitem', { name: /Metric Card/i })).toBeInTheDocument();
    });

    it('spawns a selected widget at the clicked grid cell', () => {
        const handleConfigChange = vi.fn();
        const config = getConfigWithOpenBackground();
        render(
            <PageSurface
                activeConfig={config}
                onConfigChange={handleConfigChange}
                configureMode
                viewMode="overview"
                renderTree={() => <div>Tree content</div>}
            />
        );

        fireEvent.mouseDown(screen.getByTestId('grid-layout'), { clientX: 240, clientY: 160 });
        fireEvent.click(screen.getByRole('menuitem', { name: /Metric Card/i }));

        const updater = handleConfigChange.mock.calls[0][0];
        const nextConfig = updater(config);
        const widgetEntry = Object.entries(nextConfig.panel_contents)
            .find(([, content]) => content.kind === 'widget' && content.widgetType === 'metricCard');
        const widgetPanel = nextConfig.layout.panels.find((panel) => panel.id === widgetEntry?.[0]);

        expect(widgetPanel).toMatchObject({ x: 12, y: 8, w: 18, h: 10 });
        expect(widgetEntry?.[1]).toMatchObject({
            kind: 'widget',
            widgetType: 'metricCard',
        });
    });

    it('previews the selected widget minimum footprint while hovering the add menu', () => {
        render(
            <PageSurface
                activeConfig={getConfigWithOpenBackground()}
                configureMode
                viewMode="overview"
                renderTree={() => <div>Tree content</div>}
            />
        );

        fireEvent.mouseDown(screen.getByTestId('grid-layout'), { clientX: 240, clientY: 160 });
        fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /Metric Card/i }));

        expect(screen.getByTestId('surface-widget-footprint-preview')).toHaveStyle({
            left: '240px',
            top: '160px',
            width: '360px',
            height: '200px',
        });
    });

    it.each([
        [/Analytics Panel/i, { width: '480px', height: '320px' }],
        [/Calendar/i, { width: '440px', height: '320px' }],
    ])('previews the %s minimum footprint', (name, expectedSize) => {
        render(
            <PageSurface
                activeConfig={getConfigWithOpenBackground()}
                configureMode
                viewMode="overview"
                renderTree={() => <div>Tree content</div>}
            />
        );

        fireEvent.mouseDown(screen.getByTestId('grid-layout'), { clientX: 240, clientY: 160 });
        fireEvent.mouseEnter(screen.getByRole('menuitem', { name }));

        expect(screen.getByTestId('surface-widget-footprint-preview')).toHaveStyle({
            left: '240px',
            top: '160px',
            ...expectedSize,
        });
    });

    it('does not open the widget menu when clicking inside the tree panel', () => {
        render(
            <PageSurface
                activeConfig={getDefaultSurfaceConfig()}
                configureMode
                viewMode="overview"
                renderTree={() => <div>Tree content</div>}
            />
        );

        fireEvent.mouseDown(screen.getByText('Tree content'), { clientX: 240, clientY: 160 });

        expect(screen.queryByRole('menuitem', { name: /Metric Card/i })).not.toBeInTheDocument();
    });

    it('lightly highlights the hovered background grid cell in configure mode', () => {
        render(
            <PageSurface
                activeConfig={getConfigWithOpenBackground()}
                configureMode
                viewMode="overview"
                renderTree={() => <div>Tree content</div>}
            />
        );

        fireEvent.mouseMove(screen.getByTestId('grid-layout'), { clientX: 240, clientY: 160 });

        expect(screen.getByTestId('surface-grid-cell-hover')).toHaveStyle({
            left: '240px',
            top: '160px',
            width: '20px',
            height: '20px',
        });
    });

    it('does not highlight cells under the tree panel', () => {
        render(
            <PageSurface
                activeConfig={getDefaultSurfaceConfig()}
                configureMode
                viewMode="overview"
                renderTree={() => <div>Tree content</div>}
            />
        );

        fireEvent.mouseMove(screen.getByText('Tree content'), { clientX: 240, clientY: 160 });

        expect(screen.queryByTestId('surface-grid-cell-hover')).not.toBeInTheDocument();
    });

    it('does not treat goal nodes as background widget placement clicks', () => {
        render(
            <PageSurface
                activeConfig={getDefaultSurfaceConfig()}
                configureMode
                viewMode="overview"
                renderTree={() => <div className="react-flow__node">Goal node</div>}
            />
        );

        fireEvent.mouseDown(screen.getByText('Goal node'), { clientX: 240, clientY: 160 });

        expect(screen.queryByRole('menuitem', { name: /Metric Card/i })).not.toBeInTheDocument();
    });

    it('reports live absolute and relative grid coordinates', () => {
        const handlePointerCellChange = vi.fn();
        render(
            <PageSurface
                activeConfig={getDefaultSurfaceConfig()}
                configureMode
                viewMode="overview"
                onPointerCellChange={handlePointerCellChange}
                renderTree={() => <div>Tree content</div>}
            />
        );

        fireEvent.mouseMove(screen.getByTestId('grid-layout'));

        expect(handlePointerCellChange).toHaveBeenCalledWith(expect.objectContaining({
            x: 12,
            y: 8,
            columns: 96,
            rows: 48,
            relativeX: 12 / 95,
            relativeY: 8 / 47,
            fromRight: 83,
            fromBottom: 39,
        }));
    });

    it('persists scoped detail resize against whole-surface grid cells', () => {
        const handleConfigChange = vi.fn();
        const config = getDefaultSurfaceConfig();
        const { container } = render(
            <PageSurface
                activeConfig={config}
                onConfigChange={handleConfigChange}
                configureMode
                viewMode="scoped"
                renderTree={() => <div>Tree content</div>}
                renderDetail={() => <div>Detail content</div>}
            />
        );
        const surface = container.querySelector('.page-surface');
        vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            right: 1000,
            bottom: 800,
            width: 1000,
            height: 800,
            x: 0,
            y: 0,
            toJSON: () => {},
        });

        fireEvent.mouseDown(screen.getByRole('separator'), { clientX: 660, clientY: 100 });
        fireEvent.mouseMove(window, { clientX: 500, clientY: 100 });
        fireEvent.mouseUp(window);

        const updater = handleConfigChange.mock.calls[0][0];
        const nextConfig = updater(config);
        expect(nextConfig.detail_panel).toMatchObject({ w: 25, cols: 50 });
        expect(nextConfig.layout_bounds).toMatchObject({ columns: 25 });
        expect(nextConfig.layout.panels.find((panel) => panel.id === 'tree-1')).toMatchObject({ w: 25 });
    });

    it('keeps a scoped splitter-created gap when the detail panel gets narrower', () => {
        const handleConfigChange = vi.fn();
        const config = updateSurfaceModeConfig(getDefaultSurfaceConfig(), 'scoped', {
            ...getDefaultSurfaceConfig(),
            layout: {
                type: 'grid',
                panels: [{ id: 'tree-1', x: 0, y: 0, w: 30, h: 48 }],
            },
            layout_bounds: { columns: 50, rows: 48 },
            detail_panel: { x: 30, y: 0, w: 20, h: 48, cols: 50 },
            panel_contents: {
                'tree-1': { kind: 'tree', treeView: { mode: 'tree' } },
            },
        });
        const { container } = render(
            <PageSurface
                activeConfig={config}
                onConfigChange={handleConfigChange}
                configureMode
                viewMode="scoped"
                renderTree={() => <div>Tree content</div>}
                renderDetail={() => <div>Detail content</div>}
            />
        );
        const surface = container.querySelector('.page-surface');
        vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            right: 1000,
            bottom: 800,
            width: 1000,
            height: 800,
            x: 0,
            y: 0,
            toJSON: () => {},
        });

        fireEvent.mouseDown(screen.getByRole('separator'), { clientX: 600, clientY: 100 });
        fireEvent.mouseMove(window, { clientX: 760, clientY: 100 });
        fireEvent.mouseUp(window);

        const updater = handleConfigChange.mock.calls[0][0];
        const nextConfig = updater(config);
        expect(nextConfig.detail_panel).toMatchObject({ w: 12, cols: 50, gap: 8 });
        expect(nextConfig.layout_bounds).toMatchObject({ columns: 38 });
        expect(nextConfig.layout.panels.find((panel) => panel.id === 'tree-1')).toMatchObject({ w: 30 });
    });

    it('uses the detail window perimeter as the scoped configure highlight', () => {
        const { container } = render(
            <PageSurface
                activeConfig={getDefaultSurfaceConfig()}
                configureMode
                viewMode="scoped"
                renderTree={() => <div>Tree content</div>}
                renderDetail={() => <div className="surface-detail-window">Detail content</div>}
            />
        );

        expect(container.querySelector('.page-surface-detail-region')).not.toHaveClass('surface-window-outline');
        expect(container.querySelector('.surface-detail-window')).toBeInTheDocument();
        expect(screen.getByRole('separator')).toHaveAttribute('data-no-panel-drag', 'true');
    });

    it('preserves a saved scoped gap between tree and detail regions', () => {
        const config = updateSurfaceModeConfig(getDefaultSurfaceConfig(), 'scoped', {
            ...getDefaultSurfaceConfig(),
            layout: {
                type: 'grid',
                panels: [{ id: 'tree-1', x: 0, y: 0, w: 49, h: 48 }],
            },
            layout_bounds: { columns: 50, rows: 48 },
            detail_panel: { x: 32, y: 0, w: 18, h: 48, cols: 50, gap: 1 },
            panel_contents: {
                'tree-1': { kind: 'tree', treeView: { mode: 'tree' } },
            },
        });

        render(
            <PageSurface
                activeConfig={config}
                configureMode
                viewMode="scoped"
                renderTree={() => <div>Tree content</div>}
                renderDetail={() => <div className="surface-detail-window">Detail content</div>}
            />
        );

        const panels = JSON.parse(screen.getByTestId('grid-layout').dataset.layoutPanels);
        expect(panels.find((panel) => panel.id === 'tree-1')).toMatchObject({ x: 0, w: 49 });
    });
});
