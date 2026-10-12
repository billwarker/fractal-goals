import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#3b82f6',
        getGoalSecondaryColor: () => '#172554',
        getGoalIcon: () => 'circle',
        getLevelByName: () => ({ icon: 'circle', color: '#3b82f6', secondary_color: '#172554' }),
    }),
}));

import { buildPlanGoalsView } from '../../../../utils/planGoalsView';
import PlanGoalHierarchyPanel from '../PlanGoalHierarchyPanel';

const goalTree = { id: 'root', name: 'Calisthenics', type: 'UltimateGoal', children: [
    { id: 'lever', name: 'Front lever', type: 'MidTermGoal', children: [] },
    { id: 'push', name: 'Handstand push up', type: 'MidTermGoal', children: [] },
] };
const activities = [
    { id: 'fl', name: 'Adv. Tuck FL Holds', associated_goal_ids: ['lever'] },
    { id: 'pike', name: 'Pike Push Ups', associated_goal_ids: ['push'] },
];
const activePlan = {
    date: '2026-10-14', templateId: 't', templateName: 'Upper A', readOnly: false,
    activityIds: ['fl', 'pike'], selectedActivityId: null,
};

function renderPanel(props = {}) {
    const plan = { ...activePlan, ...(props.activePlan || {}) };
    const handlers = { onGoalScopeToggle: vi.fn(), onGoalClick: vi.fn(), onEditDayGoals: vi.fn() };
    render(
        <PlanGoalHierarchyPanel
            planGoalsView={buildPlanGoalsView({ goalTree, scopeGoalIds: [], activityIds: plan.activityIds, activities })}
            activities={activities}
            dayName="Upper"
            activityGoalScope={null}
            {...handlers}
            {...props}
            activePlan={props.activePlan === null ? null : plan}
        />,
    );
    return handlers;
}

describe('PlanGoalHierarchyPanel', () => {
    it("names the plan it follows and scopes activities through a goal's icon", () => {
        const { onGoalScopeToggle, onEditDayGoals } = renderPanel();

        expect(screen.getByText('Upper A')).toBeInTheDocument();
        expect(screen.getByText('Upper goals')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Scope activities to Front lever' }));
        expect(onGoalScopeToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'lever' }));
        fireEvent.click(screen.getByRole('button', { name: 'Edit day goals' }));
        expect(onEditDayGoals).toHaveBeenCalled();
    });

    it("labels the hierarchy by the selected activity", () => {
        renderPanel({ activePlan: { selectedActivityId: 'fl' } });
        expect(screen.getByText('Goals: Adv. Tuck FL Holds')).toBeInTheDocument();
    });

    it("still highlights a past plan's evidence and its selected activity's goals, without scoping", () => {
        const { onGoalScopeToggle } = renderPanel({
            activePlan: {
                readOnly: true,
                selectedActivityId: 'fl',
                instances: [{ id: 'i1', activity_definition_id: 'fl', completed: true, associated_goal_ids: [] }],
            },
        });

        expect(screen.getByText('Goals: Adv. Tuck FL Holds')).toBeInTheDocument();
        expect(screen.getByText('Front lever')).toBeInTheDocument();

        expect(screen.getByText(/Past plans can't add activities/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Scope activities to/ })).not.toBeInTheDocument();
        expect(onGoalScopeToggle).not.toHaveBeenCalled();
    });

    it('asks for a plan when none is active', () => {
        renderPanel({ activePlan: null });
        expect(screen.getByText('Select a plan to see the goals it works toward.')).toBeInTheDocument();
    });
});
