import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import GridLayout from '../gridLayout/GridLayout';

function installRect(width = 1920, height = 960) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height,
        toJSON: () => {},
    }));
}

describe('GridLayout pointer cells', () => {
    beforeEach(() => {
        installRect();
    });

    it('reports absolute and relative cell coordinates while hovering the grid', () => {
        const handlePointerCellChange = vi.fn();
        render(
            <GridLayout
                layout={{ type: 'grid', panels: [] }}
                onPointerCellChange={handlePointerCellChange}
                renderWindow={() => null}
            />
        );

        fireEvent.mouseMove(screen.getByTestId('grid-layout-root'), { clientX: 245, clientY: 165 });

        expect(handlePointerCellChange).toHaveBeenCalledWith(expect.objectContaining({
            x: 12,
            y: 8,
            columns: 96,
            rows: 48,
            fromRight: 83,
            fromBottom: 39,
            relativeX: 12 / 95,
            relativeY: 8 / 47,
        }));
    });

    it('passes the clicked blank cell to the add-widget callback', () => {
        const handleBlankSpaceMouseDown = vi.fn();
        render(
            <GridLayout
                layout={{ type: 'grid', panels: [] }}
                onBlankSpaceMouseDown={handleBlankSpaceMouseDown}
                renderWindow={() => null}
            />
        );

        fireEvent.mouseDown(screen.getByTestId('grid-layout-plane'), { clientX: 400, clientY: 220 });

        expect(handleBlankSpaceMouseDown).toHaveBeenCalledWith(
            expect.objectContaining({
                x: 20,
                y: 11,
                relativeX: 20 / 95,
                relativeY: 11 / 47,
            }),
            expect.any(Object),
        );
    });

    it('renders resize handles for every panel when windows are editable', () => {
        render(
            <GridLayout
                layout={{ type: 'grid', panels: [{ id: 'tree-1', x: 0, y: 0, w: 24, h: 12 }] }}
                windowsEditable
                renderWindow={() => <div>Panel</div>}
            />
        );

        expect(document.querySelectorAll('[data-resize-edge]')).toHaveLength(8);
        expect(document.querySelector('[data-resize-edge="bottom-right"]')).toBeInTheDocument();
    });
});
