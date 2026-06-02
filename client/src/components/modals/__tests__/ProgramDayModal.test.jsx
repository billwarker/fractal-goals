import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ProgramDayModal from '../ProgramDayModal';
import { queryKeys } from '../../../hooks/queryKeys';

const getSessionTemplates = vi.fn();
const getActivities = vi.fn();
const getActivityGroups = vi.fn();

vi.mock('../../../utils/api', () => ({
    fractalApi: {
        getSessionTemplates: (...args) => getSessionTemplates(...args),
        getActivities: (...args) => getActivities(...args),
        getActivityGroups: (...args) => getActivityGroups(...args),
        updateSessionTemplate: vi.fn(),
        createSessionTemplate: vi.fn(),
    },
}));

vi.mock('../TemplateBuilderModal', () => ({
    default: () => null,
}));

vi.mock('../DeleteConfirmModal', () => ({
    default: () => null,
}));

function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
}

describe('ProgramDayModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('reads template/activity datasets from shared query keys', async () => {
        const queryClient = createQueryClient();
        getSessionTemplates.mockResolvedValueOnce({ data: [{ id: 'template-1', name: 'Warmup' }] });
        getActivities.mockResolvedValueOnce({ data: [{ id: 'activity-1', name: 'Scales' }] });
        getActivityGroups.mockResolvedValueOnce({ data: [{ id: 'group-1', name: 'Technique' }] });

        render(
            <QueryClientProvider client={queryClient}>
                <ProgramDayModal
                    isOpen={true}
                    onClose={vi.fn()}
                    onSave={vi.fn()}
                    rootId="root-1"
                />
            </QueryClientProvider>
        );

        await waitFor(() => {
            expect(screen.getByText('+ Add Session Template')).toBeInTheDocument();
        });

        expect(queryClient.getQueryData(queryKeys.sessionTemplates('root-1'))).toEqual([
            { id: 'template-1', name: 'Warmup' },
        ]);
        expect(queryClient.getQueryData(queryKeys.activities('root-1'))).toEqual([
            { id: 'activity-1', name: 'Scales' },
        ]);
        expect(queryClient.getQueryData(queryKeys.activityGroups('root-1'))).toEqual([
            { id: 'group-1', name: 'Technique' },
        ]);
    });

    it('saves per-template required flags and minimum completion threshold', async () => {
        const queryClient = createQueryClient();
        const onSave = vi.fn();
        getSessionTemplates.mockResolvedValueOnce({
            data: [
                { id: 'template-1', name: 'Warmup' },
                { id: 'template-2', name: 'Repertoire' },
            ],
        });
        getActivities.mockResolvedValueOnce({ data: [] });
        getActivityGroups.mockResolvedValueOnce({ data: [] });

        render(
            <QueryClientProvider client={queryClient}>
                <ProgramDayModal
                    isOpen={true}
                    onClose={vi.fn()}
                    onSave={onSave}
                    rootId="root-1"
                    initialData={{
                        id: 'day-1',
                        name: 'Daily Practice',
                        templates: [
                            { id: 'template-1', name: 'Warmup', is_required: true, order: 0 },
                            { id: 'template-2', name: 'Repertoire', is_required: false, order: 1 },
                        ],
                    }}
                />
            </QueryClientProvider>
        );

        await waitFor(() => {
            expect(screen.getAllByText('Warmup').length).toBeGreaterThan(0);
        });

        fireEvent.click(screen.getByLabelText('At least'));
        fireEvent.change(screen.getByLabelText('Minimum completed sessions'), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            template_configs: [
                { template_id: 'template-1', is_required: true, order: 0 },
                { template_id: 'template-2', is_required: false, order: 1 },
            ],
            completion_min_templates: 2,
        }));
    });
});
