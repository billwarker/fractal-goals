import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import MicroGoalModal from '../MicroGoalModal';

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
        getGoalSecondaryColor: () => '#164e63',
        getGoalIcon: () => 'circle',
    }),
}));

describe('MicroGoalModal', () => {
    it('resets metric draft state when reopened', () => {
        const onClose = vi.fn();
        const activityDefinitions = [
            {
                id: 'activity-1',
                name: 'Scales',
                metric_definitions: [{ id: 'metric-1', name: 'Tempo', unit: 'bpm' }],
            },
        ];

        const { rerender } = render(
            <MicroGoalModal
                isOpen={true}
                onClose={onClose}
                onSave={vi.fn()}
                activityDefinitions={activityDefinitions}
                preselectedActivityId="activity-1"
                parentGoalName="Technique"
            />
        );

        const input = screen.getByPlaceholderText('0');
        fireEvent.change(input, { target: { value: '120' } });
        expect(input).toHaveValue(120);

        rerender(
            <MicroGoalModal
                isOpen={false}
                onClose={onClose}
                onSave={vi.fn()}
                activityDefinitions={activityDefinitions}
                preselectedActivityId="activity-1"
                parentGoalName="Technique"
            />
        );

        rerender(
            <MicroGoalModal
                isOpen={true}
                onClose={onClose}
                onSave={vi.fn()}
                activityDefinitions={activityDefinitions}
                preselectedActivityId="activity-1"
                parentGoalName="Technique"
            />
        );

        expect(screen.getByPlaceholderText('0')).toHaveValue(null);
    });
});
