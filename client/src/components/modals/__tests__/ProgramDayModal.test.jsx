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

    it.each([false, true])('uses the draft name as the accessible heading (editing: %s)', async (editing) => {
        const queryClient = createQueryClient();
        queryClient.setQueryData(queryKeys.sessionTemplates('root-1'), []);
        queryClient.setQueryData(queryKeys.activities('root-1'), []);
        queryClient.setQueryData(queryKeys.activityGroups('root-1'), []);
        render(
            <QueryClientProvider client={queryClient}>
                <ProgramDayModal isOpen onClose={vi.fn()} onSave={vi.fn()} rootId="root-1"
                    initialData={editing ? { id: 'day-1', name: 'Leg Day' } : undefined} />
            </QueryClientProvider>
        );
        const fallback = editing ? 'Edit Program Day' : 'New Program Day';
        expect(screen.getByRole('dialog', { name: editing ? 'Leg Day' : fallback })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Day Name *'), { target: { value: 'Upper Body' } });
        expect(screen.getByRole('heading', { name: 'Upper Body' })).toBeInTheDocument();
        expect(screen.getByRole('dialog', { name: 'Upper Body' })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Day Name *'), { target: { value: '   ' } });
        expect(screen.getByRole('dialog', { name: fallback })).toBeInTheDocument();
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
        // Program days belong to the program: dates and weekdays span the whole program.
        const program = {
            id: 'program-1', start_date: '2026-09-01', end_date: '2026-09-30',
            blocks: [{ id: 'block-1', start_date: '2026-09-01', end_date: '2026-09-14' }],
            days: [],
        };

        function renderModal(initialData, onSave = vi.fn(), modalProgram = program, extraProps = {}) {
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
                        program={modalProgram}
                        initialData={initialData}
                        {...extraProps}
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

            fireEvent.click(screen.getByRole('button', { name: 'Create Day' }));

            const payload = onSave.mock.calls[0][0];
            expect(payload).toMatchObject({
                name: 'Strength',
                day_of_week: [],
                scheduled_dates: ['2026-09-10', '2026-09-26'],
            });
            expect(payload).not.toHaveProperty('date');
        });

        it('rejects dates outside the program and blocks saving with no dates', () => {
            renderModal({ id: 'day-1', name: 'Strength', scheduled_dates: ['2026-09-26'], day_of_week: [], templates: [] });

            fireEvent.change(screen.getByLabelText('Date to add'), { target: { value: '2026-10-02' } });
            expect(screen.getByRole('button', { name: 'Add date' })).toBeDisabled();

            fireEvent.click(screen.getByRole('button', { name: /Remove Sat, Sep 26, 2026/ }));
            expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
            expect(screen.getByText('Add at least one date to save a specific-dates day.')).toBeInTheDocument();
        });

        it('accepts dates anywhere in the program, beyond any one block', () => {
            const onSave = renderModal({ id: 'day-1', name: 'Late', scheduled_dates: ['2026-09-03'], day_of_week: [], templates: [] });

            addDate('2026-09-28');
            fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

            expect(onSave.mock.calls[0][0].scheduled_dates).toEqual(['2026-09-03', '2026-09-28']);
        });

        it('duplicates an existing day and closes', async () => {
            const onDuplicate = vi.fn().mockResolvedValue({ id: 'day-2' });
            const onClose = vi.fn();
            renderModal({ id: 'day-1', name: 'Legs', day_of_week: ['Monday'], templates: [] }, vi.fn(), program, { onDuplicate, onClose });

            expect(screen.queryByText('Copy to Other Blocks')).not.toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Duplicate day' }));

            await waitFor(() => expect(onClose).toHaveBeenCalled());
            expect(onDuplicate).toHaveBeenCalledWith('day-1');
        });

        it('keeps sidebar-planned dates on a weekly day and switches to weekly scheduling', () => {
            const onSave = renderModal({
                id: 'day-1', name: 'Legs', day_of_week: ['Monday'], scheduled_dates: ['2026-09-12'], templates: [],
            });

            expect(screen.getByRole('radio', { name: 'Weekly' })).toHaveAttribute('aria-checked', 'true');
            expect(screen.getByRole('list', { name: 'Also planned on' })).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Friday' }));
            expect(screen.getByRole('button', { name: 'Friday' })).toHaveAttribute('aria-pressed', 'true');
            expect(screen.getByText('Every Monday and Friday in the program.')).toBeInTheDocument();

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

        describe('one program day per date', () => {
            it('defaults to weekly, saves an interval, and treats an empty interval as one', () => {
                const onSave = renderModal({ name: 'Strength', day_of_week: ['Tuesday'] });
                const interval = screen.getByLabelText('Repeat every (weeks)');
                expect(interval).toHaveValue(1);
                fireEvent.change(interval, { target: { value: '3' } });
                fireEvent.click(screen.getByRole('button', { name: 'Create Day' }));
                expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ repeat_every_weeks: 3 }));
                fireEvent.change(interval, { target: { value: '' } });
                fireEvent.click(screen.getByRole('button', { name: 'Create Day' }));
                expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ repeat_every_weeks: 1 }));
            });

            it('loads saved cadence and rejects zero or fractional intervals', () => {
                renderModal({ id: 'day-1', name: 'Strength', day_of_week: ['Tuesday'], repeat_every_weeks: 2 });
                const interval = screen.getByLabelText('Repeat every (weeks)');
                expect(interval).toHaveValue(2);
                for (const value of ['0', '1.5']) {
                    fireEvent.change(interval, { target: { value } });
                    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
                }
                fireEvent.click(screen.getByRole('radio', { name: 'Specific dates' }));
                expect(screen.queryByLabelText('Repeat every (weeks)')).not.toBeInTheDocument();
            });

            it('enables a weekday when its occupied dates fall outside the chosen cadence', () => {
                const otherProgram = { ...program, days: [{ id: 'other', name: 'Test', scheduled_dates: ['2026-09-08'] }] };
                renderModal({ name: 'Strength', day_of_week: [] }, vi.fn(), otherProgram);
                expect(screen.getByRole('button', { name: 'Tuesday, taken by Test' })).toHaveAttribute('aria-disabled', 'true');
                fireEvent.change(screen.getByLabelText('Repeat every (weeks)'), { target: { value: '2' } });
                fireEvent.click(screen.getByRole('button', { name: 'Tuesday' }));
                expect(screen.getByRole('button', { name: 'Create Day' })).toBeEnabled();
            });

            const busyProgram = {
                ...program,
                days: [
                    { id: 'legs', name: 'Leg Day', day_of_week: ['Monday'], scheduled_dates: [] },
                    { id: 'test', name: 'Test Day', day_of_week: [], scheduled_dates: ['2026-09-17'] },
                ],
            };

            it('marks weekdays another day already holds as taken', () => {
                renderModal({ name: 'Upper', day_of_week: [], scheduled_dates: [], templates: [] }, vi.fn(), busyProgram);

                const monday = screen.getByRole('button', { name: 'Monday, taken by Leg Day' });
                expect(monday).toHaveAttribute('aria-disabled', 'true');
                expect(screen.getByRole('button', { name: 'Thursday, taken by Test Day' })).toHaveAttribute('aria-disabled', 'true');
                fireEvent.click(monday);
                expect(monday).toHaveAttribute('aria-pressed', 'false');
                fireEvent.focus(monday);
                expect(screen.getByRole('tooltip')).toHaveTextContent('Taken by Leg Day');
                expect(screen.queryByText(/already have their days/)).not.toBeInTheDocument();
                expect(screen.getByRole('button', { name: 'Friday' })).toBeEnabled();
            });

            it('ignores the day being edited when finding taken dates', () => {
                renderModal({ id: 'legs', name: 'Leg Day', day_of_week: ['Monday'], scheduled_dates: [], templates: [] }, vi.fn(), busyProgram);

                expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true');
                expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
            });

            it('refuses a specific date that another day already holds, even outside every block', () => {
                renderModal({ name: 'Upper', day_of_week: [], scheduled_dates: ['2026-09-15'], templates: [] }, vi.fn(), busyProgram);

                // Sep 28 is after the only block, but Leg Day's Mondays repeat across the program.
                fireEvent.change(screen.getByLabelText('Date to add'), { target: { value: '2026-09-28' } });

                expect(screen.getByRole('button', { name: 'Add date' })).toBeDisabled();
                expect(screen.getByText('Mon, Sep 28, 2026 already has Leg Day.')).toBeInTheDocument();
            });

            it('blocks saving a planned date that collides with another day', () => {
                renderModal({ name: 'Upper', day_of_week: ['Friday'], scheduled_dates: ['2026-09-21'], templates: [] }, vi.fn(), busyProgram);

                expect(screen.getByRole('button', { name: 'Create Day' })).toBeDisabled();
                expect(screen.getByText(/Mon, Sep 21 already has Leg Day/)).toBeInTheDocument();
            });

            it('shows a server calendar conflict inline and stays open', async () => {
                const onSave = vi.fn().mockRejectedValue({ response: { status: 409, data: {
                    code: 'program_day_date_conflict', error: 'Sep 19, 2026 would hold Upper and Other.',
                } } });
                renderModal({ name: 'Upper', day_of_week: ['Saturday'], scheduled_dates: [], templates: [] }, onSave, busyProgram);

                fireEvent.click(screen.getByRole('button', { name: 'Create Day' }));

                expect(await screen.findByRole('alert')).toHaveTextContent('Sep 19, 2026 would hold Upper and Other.');
            });
        });
    });
});
