import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({ getGoalIcon: () => 'star', getGoalColor: () => '#2255DD', getGoalSecondaryColor: () => '#112244' }),
}));

import GoalMarkerLayer from '../GoalMarkerLayer';

// A chart whose scales map value v to pixel 10·v, in a plot area 20–520 wide and 10–310 tall.
const scale = (axis) => ({ axis, getPixelForValue: (value) => value * 10 });
const chart = {
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    chartArea: { left: 20, right: 520, top: 10, bottom: 310 },
    scales: { x: scale('x'), y: scale('y') },
};
const goal = { goal_id: 'g1', goal_name: 'Clean lever', completed: false, level_name: 'Short Term Goal' };
const markers = [{ key: 'g1', goal, rules: [
    { scaleID: 'x', value: 5, symbol: '≥', metricId: 'hold' },
    { scaleID: 'y', value: 9, symbol: '≥', metricId: 'form' },
] }];

describe('GoalMarkerLayer', () => {
    beforeEach(() => vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { if (typeof callback === 'function') callback(0); return 1; }));
    afterEach(() => vi.restoreAllMocks());

    it('marks the goal where its thresholds meet, shows guides on hover and opens it on click', async () => {
        const onOpenGoal = vi.fn();
        await act(async () => {
            render(<GoalMarkerLayer chartRef={{ current: chart }} markers={markers} onOpenGoal={onOpenGoal} />);
        });
        const marker = screen.getByRole('button', { name: 'Open goal Clean lever (≥ 5, ≥ 9)' });
        expect(marker).toHaveStyle({ left: '50px', top: '90px' });
        expect(screen.queryByText('≥ 5')).not.toBeInTheDocument();
        // Just the icon until hovered; then the name and the guides.
        expect(screen.queryByText('Clean lever')).not.toBeInTheDocument();

        fireEvent.mouseEnter(marker);
        expect(screen.getByText('Clean lever')).toBeInTheDocument();
        expect(screen.getByText('≥ 5')).toBeInTheDocument();
        expect(screen.getByText('≥ 9')).toBeInTheDocument();
        fireEvent.mouseLeave(marker);
        expect(screen.queryByText('≥ 5')).not.toBeInTheDocument();
        expect(screen.queryByText('Clean lever')).not.toBeInTheDocument();

        fireEvent.click(marker);
        expect(onOpenGoal).toHaveBeenCalledWith('g1');
    });

    it('puts a goal with one threshold at the end of its line, and shows it without a click target', async () => {
        await act(async () => {
            render(<GoalMarkerLayer chartRef={{ current: chart }} markers={[{ ...markers[0], rules: [markers[0].rules[1]] }]} />);
        });
        const marker = screen.getByTitle('Clean lever (≥ 9)');
        expect(marker.tagName).toBe('SPAN');
        expect(marker).toHaveStyle({ left: '520px', top: '90px' });
    });
});
