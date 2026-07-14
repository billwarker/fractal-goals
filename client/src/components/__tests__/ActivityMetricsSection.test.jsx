import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ActivityMetricsSection from '../activityBuilder/ActivityMetricsSection';

const mockCreateFractalMetric = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useActivityQueries', () => ({
    useFractalMetrics: () => ({ fractalMetrics: [], isLoading: false, error: null }),
    useCreateFractalMetric: () => ({
        mutateAsync: mockCreateFractalMetric,
        isPending: false,
    }),
}));

const metrics = [
    { fractal_metric_id: '', name: '', unit: '', track_progress: true },
    { fractal_metric_id: '', name: '', unit: '', track_progress: true },
];

function renderSection(overrides = {}) {
    const props = {
        rootId: 'root-1',
        metrics,
        hasSets: false,
        onAddMetric: vi.fn(),
        onRemoveMetric: vi.fn(),
        onMetricChange: vi.fn(),
        ...overrides,
    };
    render(<ActivityMetricsSection {...props} />);
    return props;
}

describe('ActivityMetricsSection inline creator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCreateFractalMetric.mockResolvedValue({
            data: {
                id: 'metric-created',
                name: 'Errors',
                unit: 'count',
                is_multiplicative: false,
            },
        });
    });

    it('renders beneath the metric dropdown that opened it', () => {
        renderSection();
        const firstMetricCard = screen.getByLabelText('Metric 1').parentElement.parentElement;
        const secondMetricSelect = screen.getByLabelText('Metric 2');
        const secondMetricCard = secondMetricSelect.parentElement.parentElement;

        fireEvent.change(secondMetricSelect, { target: { value: '__create__' } });

        const creatorName = screen.getByLabelText('Metric name');
        expect(secondMetricCard).toContainElement(creatorName);
        expect(firstMetricCard).not.toContainElement(creatorName);
        expect(screen.getByRole('button', { name: '+ Add Metric' })).toBeInTheDocument();
    });

    it('cancels without changing any metric slot', () => {
        const { onMetricChange } = renderSection();
        fireEvent.change(screen.getByLabelText('Metric 2'), { target: { value: '__create__' } });
        fireEvent.change(screen.getByLabelText('Metric name'), { target: { value: 'Unsaved' } });

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByLabelText('Metric name')).not.toBeInTheDocument();
        expect(onMetricChange).not.toHaveBeenCalled();
        expect(mockCreateFractalMetric).not.toHaveBeenCalled();
    });

    it('populates the exact metric slot that launched creation', async () => {
        const { onMetricChange } = renderSection();
        fireEvent.change(screen.getByLabelText('Metric 2'), { target: { value: '__create__' } });
        fireEvent.change(screen.getByLabelText('Metric name'), { target: { value: 'Errors' } });
        fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'count' } });
        fireEvent.click(screen.getByLabelText('Multiplicative'));
        fireEvent.click(screen.getByRole('button', { name: 'Create Metric' }));

        await waitFor(() => {
            expect(onMetricChange).toHaveBeenCalledWith(1, 'fractal_metric_id', 'metric-created');
        });
        expect(onMetricChange).toHaveBeenCalledWith(1, 'name', 'Errors');
        expect(onMetricChange).toHaveBeenCalledWith(1, 'unit', 'count');
        expect(onMetricChange).toHaveBeenCalledWith(1, 'is_multiplicative', false);
        expect(onMetricChange).not.toHaveBeenCalledWith(0, expect.anything(), expect.anything());
    });

    it.each([
        ['Integer', 'integer'],
        ['Decimal', 'number'],
        ['Duration', 'duration'],
    ])('submits the %s data type using the canonical API value', async (_label, inputType) => {
        renderSection();
        fireEvent.change(screen.getByLabelText('Metric 1'), { target: { value: '__create__' } });
        fireEvent.change(screen.getByLabelText('Metric name'), { target: { value: 'Tempo' } });
        fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'value' } });
        fireEvent.change(screen.getByLabelText('Data type'), { target: { value: inputType } });
        fireEvent.click(screen.getByRole('button', { name: 'Create Metric' }));

        await waitFor(() => {
            expect(mockCreateFractalMetric).toHaveBeenCalledWith(expect.objectContaining({
                input_type: inputType,
            }));
        });
    });
});
