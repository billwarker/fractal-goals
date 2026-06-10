import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { GoalLevelsProvider, useGoalLevels } from '../GoalLevelsContext';

const { getGoalLevels } = vi.hoisted(() => ({ getGoalLevels: vi.fn() }));

vi.mock('../AuthContext', () => ({
    useAuth: () => ({ isAuthenticated: false, user: null }),
}));

vi.mock('@tanstack/react-query', () => ({
    useQuery: ({ enabled }) => ({ data: enabled ? [] : undefined, isLoading: false, error: null }),
    useMutation: () => ({ mutateAsync: vi.fn() }),
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../../utils/api', () => ({
    globalApi: { getGoalLevels: (...args) => getGoalLevels(...args) },
}));

function Probe() {
    const { getGoalColor, getGoalIcon } = useGoalLevels();
    return (
        <div>
            <span data-testid="color">{getGoalColor('UltimateGoal')}</span>
            <span data-testid="icon">{getGoalIcon('UltimateGoal')}</span>
        </div>
    );
}

describe('GoalLevelsProvider seedLevels', () => {
    it('resolves colors/icons from seeded snapshot levels without an authenticated fetch', () => {
        const seedLevels = [
            { id: 'lvl-1', name: 'Ultimate Goal', color: '#66d9ef', secondary_color: '#102235', icon: 'star' },
        ];

        render(
            <MemoryRouter>
                <GoalLevelsProvider seedLevels={seedLevels}>
                    <Probe />
                </GoalLevelsProvider>
            </MemoryRouter>
        );

        expect(screen.getByTestId('color')).toHaveTextContent('#66d9ef');
        expect(screen.getByTestId('icon')).toHaveTextContent('star');
        expect(getGoalLevels).not.toHaveBeenCalled();
    });
});
