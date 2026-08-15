import React from 'react';
import { render, screen } from '@testing-library/react';

import InlineActivityBuilderModal from '../InlineActivityBuilderModal';

const activityBuilderFormSpy = vi.hoisted(() => vi.fn());

vi.mock('../../../contexts/ActivitiesContext', () => ({
    useActivities: () => ({
        createActivity: vi.fn(),
        updateActivity: vi.fn(),
    }),
}));

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: vi.fn(),
        getGoalIcon: vi.fn(),
    }),
}));

vi.mock('../../../hooks/useGoalQueries', () => ({
    useFractalTree: () => ({
        data: { id: 'root-1', name: 'Root goal', type: 'UltimateGoal', children: [] },
    }),
}));

vi.mock('../../activityBuilder/ActivityBuilderForm', () => ({
    default: (props) => {
        activityBuilderFormSpy(props);
        return <div>activity builder form</div>;
    },
}));

describe('InlineActivityBuilderModal', () => {
    beforeEach(() => {
        activityBuilderFormSpy.mockClear();
    });

    it('initializes the shared builder with the goal that launched creation', () => {
        render(
            <InlineActivityBuilderModal
                rootId="root-1"
                goalId="goal-current"
                onSuccess={vi.fn()}
                onCancel={vi.fn()}
            />
        );

        expect(screen.getByText('activity builder form')).toBeInTheDocument();
        expect(activityBuilderFormSpy).toHaveBeenLastCalledWith(expect.objectContaining({
            rootId: 'root-1',
            initialSelectedGoalIds: ['goal-current'],
            nestedModalLayer: 'top',
        }));
    });

    it('does not invent a goal association outside a goal-scoped entry point', () => {
        render(
            <InlineActivityBuilderModal
                rootId="root-1"
                onSuccess={vi.fn()}
                onCancel={vi.fn()}
            />
        );

        expect(activityBuilderFormSpy).toHaveBeenLastCalledWith(expect.objectContaining({
            initialSelectedGoalIds: [],
        }));
    });
});
