import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import SessionSection from '../SessionSection';

const {
    addActivity,
    removeActivity,
    moveActivity,
    reorderActivity,
    setDraggedItem,
    sessionUiState,
    sessionDataState,
} = vi.hoisted(() => ({
    addActivity: vi.fn(),
    removeActivity: vi.fn(),
    moveActivity: vi.fn(),
    reorderActivity: vi.fn(),
    setDraggedItem: vi.fn(),
    sessionUiState: {
        showActivitySelector: {},
    },
    sessionDataState: {
        activityInstances: [],
        activities: [
            {
                id: 'activity-1',
                name: 'Scale Practice',
                description: 'Ascending pattern',
                group_id: 'group-1',
                has_sets: false,
                has_metrics: true,
                metrics_multiplicative: false,
                has_splits: false,
                associated_goal_ids: ['goal-1'],
                metric_definitions: [{ id: 'metric-1', name: 'Speed', unit: 'bpm' }],
                split_definitions: [],
            },
        ],
        activityGroups: [
            { id: 'group-1', name: 'Technique', parent_id: null },
        ],
        groupMap: {
            'group-1': { id: 'group-1', name: 'Technique', parent_id: null },
        },
        groupedActivities: {},
        instancesLoading: false,
        session: { completed: false },
    },
}));

vi.mock('../../../contexts/ActiveSessionContext', () => ({
    useActiveSessionData: () => ({
        ...sessionDataState,
    }),
    useActiveSessionUi: () => ({
        showActivitySelector: sessionUiState.showActivitySelector,
        setShowActivitySelector: (updater) => {
            sessionUiState.showActivitySelector = typeof updater === 'function'
                ? updater(sessionUiState.showActivitySelector)
                : updater;
        },
        draggedItem: null,
        setDraggedItem,
    }),
    useActiveSessionActions: () => ({
        addActivity,
        removeActivity,
        moveActivity,
        reorderActivity,
    }),
}));

vi.mock('../../../hooks/useIsMobile', () => ({
    default: () => false,
}));

vi.mock('../SessionActivityItem', () => ({
    default: () => <div>session activity item</div>,
}));

vi.mock('../../common/ActivityModeSelector', () => ({
    default: () => null,
}));

describe('SessionSection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionUiState.showActivitySelector = {};
        sessionDataState.groupedActivities = {
            'group-1': [sessionDataState.activities[0]],
        };
    });

    it('opens copy mode and passes a duplicated activity definition into the builder flow', () => {
        const onOpenActivityBuilder = vi.fn();

        const { rerender } = render(
            <SessionSection
                section={{ name: 'Main Practice', activity_ids: [], estimated_duration_minutes: 10 }}
                sectionIndex={0}
                onFocusActivity={vi.fn()}
                selectedActivityId={null}
                onOpenActivityBuilder={onOpenActivityBuilder}
                onNoteCreated={vi.fn()}
                allNotes={[]}
                onAddNote={vi.fn()}
                onUpdateNote={vi.fn()}
                onDeleteNote={vi.fn()}
                onOpenGoals={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '+ Add Activity' }));
        rerender(
            <SessionSection
                section={{ name: 'Main Practice', activity_ids: [], estimated_duration_minutes: 10 }}
                sectionIndex={0}
                onFocusActivity={vi.fn()}
                selectedActivityId={null}
                onOpenActivityBuilder={onOpenActivityBuilder}
                onNoteCreated={vi.fn()}
                allNotes={[]}
                onAddNote={vi.fn()}
                onUpdateNote={vi.fn()}
                onDeleteNote={vi.fn()}
                onOpenGoals={vi.fn()}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: '+ Copy Existing Activity Definition' }));
        expect(screen.getByText('Copy mode: select an existing activity definition to duplicate into a new one.')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Technique/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Copy Scale Practice' }));

        expect(addActivity).not.toHaveBeenCalled();
        expect(onOpenActivityBuilder).toHaveBeenCalledWith(0, expect.objectContaining({
            id: undefined,
            name: 'Scale Practice (Copy)',
            associated_goal_ids: ['goal-1'],
            metric_definitions: [
                expect.objectContaining({
                    id: undefined,
                    name: 'Speed',
                    unit: 'bpm',
                }),
            ],
        }));
    });
});
