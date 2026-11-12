import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import GoalCharacteristicsSettings from '../GoalCharacteristicsSettings';

const { updateGoalLevel, resetGoalLevel } = vi.hoisted(() => ({
    updateGoalLevel: vi.fn(),
    resetGoalLevel: vi.fn(),
}));

vi.mock('../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        goalLevels: [
            { id: 'level-1', name: 'Long Term Goal', icon: 'circle', color: '#4f9cf9', owner_id: null, track_activities: true },
            { id: 'completed', name: 'Completed' },
        ],
        updateGoalLevel,
        resetGoalLevel,
    }),
}));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ animatedIcons: false }) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { preferences: {} }, setUser: vi.fn() }) }));
vi.mock('../../utils/notify', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

describe('GoalCharacteristicsSettings', () => {
    beforeEach(() => {
        updateGoalLevel.mockReset().mockResolvedValue({});
    });

    it('groups a level’s settings and saves only what changed', async () => {
        render(<GoalCharacteristicsSettings />);
        const level = screen.getByText('Long Term Goal').closest('details');
        fireEvent.click(within(level).getByText('Long Term Goal'));
        expect(within(level).getByRole('button', { name: 'Save changes' })).toBeDisabled();

        fireEvent.click(within(level).getByRole('switch', { name: 'Require SMART' }));
        fireEvent.click(within(level).getByRole('radio', { name: 'Square' }));
        expect(within(level).getByText('Unsaved changes')).toBeInTheDocument();

        fireEvent.click(within(level).getByRole('button', { name: 'Save changes' }));
        await waitFor(() => expect(updateGoalLevel).toHaveBeenCalledWith({
            id: 'level-1',
            updates: { requires_smart: true, icon: 'square' },
        }));
        await waitFor(() => expect(within(level).queryByText('Unsaved changes')).not.toBeInTheDocument());
    });

    it('lists completed goals last, without the level-only rules', () => {
        render(<GoalCharacteristicsSettings />);
        const panels = screen.getAllByRole('group');
        const completed = panels.find((panel) => panel.textContent.includes('Completed goals'));
        expect(completed).toBeDefined();
        expect(within(completed).queryByRole('switch')).not.toBeInTheDocument();
    });
});
