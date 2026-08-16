import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import TimelinePanel from '../TimelinePanel';

const useActivityProgressTimeline = vi.fn(() => ({
    data: { items: [], tags: [], views: [], active_view_id: null, included_count: 0, total: 0 },
    isLoading: false,
    error: null,
}));
const createView = vi.fn();
const updateView = vi.fn();
const deleteView = vi.fn();
const activateView = vi.fn();

vi.mock('../../../hooks/useActivityProgressViews', () => ({
    useActivityProgressTimeline: (...args) => useActivityProgressTimeline(...args),
    useActivityProgressViewMutations: () => ({
        createView, updateView, deleteView, activateView, isPending: false,
    }),
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

describe('TimelinePanel', () => {
    beforeEach(() => {
        useActivityProgressTimeline.mockClear();
        createView.mockReset().mockResolvedValue({});
        updateView.mockReset().mockResolvedValue({});
        deleteView.mockReset().mockResolvedValue({});
        activateView.mockReset().mockResolvedValue({});
        useActivityProgressTimeline.mockReturnValue({
            data: { items: [], tags: [], views: [], active_view_id: null, included_count: 0, total: 0 },
            isLoading: false,
            error: null,
        });
    });

    it('follows the focused session activity without a sync effect', () => {
        renderWithProviders(
            <TimelinePanel
                rootId="root-1"
                sessionId="session-1"
                selectedActivity={{ activity_definition_id: 'activity-def-2' }}
                sessionActivityDefs={sessionActivityDefs}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByLabelText('Select Activity:')).toHaveValue('activity-def-2');
        expect(useActivityProgressTimeline).toHaveBeenCalledWith('root-1', 'activity-def-2', {
            excludeSessionId: 'session-1',
            draftConfig: null,
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

    it('keeps All History immutable and creates an activated saved view through Save as', async () => {
        useActivityProgressTimeline.mockReturnValue({
            data: {
                items: [],
                tags: [{ id: 'tag-1', name: 'Competition', archived: false }],
                views: [],
                active_view_id: null,
                included_count: 0,
                total: 0,
            },
            isLoading: false,
            error: null,
        });
        renderWithProviders(
            <TimelinePanel rootId="root-1" sessionId="session-1" selectedActivity={null} sessionActivityDefs={sessionActivityDefs} />,
            { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false },
        );

        expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
        fireEvent.click(screen.getAllByText('Competition')[0]);
        fireEvent.click(screen.getByRole('button', { name: 'Save as…' }));
        fireEvent.change(screen.getByLabelText('Progress view name'), { target: { value: 'Meet prep' } });
        fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        await waitFor(() => expect(createView).toHaveBeenCalledWith({
            name: 'Meet prep',
            config: expect.objectContaining({ all_tag_ids: ['tag-1'] }),
            activate: true,
        }));
    });

    it('saves a draft with the selected view version', async () => {
        useActivityProgressTimeline.mockReturnValue({
            data: {
                items: [],
                tags: [{ id: 'tag-1', name: 'Competition', archived: false }],
                views: [{ id: 'view-1', name: 'Meet prep', version: 4, config: { all_tag_ids: [], any_tag_ids: [], none_tag_ids: [] } }],
                active_view_id: 'view-1',
                included_count: 0,
                total: 0,
            },
            isLoading: false,
            error: null,
        });
        renderWithProviders(
            <TimelinePanel rootId="root-1" sessionId="session-1" selectedActivity={null} sessionActivityDefs={sessionActivityDefs} />,
            { withTimezone: false, withAuth: false, withGoalLevels: false, withTheme: false },
        );
        fireEvent.click(screen.getAllByText('Competition')[0]);
        fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
        await waitFor(() => expect(updateView).toHaveBeenCalledWith({
            viewId: 'view-1',
            version: 4,
            config: expect.objectContaining({ all_tag_ids: ['tag-1'] }),
        }));
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
                        included: true,
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
            ], tags: [], views: [], active_view_id: null, included_count: 1, total: 1 },
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
                        included: true,
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
            ], tags: [], views: [], active_view_id: null, included_count: 1, total: 1 },
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
                progress_comparison: { included: true, metric_comparisons: [] },
            }], tags: [], views: [], active_view_id: null, included_count: 1, total: 1 },
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
