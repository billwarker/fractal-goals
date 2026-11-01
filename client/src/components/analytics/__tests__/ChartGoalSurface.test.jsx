import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import ChartGoalSurface from '../ChartGoalSurface';

const { readTarget, queryData, setGoalCondition } = vi.hoisted(() => ({
    readTarget: vi.fn(), queryData: { lines: [] }, setGoalCondition: vi.fn(() => Promise.resolve({ data: {} })),
}));
vi.mock('../chartGoalTargets', () => ({
    GOAL_CHART_IDS: new Set(['metricTrends']),
    readChartGoalTarget: readTarget,
}));
vi.mock('../../../hooks/useGoalQueries', () => ({ useFractalTree: () => ({ data: { id: 'root', name: 'Root' } }) }));
vi.mock('../../ConnectedGoalDetailModal', () => ({
    default: ({ initialCompletion }) => (
        <div role="dialog" aria-label="New goal">{initialCompletion.conditionDraft.kind} {initialCompletion.deadline}</div>
    ),
}));
vi.mock('@tanstack/react-query', () => ({
    useQuery: () => ({ data: queryData.lines }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('../../../utils/api', () => ({ fractalApi: { setGoalCondition, createGoal: vi.fn() } }));
vi.mock('../../../utils/goalTreeCache', () => ({ applyCreatedGoal: vi.fn(), refreshGoalReadModels: vi.fn() }));
vi.mock('../../../hooks/useGoalConditionQueries', () => ({
    useGoalConditionPreview: (_root, goalId) => ({ progress: goalId ? { current: 3, required: 12, completion_condition: 'activity_threshold' } : null, isPending: false }),
}));
vi.mock('../../../utils/goalConditionText', () => ({ describeProgress: (progress) => `${progress.current} / ${progress.required}` }));

const Chart = ({ context }) => <div data-testid="chart" data-lines={context.goalConditionLines.length} />;
const context = (id = 'metricTrends') => ({ visualization: { id }, chartRef: { current: {} }, effectiveSelectedActivity: { id: 'a' } });
const target = { summary: 'Weight ≥ 225 lb within one session', conditionDraft: { kind: 'single_session' } };
const chartWithCanvas = () => ({
    current: { canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) }, chartArea: { left: 0, right: 400, top: 0, bottom: 200 } },
});

describe('ChartGoalSurface', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queryData.lines = [];
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

    it('shows a crosshair readout in annotate mode, pins a click, and creates a seeded goal', async () => {
        readTarget.mockReturnValue({
            summary: '15 more Bench sessions by Sun, Nov 15', conditionDraft: { kind: 'consistency' }, deadline: '2026-11-15',
            notes: ['The template filter isn’t part of the goal condition.'],
            guides: { x: { pixel: 300, label: 'Nov 9' }, y: { pixel: 75, label: '25' } },
        });
        const ctx = { ...context(), chartRef: chartWithCanvas() };
        render(<ChartGoalSurface Chart={Chart} context={ctx} rootId="r" annotating onAnnotatingChange={vi.fn()} />);
        const surface = screen.getByTestId('chart').parentElement;

        fireEvent.pointerMove(surface, { clientX: 300, clientY: 75 });
        expect(screen.getByText('Nov 9')).toBeInTheDocument();
        expect(screen.getByText('25')).toBeInTheDocument();
        expect(screen.getByText('Click to set a goal here')).toBeInTheDocument();

        fireEvent.click(surface);
        const popover = screen.getByRole('dialog', { name: 'Set a goal from this point' });
        expect(popover).toHaveTextContent('15 more Bench sessions');
        expect(popover).toHaveTextContent('The template filter isn’t part of the goal condition.');
        fireEvent.click(screen.getByRole('button', { name: 'Create goal…' }));
        expect(await screen.findByRole('dialog', { name: 'New goal' })).toHaveTextContent('consistency 2026-11-15');
    });

    it('updates a goal already on this activity after previewing its progress', async () => {
        queryData.lines = [{ goal_id: 'g1', goal_name: 'Bench 225' }];
        readTarget.mockReturnValue({
            summary: 'Weight ≥ 230 lb within one session', guides: { y: { pixel: 50, label: '230 lb' } },
            conditionDraft: {
                activity_definition_id: 'a', kind: 'single_session', measure: 'sets', min_sets: '1', tag_ids: [],
                rules: [{ metric_definition_id: 'weight', operator: '>=', value: '230' }],
            },
        });
        const onAnnotatingChange = vi.fn();
        render(<ChartGoalSurface Chart={Chart} context={{ ...context(), chartRef: chartWithCanvas() }} rootId="r" annotating onAnnotatingChange={onAnnotatingChange} />);
        const surface = screen.getByTestId('chart').parentElement;
        fireEvent.pointerMove(surface, { clientX: 100, clientY: 50 });
        fireEvent.click(surface);

        fireEvent.change(screen.getByRole('combobox', { name: /update a goal/ }), { target: { value: 'g1' } });
        expect(screen.getByRole('status')).toHaveTextContent('With this threshold: 3 / 12');
        fireEvent.click(screen.getByRole('button', { name: 'Update goal' }));
        await act(async () => {});
        expect(setGoalCondition).toHaveBeenCalledWith('r', 'g1', expect.objectContaining({
            completion_condition: 'activity_threshold',
            condition: expect.objectContaining({ rules: [{ metric_definition_id: 'weight', operator: '>=', value: 230 }] }),
        }));
        expect(onAnnotatingChange).toHaveBeenCalledWith(false);
    });

    it('toggles annotate mode with A while focused', () => {
        const onAnnotatingChange = vi.fn();
        render(<ChartGoalSurface Chart={Chart} context={context()} rootId="r" onAnnotatingChange={onAnnotatingChange} />);
        const surface = screen.getByTestId('chart').parentElement;
        fireEvent.keyDown(surface, { key: 'a' });
        expect(onAnnotatingChange).toHaveBeenCalledWith(true);
    });
});

