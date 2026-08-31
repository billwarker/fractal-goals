import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ManageMetricsModal from '../ManageMetricsModal';

const {
    mockCreateMetric,
    mockUpdateMetric,
    mockUseFractalMetrics,
    mockNotifySuccess,
    mockNotifyError,
} = vi.hoisted(() => ({
    mockCreateMetric: vi.fn(),
    mockUpdateMetric: vi.fn(),
    mockUseFractalMetrics: vi.fn(),
    mockNotifySuccess: vi.fn(),
    mockNotifyError: vi.fn(),
}));

vi.mock('../../../hooks/useActivityQueries', () => ({
    useFractalMetrics: (...args) => mockUseFractalMetrics(...args),
    useCreateFractalMetric: () => ({ mutateAsync: mockCreateMetric, isPending: false }),
    useUpdateFractalMetric: () => ({ mutateAsync: mockUpdateMetric, isPending: false }),
    useDeleteFractalMetric: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../utils/notify', () => ({
    default: {
        success: mockNotifySuccess,
        error: mockNotifyError,
    },
}));

vi.mock('../DeleteConfirmModal', () => ({
    default: () => null,
}));

describe('ManageMetricsModal', () => {
    beforeEach(() => {
        mockCreateMetric.mockResolvedValue({
            data: { id: 'metric-new', name: 'Range', unit: 'inches' },
        });
        mockUpdateMetric.mockResolvedValue({
            data: { id: 'metric-1', name: 'Form Quality', unit: 'rating' },
        });
        mockUseFractalMetrics.mockReturnValue({
            fractalMetrics: [
                {
                    id: 'metric-1',
                    name: 'Form',
                    unit: 'rating',
                    is_multiplicative: false,
                    is_additive: true,
                    input_type: 'number',
                    higher_is_better: true,
                    activity_count: 2,
                },
            ],
            isLoading: false,
            error: null,
        });
    });

    it('closes after creating a metric', async () => {
        const onClose = vi.fn();

        render(<ManageMetricsModal isOpen={true} onClose={onClose} rootId="root-1" />);

        fireEvent.change(screen.getByLabelText('Name *'), {
            target: { value: 'Range' },
        });
        fireEvent.change(screen.getByLabelText('Unit *'), {
            target: { value: 'inches' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create Metric' }));

        await waitFor(() => {
            expect(mockCreateMetric).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Range',
                unit: 'inches',
            }));
        });
        expect(mockNotifySuccess).toHaveBeenCalledWith('"Range" created');
        expect(mockCreateMetric).toHaveBeenCalledWith(expect.objectContaining({ precision: 2 }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes after updating a metric', async () => {
        const onClose = vi.fn();

        render(<ManageMetricsModal isOpen={true} onClose={onClose} rootId="root-1" />);

        expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByText('Form'));

        expect(screen.getByText('Edit Metric')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Name *'), {
            target: { value: 'Form Quality' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

        await waitFor(() => {
            expect(mockUpdateMetric).toHaveBeenCalledWith(expect.objectContaining({
                metricId: 'metric-1',
                name: 'Form Quality',
                unit: 'rating',
            }));
        });
        expect(mockNotifySuccess).toHaveBeenCalledWith('"Form Quality" updated');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('places precision beside input type and allows duration precision changes', async () => {
        render(<ManageMetricsModal isOpen={true} onClose={vi.fn()} rootId="root-1" />);

        expect(screen.getByLabelText('Precision')).toHaveValue('2');
        fireEvent.change(screen.getByLabelText('Input type'), { target: { value: 'duration' } });
        fireEvent.change(screen.getByLabelText('Precision'), { target: { value: '3' } });
        fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Hold time' } });
        fireEvent.change(screen.getByLabelText('Unit *'), { target: { value: 'seconds' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create Metric' }));

        await waitFor(() => expect(mockCreateMetric).toHaveBeenCalledWith(expect.objectContaining({
            input_type: 'duration',
            precision: 3,
        })));
    });

    it('locks integer precision to zero', () => {
        render(<ManageMetricsModal isOpen={true} onClose={vi.fn()} rootId="root-1" />);
        fireEvent.change(screen.getByLabelText('Input type'), { target: { value: 'integer' } });
        expect(screen.getByLabelText('Precision')).toHaveValue('0');
        expect(screen.getByLabelText('Precision')).toBeDisabled();
    });
});
