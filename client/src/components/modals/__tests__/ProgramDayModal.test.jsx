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

    it('includes note_condition in the save payload', async () => {
        const queryClient = createQueryClient();
        const onSave = vi.fn();
        getSessionTemplates.mockResolvedValueOnce({ data: [] });
        getActivities.mockResolvedValueOnce({ data: [] });
        getActivityGroups.mockResolvedValueOnce({ data: [] });

        render(
            <QueryClientProvider client={queryClient}>
                <ProgramDayModal
                    isOpen={true}
                    onClose={vi.fn()}
                    onSave={onSave}
                    rootId="root-1"
                />
            </QueryClientProvider>
        );

        await waitFor(() => {
            expect(screen.getByText('+ Add Session Template')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByLabelText('Require a note for this day'));
        fireEvent.click(screen.getByRole('button', { name: 'Add Day' }));

        expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            note_condition: true,
        }));
    });
});
