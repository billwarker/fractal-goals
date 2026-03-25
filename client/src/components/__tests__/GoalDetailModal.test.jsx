import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import GoalDetailModal from '../GoalDetailModal';

const { mockUseGoalForm, mockNotify, mockGoalAssociations, mockGoalMetrics, mockGoalDurations } = vi.hoisted(() => ({
    mockUseGoalForm: vi.fn(),
    mockNotify: {
        success: vi.fn(),
        error: vi.fn(),
    },
    mockGoalAssociations: {
        activities: [],
        groups: [],
    },
    mockGoalMetrics: {
        metrics: null,
    },
    mockGoalDurations: {
        data: null,
        isSuccess: false,
    },
}));

vi.mock('@tanstack/react-query', () => ({
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

vi.mock('../../hooks/useGoalForm', () => ({
    useGoalForm: (...args) => mockUseGoalForm(...args),
}));

vi.mock('../../hooks/useGoalQueries', () => ({
    useGoalAssociations: () => mockGoalAssociations,
    useGoalMetrics: () => mockGoalMetrics,
    useGoalDailyDurations: () => mockGoalDurations,
}));

vi.mock('../../utils/api', () => ({
    fractalApi: {
        setGoalAssociationsBatch: vi.fn(() => Promise.resolve()),
        setActivityGoals: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../../utils/notify', () => ({
    default: mockNotify,
}));

vi.mock('../goals/goalDetailUtils', () => ({
    getParentGoalInfo: () => null,
}));

vi.mock('../goals/goalDetailQueryUtils', () => ({
    invalidateGoalAssociationQueries: vi.fn(() => Promise.resolve()),
}));

vi.mock('../goals/GoalCompletionModal', () => ({
    default: () => <div>completion modal</div>,
}));

vi.mock('../goals/GoalUncompletionModal', () => ({
    default: () => <div>uncompletion modal</div>,
}));

vi.mock('../goals/GoalHeader', () => ({
    default: ({ name, onClose, goalStatus }) => (
        <div>
            <div>header:{name}:{goalStatus}</div>
            <button onClick={onClose}>close modal</button>
        </div>
    ),
}));

vi.mock('../goals/GoalOptionsView', () => ({
    default: () => <div>goal options view</div>,
}));

vi.mock('../goals/GoalViewMode', () => ({
    default: ({ name, setIsEditing, setViewState }) => (
        <div>
            <div>view:{name}</div>
            <button onClick={() => setIsEditing(true)}>edit goal</button>
            <button onClick={() => setViewState('goal-options')}>open options</button>
        </div>
    ),
}));

vi.mock('../goals/GoalEditForm', () => ({
    default: ({ name, handleSave, handleCancel }) => (
        <div>
            <div>edit:{name}</div>
            <button onClick={handleSave}>save goal</button>
            <button onClick={handleCancel}>cancel edit</button>
        </div>
    ),
}));

describe('GoalDetailModal smoke coverage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseGoalForm.mockReturnValue({
            name: 'Deep Work',
            setName: vi.fn(),
            description: 'Focus on leverage work',
            setDescription: vi.fn(),
            deadline: '2026-04-01',
            setDeadline: vi.fn(),
            relevanceStatement: 'Build momentum',
            setRelevanceStatement: vi.fn(),
            completedViaChildren: false,
            setCompletedViaChildren: vi.fn(),
            trackActivities: true,
            setTrackActivities: vi.fn(),
            allowManualCompletion: true,
            setAllowManualCompletion: vi.fn(),
            targets: [],
            setTargets: vi.fn(),
            resetForm: vi.fn(),
            errors: {},
            validateForm: vi.fn(() => true),
        });
    });

    it('renders view mode and forwards close requests', () => {
        const onClose = vi.fn();

        render(
            <GoalDetailModal
                isOpen={true}
                onClose={onClose}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: { id: 'goal-1', type: 'ShortTermGoal' },
                }}
                onUpdate={vi.fn()}
                onToggleCompletion={vi.fn()}
                onDelete={vi.fn()}
                rootId="root-1"
                treeData={[]}
            />
        );

        expect(screen.getByText('view:Deep Work')).toBeInTheDocument();

        fireEvent.click(screen.getByText('close modal'));
        expect(onClose).toHaveBeenCalled();
    });

    it('keeps the shared header visible when switching to options view', async () => {
        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={{
                    id: 'goal-1',
                    name: 'Deep Work',
                    attributes: { id: 'goal-1', type: 'ShortTermGoal', parent_id: 'parent-1' },
                }}
                onUpdate={vi.fn()}
                onToggleCompletion={vi.fn()}
                onDelete={vi.fn()}
                rootId="root-1"
                treeData={{
                    id: 'root-1',
                    name: 'Root',
                    attributes: { id: 'root-1', type: 'UltimateGoal', level_id: 'level-root' },
                    children: [
                        {
                            id: 'parent-1',
                            name: 'Parent',
                            attributes: { id: 'parent-1', type: 'MidTermGoal', level_id: 'level-mid' },
                            children: [],
                        },
                    ],
                }}
            />
        );

        expect(screen.getByText('header:Deep Work:active')).toBeInTheDocument();

        fireEvent.click(screen.getByText('open options'));

        await waitFor(() => {
            expect(screen.getByText('header:Deep Work:active')).toBeInTheDocument();
            expect(screen.getByText('goal options view')).toBeInTheDocument();
        });
    });

    it('renders create mode and submits through onCreate', async () => {
        const onCreate = vi.fn().mockResolvedValue({ id: 'goal-2', name: 'Deep Work' });

        render(
            <GoalDetailModal
                isOpen={true}
                onClose={vi.fn()}
                goal={null}
                onUpdate={vi.fn()}
                onToggleCompletion={vi.fn()}
                onDelete={vi.fn()}
                rootId="root-1"
                treeData={[]}
                mode="create"
                onCreate={onCreate}
                parentGoal={{
                    id: 'parent-1',
                    attributes: { id: 'parent-1', type: 'ShortTermGoal' },
                }}
            />
        );

        expect(screen.getByText('edit:Deep Work')).toBeInTheDocument();

        fireEvent.click(screen.getByText('save goal'));

        await waitFor(() => {
            expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
                name: 'Deep Work',
                description: 'Focus on leverage work',
                deadline: '2026-04-01',
                relevance_statement: 'Build momentum',
                parent_id: 'parent-1',
                allow_manual_completion: true,
            }));
        });

        expect(mockNotify.success).toHaveBeenCalled();
    });
});
