import React from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import TimelinePanel from '../TimelinePanel';

const EMPTY_TIMELINE = { items: [], total: 0, total_all: 0 };
const useActivityProgressTimeline = vi.fn(() => ({ data: EMPTY_TIMELINE, isLoading: false, error: null }));
const setComparison = vi.fn();

vi.mock('../../../hooks/useActivityTags', () => ({
    useActivityProgressTimeline: (...args) => useActivityProgressTimeline(...args),
    useProgressComparisonMutation: () => ({ setComparison, isPending: false }),
    useActivityTagCatalog: () => ({ data: { families: [], tags: [
        { id: 'heavy', name: 'Heavy' }, { id: 'paused', name: 'Paused' },
    ] } }),
    useActivityTagCatalogMutations: () => ({ isPending: false }),
    useActivityTagMutations: () => ({ isPending: false }),
}));

vi.mock('../NoteTimeline', () => ({
    default: ({ notes }) => (
        <div>
            {notes.map((note) => (
                <div key={note.id}>{note.content}</div>
            ))}
        </div>
    ),
}));

vi.mock('../../../contexts/TimezoneContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useTimezone: () => ({ timezone: 'UTC' }),
    };
});

const sessionActivityDefs = [
    { id: 'activity-def-1', name: 'Scales', metric_definitions: [] },
    { id: 'activity-def-2', name: 'Arpeggios', metric_definitions: [] },
];
const instance = (overrides = {}) => ({
    id: 'instance-current',
    activity_definition_id: 'activity-def-1',
    tags: [{ id: 'heavy', name: 'Heavy' }],
    comparison_context: { mode: 'same_tags', tag_ids: ['heavy'], tags: [{ id: 'heavy', name: 'Heavy' }], version: 1 },
    ...overrides,
});
const providers = { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false };

