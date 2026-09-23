import React, { useRef } from 'react';
import { fireEvent, render } from '@testing-library/react';

import useCalendarDragSelection from '../useCalendarDragSelection';

const DATES = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];

function Harness({ enabled = true, onToggleDate, onSelectRange, onPreview }) {
    const containerRef = useRef(null);
    const { previewDates, handlers } = useCalendarDragSelection({
        enabled, containerRef, selectableDates: DATES, onToggleDate, onSelectRange,
    });
    onPreview?.([...previewDates]);
    return (
        <div ref={containerRef} data-testid="surface" {...handlers}>
            {DATES.map((date, index) => (
                <div
                    key={date}
                    data-program-selectable-date={date}
                    ref={(element) => {
                        if (element) {
                            element.getBoundingClientRect = () => ({
                                left: index * 100, right: index * 100 + 99, top: 0, bottom: 99,
                            });
                        }
                    }}
                >
                    <span data-testid={`event-${date}`}>ribbon</span>
                </div>
            ))}
            <button type="button">Not a cell</button>
        </div>
    );
}

const point = (index) => ({ button: 0, pointerId: 7, clientX: index * 100 + 50, clientY: 50 });

describe('useCalendarDragSelection', () => {
    it('toggles one date on a press without movement, even over an event ribbon', () => {
        const onToggleDate = vi.fn();
        const onSelectRange = vi.fn();
        const { getByTestId } = render(<Harness onToggleDate={onToggleDate} onSelectRange={onSelectRange} />);

        fireEvent.pointerDown(getByTestId('event-2026-09-02'), point(1));
        fireEvent.pointerUp(getByTestId('surface'), point(1));

        expect(onToggleDate).toHaveBeenCalledWith('2026-09-02', expect.anything());
        expect(onSelectRange).not.toHaveBeenCalled();
    });

    it('drags across cells in either direction with a live preview', () => {
        const onSelectRange = vi.fn();
        const previews = [];
        const { getByTestId } = render(
            <Harness onSelectRange={onSelectRange} onPreview={(dates) => previews.push(dates)} />,
        );
        const surface = getByTestId('surface');

        fireEvent.pointerDown(surface, point(3));
        fireEvent.pointerMove(surface, point(2));
        fireEvent.pointerMove(surface, point(1));
        expect(previews.at(-1)).toEqual(['2026-09-02', '2026-09-03', '2026-09-04']);
        fireEvent.pointerUp(surface, point(1));

        expect(onSelectRange).toHaveBeenCalledWith(['2026-09-02', '2026-09-03', '2026-09-04'], expect.anything());
        expect(previews.at(-1)).toEqual([]);
    });

    it('ignores buttons, other pointers, cancelled gestures, and a disabled mode', () => {
        const onToggleDate = vi.fn();
        const onSelectRange = vi.fn();
        const { getByTestId, getByRole, rerender } = render(
            <Harness onToggleDate={onToggleDate} onSelectRange={onSelectRange} />,
        );
        const surface = getByTestId('surface');

        fireEvent.pointerDown(getByRole('button', { name: 'Not a cell' }), point(0));
        fireEvent.pointerUp(surface, point(0));
        fireEvent.pointerDown(surface, point(0));
        fireEvent.pointerUp(surface, { ...point(0), pointerId: 99 });
        fireEvent.pointerCancel(surface, point(0));
        fireEvent.pointerUp(surface, point(0));
        fireEvent.pointerDown(surface, { ...point(0), button: 2 });
        fireEvent.pointerUp(surface, point(0));
        rerender(<Harness enabled={false} onToggleDate={onToggleDate} onSelectRange={onSelectRange} />);
        fireEvent.pointerDown(surface, point(0));
        fireEvent.pointerUp(surface, point(0));

        expect(onToggleDate).not.toHaveBeenCalled();
        expect(onSelectRange).not.toHaveBeenCalled();
    });
});
