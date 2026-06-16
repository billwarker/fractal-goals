import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import CreateSessionTemplate from '../CreateSessionTemplate';
import { queryKeys } from '../../hooks/queryKeys';

const getSessionTemplates = vi.fn();
const getActivities = vi.fn();
const getActivityGroups = vi.fn();
const updateSessionTemplate = vi.fn();

vi.mock('../../utils/api', () => ({
    fractalApi: {
        getSessionTemplates: (...args) => getSessionTemplates(...args),
        getActivities: (...args) => getActivities(...args),
        getActivityGroups: (...args) => getActivityGroups(...args),
        updateSessionTemplate: (...args) => updateSessionTemplate(...args),
        createSessionTemplate: vi.fn(),
        deleteSessionTemplate: vi.fn(),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../components/modals/TemplateBuilderModal', () => ({
    default: () => null,
}));

vi.mock('../../components/modals/DeleteConfirmModal', () => ({
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

function renderPage(queryClient) {
    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={['/root-1/templates']}>
                <Routes>
                    <Route path="/:rootId/templates" element={<CreateSessionTemplate />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

describe('CreateSessionTemplate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        updateSessionTemplate.mockResolvedValue({ data: {} });
    });

    it('stores templates, activities, and activity groups under shared query keys', async () => {
        const queryClient = createQueryClient();

        getSessionTemplates.mockResolvedValueOnce({
            data: [
                {
                    id: 'template-1',
                    name: 'Warmup Flow',
                    description: 'Warm up',
                    template_data: { total_duration_minutes: 15, sections: [] },
                },
            ],
        });
        getActivities.mockResolvedValueOnce({
            data: [{ id: 'activity-1', name: 'Scales' }],
        });
        getActivityGroups.mockResolvedValueOnce({
            data: [{ id: 'group-1', name: 'Technique' }],
        });

        renderPage(queryClient);

        await waitFor(() => {
            expect(screen.getByText('Warmup Flow')).toBeInTheDocument();
        });

        expect(queryClient.getQueryData(queryKeys.sessionTemplates('root-1'))).toEqual([
            {
                id: 'template-1',
                name: 'Warmup Flow',
                description: 'Warm up',
                template_data: { total_duration_minutes: 15, sections: [] },
            },
        ]);
        expect(queryClient.getQueryData(queryKeys.activities('root-1'))).toEqual([
            { id: 'activity-1', name: 'Scales' },
        ]);
        expect(queryClient.getQueryData(queryKeys.activityGroups('root-1'))).toEqual([
            { id: 'group-1', name: 'Technique' },
        ]);
    });

    it('separates archived templates and reactivates them from the card action', async () => {
        const queryClient = createQueryClient();

        getSessionTemplates.mockResolvedValueOnce({
            data: [
                {
                    id: 'template-active',
                    name: 'Active Flow',
                    template_data: { total_duration_minutes: 15, sections: [] },
                    is_archived: false,
                },
                {
                    id: 'template-archived',
                    name: 'Old Flow',
                    template_data: { total_duration_minutes: 15, sections: [] },
                    is_archived: true,
                    archived_at: '2026-06-01T00:00:00Z',
                },
            ],
        });
        getActivities.mockResolvedValueOnce({ data: [] });
        getActivityGroups.mockResolvedValueOnce({ data: [] });

        renderPage(queryClient);

        await waitFor(() => {
            expect(screen.getByText('Active Flow')).toBeInTheDocument();
        });

        expect(screen.getByText('Archived templates (1)')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Archived templates (1)'));
        expect(screen.getByText('Old Flow')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));

        await waitFor(() => {
            expect(updateSessionTemplate).toHaveBeenCalledWith(
                'root-1',
                'template-archived',
                { is_archived: false }
            );
        });
    });
});
