import React from 'react';
import { render, screen } from '@testing-library/react';

import GoalDetailModal from '../GoalDetailModal';

vi.mock('@tanstack/react-query', () => ({
    useQuery: () => ({
        data: [],
        isLoading: false,
        error: null,
    }),
    useMutation: () => ({
        mutateAsync: vi.fn(() => Promise.resolve()),
    }),
    useQueryClient: () => ({
        invalidateQueries: vi.fn(),
    }),
}));

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
        getGoalSecondaryColor: () => '#0f172a',
        getGoalTextColor: () => '#0f172a',
        getGoalIcon: () => 'circle',
        getLevelByName: () => ({ icon: 'circle' }),
    }),
}));

vi.mock('../../hooks/useGoalQueries', () => ({
    useGoalAssociations: () => ({ activities: [], groups: [] }),
    useGoalMetrics: () => ({ metrics: null }),
    useGoalDailyDurations: () => ({ data: null, isSuccess: false }),
}));

vi.mock('../../hooks/useGoalNotes', () => ({
    useGoalNotes: () => ({
        notes: [],
        isLoading: false,
        error: null,
        createNote: vi.fn(() => Promise.resolve()),
        updateNote: vi.fn(() => Promise.resolve()),
        deleteNote: vi.fn(() => Promise.resolve()),
        deleteGoalCompletionNotes: vi.fn(() => Promise.resolve()),
        pinNote: vi.fn(() => Promise.resolve()),
        unpinNote: vi.fn(() => Promise.resolve()),
    }),
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        setGoalAssociationsBatch: vi.fn(() => Promise.resolve()),
        setActivityGoals: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../goals/goalDetailUtils', () => ({
    getParentGoalInfo: () => null,
}));

vi.mock('../goals/GoalHeader', () => ({
    default: ({ name }) => <div>header:{name}</div>,
}));

vi.mock('../goals/GoalViewMode', () => ({
    default: ({ name, targets }) => (
        <div>
            <div>view:{name}</div>
            <div>target-count:{targets.length}</div>
            {targets.map((target) => (
                <div key={target.id}>target:{target.name}</div>
            ))}
        </div>
    ),
}));

vi.mock('../goals/GoalEditForm', () => ({
    default: () => <div>edit form</div>,
}));

vi.mock('../goals/GoalCompletionModal', () => ({
    default: () => <div>completion modal</div>,
}));

vi.mock('../goals/GoalUncompletionModal', () => ({
    default: () => <div>uncompletion modal</div>,
}));

vi.mock('../goalDetail/GoalTimelineView', () => ({
    default: () => <div>goal timeline view</div>,
}));

vi.mock('../goalDetail/ActivityAssociator', () => ({
    default: () => <div>activity associator</div>,
}));

vi.mock('../goalDetail/TargetManager', () => ({
    default: () => <div>target manager</div>,
}));

vi.mock('../analytics/graphs/GraphProfileModal', () => ({
    default: () => null,
}));

vi.mock('../goals/GoalOptionsView', () => ({
    default: () => <div>goal options view</div>,
}));

describe('GoalDetailModal target hydration', () => {
    it('shows targets from session hierarchy goals with top-level targets', () => {
        render(
            <GoalDetailModal
                isOpen
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Legend of Zelda: Saria Song',
                    type: 'ShortTermGoal',
                    attributes: { id: 'goal-1', type: 'ShortTermGoal' },
                    targets: [
                        {
                            id: 'target-1',
                            name: 'Section 1',
                            activity_id: 'activity-1',
                            metrics: [{ metric_id: 'speed', value: 80 }],
                        },
                    ],
                }}
                onUpdate={vi.fn()}
                onToggleCompletion={vi.fn()}
                rootId="root-1"
                activityDefinitions={[
                    {
                        id: 'activity-1',
                        name: 'Practice',
                        metric_definitions: [{ id: 'speed', name: 'Speed', unit: 'BPM' }],
                    },
                ]}
            />
        );

        expect(screen.getByText('target-count:1')).toBeInTheDocument();
        expect(screen.getByText('target:Section 1')).toBeInTheDocument();
    });
});
