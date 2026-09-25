import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ProgramDayModal from '../ProgramDayModal';
import { queryKeys } from '../../../hooks/queryKeys';

const getSessionTemplates = vi.fn();
const getActivities = vi.fn();
const getActivityGroups = vi.fn();
const getCircuits = vi.fn();

vi.mock('../../../utils/api', () => ({
    fractalApi: {
        getSessionTemplates: (...args) => getSessionTemplates(...args),
        getActivities: (...args) => getActivities(...args),
        getActivityGroups: (...args) => getActivityGroups(...args),
        getCircuits: (...args) => getCircuits(...args),
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
        getCircuits.mockResolvedValue({ data: [] });
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

    describe('scheduling', () => {
        const block = { id: 'block-1', start_date: '2026-09-01', end_date: '2026-09-30' };

        function renderModal(initialData, onSave = vi.fn()) {
            getSessionTemplates.mockResolvedValue({ data: [] });
            getActivities.mockResolvedValue({ data: [] });
            getActivityGroups.mockResolvedValue({ data: [] });
            render(
                <QueryClientProvider client={createQueryClient()}>
                    <ProgramDayModal
                        isOpen={true}
                        onClose={vi.fn()}
                        onSave={onSave}
                        rootId="root-1"
                        block={block}
                        initialData={initialData}
                    />
                </QueryClientProvider>
            );
            return onSave;
        }

        const addDate = (value) => {
            fireEvent.change(screen.getByLabelText('Date to add'), { target: { value } });
            fireEvent.click(screen.getByRole('button', { name: 'Add date' }));
        };

        it('opens a calendar-created day on its date and saves several specific dates', () => {
            const onSave = renderModal({ name: '', scheduled_dates: ['2026-09-26'], day_of_week: [], templates: [] });

            expect(screen.getByRole('radio', { name: 'Specific dates' })).toHaveAttribute('aria-checked', 'true');
            expect(screen.getByLabelText('Date to add')).toHaveAttribute('min', '2026-09-01');
            expect(screen.getByLabelText('Date to add')).toHaveAttribute('max', '2026-09-30');
            fireEvent.change(screen.getByLabelText('Day Name *'), { target: { value: 'Strength' } });
            addDate('2026-09-10');
            addDate('2026-09-26');
            expect(screen.getByText('2 dates · Sep 10 – Sep 26')).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Add Day' }));

            const payload = onSave.mock.calls[0][0];
            expect(payload).toMatchObject({
                name: 'Strength',
                day_of_week: [],
                scheduled_dates: ['2026-09-10', '2026-09-26'],
            });
            expect(payload).not.toHaveProperty('date');
        });

        it('rejects dates outside the block and blocks saving with no dates', () => {
            renderModal({ id: 'day-1', name: 'Strength', scheduled_dates: ['2026-09-26'], day_of_week: [], templates: [] });

            fireEvent.change(screen.getByLabelText('Date to add'), { target: { value: '2026-10-02' } });
            expect(screen.getByRole('button', { name: 'Add date' })).toBeDisabled();

            fireEvent.click(screen.getByRole('button', { name: /Remove Sat, Sep 26, 2026/ }));
            expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
            expect(screen.getByText('Add at least one date to save a specific-dates day.')).toBeInTheDocument();
        });

        it('converts a legacy fixed-date day into an editable specific date', () => {
            const onSave = renderModal({ id: 'day-1', name: 'Legacy', date: '2026-09-26', day_of_week: [], templates: [] });

            expect(screen.getByRole('radio', { name: 'Specific dates' })).toHaveAttribute('aria-checked', 'true');
            fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

            const payload = onSave.mock.calls[0][0];
            expect(payload.scheduled_dates).toEqual(['2026-09-26']);
            expect(payload).not.toHaveProperty('date');
        });

        it('keeps sidebar-planned dates on a weekly day and switches to weekly scheduling', () => {
            const onSave = renderModal({
                id: 'day-1', name: 'Legs', day_of_week: ['Monday'], scheduled_dates: ['2026-09-12'], templates: [],
            });

            expect(screen.getByRole('radio', { name: 'Weekly' })).toHaveAttribute('aria-checked', 'true');
            expect(screen.getByRole('list', { name: 'Also planned on' })).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Friday' }));
            expect(screen.getByRole('button', { name: 'Friday' })).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByText('Every Monday and Friday in the block.')).toBeInTheDocument();

            fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

            expect(onSave.mock.calls[0][0]).toMatchObject({
                day_of_week: ['Monday', 'Friday'],
                scheduled_dates: ['2026-09-12'],
            });
        });

        it('drops weekdays when saved as a specific-dates day', () => {
            const onSave = renderModal({
                id: 'day-1', name: 'Legs', day_of_week: ['Monday'], scheduled_dates: [], templates: [],
            });

            fireEvent.click(screen.getByRole('radio', { name: 'Specific dates' }));
            addDate('2026-09-15');
            fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

            expect(onSave.mock.calls[0][0]).toMatchObject({ day_of_week: [], scheduled_dates: ['2026-09-15'] });
        });
    });
});
