import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ProgramBuilder from '../ProgramBuilder';

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useParams: () => ({ rootId: 'root-1' }),
    };
});

vi.mock('../../../hooks/useGoalQueries', () => ({
    useFractalTree: () => ({
        data: {
            id: 'root-1',
            name: 'Root Goal',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'long-1',
                    name: 'Long Goal',
                    type: 'LongTermGoal',
                    parent_id: 'root-1',
                    children: [
                        {
                            id: 'short-1',
                            name: 'Short Goal',
                            type: 'ShortTermGoal',
                            parent_id: 'long-1',
                            children: [
                                {
                                    id: 'immediate-1',
                                    name: 'Immediate Goal',
                                    type: 'ImmediateGoal',
                                    parent_id: 'short-1',
                                    children: [],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    }),
}));

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#3A86FF',
        getGoalSecondaryColor: () => '#0f172a',
        getGoalIcon: () => 'circle',
        getScopedCharacteristics: () => ({ icon: 'circle' }),
    }),
}));

vi.mock('../../atoms/GoalIcon', () => ({
    default: () => <span data-testid="goal-icon" />,
}));

describe('ProgramBuilder', () => {
    it('uses the full hierarchy selector and submits selected goals and color', async () => {
        const handleSave = vi.fn().mockResolvedValue(undefined);

        render(
            <ProgramBuilder
                isOpen
                onClose={vi.fn()}
                onSave={handleSave}
                initialStartDate="2026-05-22"
                initialEndDate="2026-08-31"
            />
        );

        expect(screen.queryByText('Immediate Goal')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Program Name *'), {
            target: { value: 'Summer Program' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Select Goals' }));
        expect(screen.getByText('Root Goal')).toBeInTheDocument();
        expect(screen.getByText('Immediate Goal')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Select Immediate Goal'));
        fireEvent.click(screen.getByRole('button', { name: 'Apply (1)' }));
        expect(screen.getByText('Immediate Goal')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Program color'), {
            target: { value: '#ef476f' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Create Program' }));

        await waitFor(() => expect(handleSave).toHaveBeenCalledTimes(1));
        expect(handleSave).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Summer Program',
            color: '#ef476f',
            selectedGoals: ['immediate-1'],
        }));
    });
});