describe('TimelinePanel', () => {
    beforeEach(() => {
        useActivityProgressTimeline.mockClear();
        setComparison.mockReset().mockResolvedValue({});
        useActivityProgressTimeline.mockReturnValue({ data: EMPTY_TIMELINE, isLoading: false, error: null });
    });

    it('follows the focused session activity without a sync effect', () => {
        renderWithProviders(
            <TimelinePanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={{ id: 'instance-2', activity_definition_id: 'activity-def-2' }}
                sessionActivityDefs={sessionActivityDefs}
                sessionInstances={[instance(), instance({ id: 'instance-2', activity_definition_id: 'activity-def-2' })]}
            />,
            providers,
        );

        expect(screen.getByLabelText('Select Activity:')).toHaveValue('activity-def-2');
        // The request names the shown context: the instance's own tags by default.
        expect(useActivityProgressTimeline).toHaveBeenCalledWith('root-1', 'activity-def-2', {
            instanceId: 'instance-2',
            preview: { mode: 'tags', tagIds: ['heavy'] },
            limit: 20,
        });
    });

    it('preserves manual selection until the chosen activity disappears, then falls back', () => {
        const { rerender } = renderWithProviders(
            <TimelinePanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={null}
                sessionActivityDefs={sessionActivityDefs}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        const select = screen.getByLabelText('Select Activity:');
        expect(select).toHaveValue('activity-def-1');

        fireEvent.change(select, { target: { value: 'activity-def-2' } });
        expect(select).toHaveValue('activity-def-2');

        rerender(
            <TimelinePanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={null}
                sessionActivityDefs={[sessionActivityDefs[0]]}
            />
        );

        expect(screen.getByLabelText('Select Activity:')).toHaveValue('activity-def-1');
    });

    it('keeps session notes out of the activity timeline view', () => {
        renderWithProviders(
            <TimelinePanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={{ activity_definition_id: 'activity-def-1' }}
                sessionActivityDefs={sessionActivityDefs}
                notes={[
                    {
                        id: 'note-1',
                        context_type: 'session',
                        content: 'Keep the wrist relaxed',
                        created_at: '2026-04-10T12:00:00.000Z',
                    },
                ]}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText('Activity Timeline')).toBeInTheDocument();
        expect(screen.queryByText('Session Notes (1)')).not.toBeInTheDocument();
        expect(screen.queryByText('Keep the wrist relaxed')).not.toBeInTheDocument();
    });

    it('compares with past sessions that have the same tags by default', () => {
        useActivityProgressTimeline.mockReturnValue({ data: { items: [], total: 3, total_all: 10 }, isLoading: false, error: null });
        renderWithProviders(
            <TimelinePanel rootId="root-1" selectedActivity={instance()} sessionActivityDefs={sessionActivityDefs} sessionInstances={[instance()]} />,
            providers,
        );

        const controls = screen.getByLabelText('Progress comparison');
        expect(within(controls).getByRole('radio', { name: 'Same tags' })).toBeChecked();
        expect(within(controls).getByText('3 of 10 past sessions match')).toBeInTheDocument();
        expect(within(controls).getByText('Heavy')).toBeInTheDocument();
        expect(within(controls).queryByRole('button', { name: 'Reset to same tags' })).not.toBeInTheDocument();
        expect(screen.getByText('No previous sessions match. Try Specific tags or All history.')).toBeInTheDocument();
    });

    it('requests the shown comparison so the list matches it before the save syncs', () => {
        const { rerender } = renderWithProviders(
            <TimelinePanel rootId="root-1" selectedActivity={instance()} sessionActivityDefs={sessionActivityDefs} sessionInstances={[instance()]} />,
            providers,
        );
        const allHistory = instance({ comparison_context: { mode: 'all', tag_ids: [], tags: [], version: 1 } });
        rerender(<TimelinePanel rootId="root-1" selectedActivity={allHistory} sessionActivityDefs={sessionActivityDefs} sessionInstances={[allHistory]} />);
        expect(useActivityProgressTimeline).toHaveBeenLastCalledWith('root-1', 'activity-def-1', {
            instanceId: 'instance-current', preview: { mode: 'all', tagIds: [] }, limit: 20,
        });
        const chosen = instance({ comparison_context: { mode: 'tags', tag_ids: ['paused'], tags: [], version: 1 } });
        rerender(<TimelinePanel rootId="root-1" selectedActivity={chosen} sessionActivityDefs={sessionActivityDefs} sessionInstances={[chosen]} />);
        expect(useActivityProgressTimeline).toHaveBeenLastCalledWith('root-1', 'activity-def-1', {
            instanceId: 'instance-current', preview: { mode: 'tags', tagIds: ['paused'] }, limit: 20,
        });
    });

    it('saves a different comparison on this instance only', async () => {
        renderWithProviders(
            <TimelinePanel rootId="root-1" selectedActivity={instance()} sessionActivityDefs={sessionActivityDefs} sessionInstances={[instance()]} />,
            providers,
        );

        fireEvent.click(screen.getByRole('radio', { name: 'All history' }));
        await waitFor(() => expect(setComparison).toHaveBeenCalledWith({
            instanceId: 'instance-current', mode: 'all', tagIds: [], tags: [], version: 1,
        }));
        // Specific tags starts from the instance's own tags.
        fireEvent.click(screen.getByRole('radio', { name: 'Specific tags' }));
        await waitFor(() => expect(setComparison).toHaveBeenLastCalledWith({
            instanceId: 'instance-current', mode: 'tags', tagIds: ['heavy'], tags: [], version: 1,
        }));
    });

    it('shows the chosen tags and a reset for an overridden comparison', async () => {
        const overridden = instance({ comparison_context: {
            mode: 'tags', tag_ids: ['paused'], tags: [{ id: 'paused', name: 'Paused' }], version: 4,
        } });
        renderWithProviders(
            <TimelinePanel rootId="root-1" selectedActivity={overridden} sessionActivityDefs={sessionActivityDefs} sessionInstances={[overridden]} />,
            providers,
        );

        const controls = screen.getByLabelText('Progress comparison');
        expect(within(controls).getByRole('radio', { name: 'Specific tags' })).toBeChecked();
        expect(within(controls).getByText('Paused')).toBeInTheDocument();
        fireEvent.click(within(controls).getByRole('button', { name: 'Reset to same tags' }));
        await waitFor(() => expect(setComparison).toHaveBeenCalledWith({
            instanceId: 'instance-current', mode: 'same_tags', tagIds: [], tags: [], version: 4,
        }));
    });

    it('highlights the earlier sets this instance is compared with', () => {
        const current = instance({ progress_comparison: { metric_comparisons: [{
            metric_id: 'm1',
            set_comparisons: [{ set_index: 0, previous_instance_id: 'instance-old', previous_set_index: 1 }],
        }] } });
        useActivityProgressTimeline.mockReturnValue({
            data: { total: 1, total_all: 1, items: [{
                id: 'instance-old',
                created_at: '2026-04-10T12:00:00.000Z',
                metric_values: [],
                notes: [],
                sets: [
                    { metrics: [{ metric_id: 'm1', value: 5 }] },
                    { metrics: [{ metric_id: 'm1', value: 8 }] },
                ],
                progress_comparison: { metric_comparisons: [] },
            }] },
            isLoading: false,
            error: null,
        });
        renderWithProviders(
            <TimelinePanel
                rootId="root-1"
                selectedActivity={current}
                sessionActivityDefs={[{ id: 'activity-def-1', name: 'Scales', metric_definitions: [{ id: 'm1', name: 'Reps', unit: 'reps' }] }]}
                sessionInstances={[current]}
            />,
            providers,
        );

        const paired = screen.getAllByTitle('Compared with a set in this session');
        expect(paired).toHaveLength(1);
        expect(paired[0]).toHaveTextContent('#2');
    });

    it('loads older timeline pages on demand', () => {
        const fetchNextPage = vi.fn();
        useActivityProgressTimeline.mockReturnValue({
            data: { items: [], total: 42, total_all: 42 },
            isLoading: false,
            error: null,
            hasNextPage: true,
            fetchNextPage,
            isFetchingNextPage: false,
        });
        renderWithProviders(
            <TimelinePanel rootId="root-1" sessionId="session-1" selectedActivity={null} sessionActivityDefs={sessionActivityDefs} />,
            { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false },
        );

        fireEvent.click(screen.getByRole('button', { name: 'Load older history' }));
        expect(fetchNextPage).toHaveBeenCalledTimes(1);
    });

    it('renders saved progress indicators alongside timeline metrics', () => {
        useActivityProgressTimeline.mockReturnValue({
            data: { items: [
                {
                    id: 'instance-1',
                    created_at: '2026-04-10T12:00:00.000Z',
                    metric_values: [
                        { metric_definition_id: 'm1', metric_id: 'm1', name: 'Quality', value: 11, unit: 'rating' },
                    ],
                    sets: [],
                    notes: [],
                    progress_comparison: {
                        activity_instance_id: 'instance-1',
                        metric_comparisons: [
                            {
                                metric_id: 'm1',
                                metric_name: 'Quality',
                                pct_change: 10,
                                improved: true,
                                regressed: false,
                            },
                        ],
                    },
                },
            ], total: 1, total_all: 1 },
            isLoading: false,
            error: null,
        });

        renderWithProviders(
            <TimelinePanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={{ activity_definition_id: 'activity-def-1' }}
                sessionActivityDefs={[
                    {
                        id: 'activity-def-1',
                        name: 'Scales',
                        metric_definitions: [{ id: 'm1', name: 'Quality', unit: 'rating' }],
                    },
                ]}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText(/Quality: 11 rating/i)).toBeInTheDocument();
        expect(screen.getByText('(▲10%)')).toBeInTheDocument();
    });

    it('uses progress tone, not delta sign, for absolute timeline indicators', () => {
        useActivityProgressTimeline.mockReturnValue({
            data: { items: [
                {
                    id: 'instance-1',
                    created_at: '2026-04-10T12:00:00.000Z',
                    metric_values: [
                        { metric_definition_id: 'm1', metric_id: 'm1', name: 'Time', value: 55, unit: 's' },
                    ],
                    sets: [],
                    notes: [],
                    progress_comparison: {
                        activity_instance_id: 'instance-1',
                        metric_comparisons: [
                            {
                                metric_id: 'm1',
                                metric_name: 'Time',
                                delta: -5,
                                improved: true,
                                regressed: false,
                            },
                        ],
                    },
                },
            ], total: 1, total_all: 1 },
            isLoading: false,
            error: null,
        });

        renderWithProviders(
            <TimelinePanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={{ activity_definition_id: 'activity-def-1' }}
                sessionActivityDefs={[
                    {
                        id: 'activity-def-1',
                        name: 'Intervals',
                        delta_display_mode: 'absolute',
                        metric_definitions: [{ id: 'm1', name: 'Time', unit: 's' }],
                    },
                ]}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        const indicator = screen.getByText('(-5)');
        expect(indicator.className).toMatch(/timelineProgressImproved/);
    });

    it('renders activity history with the current session-template badge color', () => {
        useActivityProgressTimeline.mockReturnValue({
            data: { items: [{
                id: 'instance-history-1',
                session_name: 'Historical Session',
                session_template_name: 'Simple Empty Template',
                session_template_color: '#22c55e',
                session_date: '2026-06-23T12:00:00Z',
                duration_seconds: 110,
                metric_values: [],
                sets: [],
                notes: [],
                progress_comparison: { metric_comparisons: [] },
            }], total: 1, total_all: 1 },
            isLoading: false,
            error: null,
        });

        renderWithProviders(
            <TimelinePanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={null}
                sessionActivityDefs={sessionActivityDefs}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText('Simple Empty Template')).toHaveStyle({ color: '#22c55e' });
    });
});
