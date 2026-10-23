import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ExpandableChartFrame from '../ExpandableChartFrame';

describe('ExpandableChartFrame', () => {
    it('expands on click, Enter or Space, but not from controls inside the chart', () => {
        const onExpand = vi.fn();
        render(
            <ExpandableChartFrame onExpand={onExpand} label="Expand chart: Reps">
                <button type="button">Retry</button>
            </ExpandableChartFrame>,
        );
        const frame = screen.getByRole('button', { name: 'Expand chart: Reps' });
        expect(frame.querySelector('svg')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onExpand).not.toHaveBeenCalled();
        fireEvent.click(frame);
        fireEvent.keyDown(frame, { key: 'Enter' });
        fireEvent.keyDown(frame, { key: ' ' });
        expect(onExpand).toHaveBeenCalledTimes(3);
    });

    it('is a plain frame without onExpand, and holds the way back while expanded', () => {
        const onCollapse = vi.fn();
        const { rerender } = render(<ExpandableChartFrame data-testid="frame">chart</ExpandableChartFrame>);
        expect(screen.getByTestId('frame')).not.toHaveAttribute('role');
        rerender(<ExpandableChartFrame isExpanded expandedNote="Showing in place of the goal tree." onCollapse={onCollapse}>chart</ExpandableChartFrame>);
        expect(screen.queryByText('chart')).not.toBeInTheDocument();
        expect(screen.getByText('Showing in place of the goal tree.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
        expect(onCollapse).toHaveBeenCalled();
    });
});
