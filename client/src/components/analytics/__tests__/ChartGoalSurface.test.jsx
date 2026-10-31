import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import ChartGoalSurface from '../ChartGoalSurface';

const { readTarget } = vi.hoisted(() => ({ readTarget: vi.fn() }));
vi.mock('../chartGoalTargets', () => ({
    GOAL_CHART_IDS: new Set(['metricTrends']),
    readChartGoalTarget: readTarget,
}));
vi.mock('../../../hooks/useGoalQueries', () => ({ useFractalTree: () => ({ data: { id: 'root', name: 'Root' } }) }));
vi.mock('../../ConnectedGoalDetailModal', () => ({
    default: ({ initialCompletion }) => <div role="dialog" aria-label="New goal">{initialCompletion.conditionDraft.kind}</div>,
}));
vi.mock('@tanstack/react-query', () => ({
    useQuery: () => ({ data: [] }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

const Chart = ({ context }) => <div data-testid="chart" data-lines={context.goalConditionLines.length} />;
const context = (id = 'metricTrends') => ({ visualization: { id }, chartRef: { current: {} }, effectiveSelectedActivity: { id: 'a' } });
const target = { summary: 'Weight ≥ 225 lb within one session', conditionDraft: { kind: 'single_session' } };

describe('ChartGoalSurface', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        readTarget.mockReturnValue(target);
    });

    it('offers "Set goal here…" on right-click and opens the prefilled goal modal', async () => {
        render(<ChartGoalSurface Chart={Chart} context={context()} rootId="r" />);

        fireEvent.contextMenu(screen.getByTestId('chart'), { clientX: 40, clientY: 50 });
        const item = screen.getByRole('menuitem', { name: /Set goal here/ });
        expect(item).toHaveTextContent('Weight ≥ 225 lb within one session');
        fireEvent.click(item);

        expect(await screen.findByRole('dialog', { name: 'New goal' })).toHaveTextContent('single_session');
    });

    it('opens on a touch long-press but not on a short tap or a drag', () => {
        vi.useFakeTimers();
        try {
            render(<ChartGoalSurface Chart={Chart} context={context()} rootId="r" />);
            const chart = screen.getByTestId('chart');

            fireEvent.pointerDown(chart, { pointerType: 'touch', clientX: 10, clientY: 10 });
            fireEvent.pointerMove(chart, { pointerType: 'touch', clientX: 40, clientY: 10 });
            act(() => vi.advanceTimersByTime(600));
            expect(screen.queryByRole('menuitem')).toBeNull();

            fireEvent.pointerDown(chart, { pointerType: 'touch', clientX: 10, clientY: 10 });
            fireEvent.pointerUp(chart, { pointerType: 'touch' });
            act(() => vi.advanceTimersByTime(600));
            expect(screen.queryByRole('menuitem')).toBeNull();

            fireEvent.pointerDown(chart, { pointerType: 'touch', clientX: 10, clientY: 10 });
            act(() => vi.advanceTimersByTime(600));
            expect(screen.getByRole('menuitem', { name: /Set goal here/ })).toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it('explains unsupported points and leaves other charts alone', () => {
        readTarget.mockReturnValue({ unsupported: 'Time totals can’t become a goal condition yet' });
        const { rerender } = render(<ChartGoalSurface Chart={Chart} context={context()} rootId="r" />);
        fireEvent.contextMenu(screen.getByTestId('chart'));
        expect(screen.getByRole('menuitem', { name: /Time totals/ })).toBeDisabled();

        readTarget.mockClear();
        rerender(<ChartGoalSurface Chart={Chart} context={context('groupMix')} rootId="r" />);
        fireEvent.contextMenu(screen.getByTestId('chart'));
        expect(readTarget).not.toHaveBeenCalled();
    });
});
