import { describe, expect, it } from 'vitest';

import { fullGoals } from '../AddViewToGoalsModal';

describe('fullGoals', () => {
    it('finds newly chosen goals already at the chart limit', () => {
        const full = Array.from({ length: 12 }, (_, index) => ({ id: `v${index}`, goals: [{ id: 'busy' }] }));
        expect(fullGoals(full, ['busy', 'quiet'], [])).toEqual(['busy']);
        // A goal the view is already on isn't being added, so it isn't refused.
        expect(fullGoals(full, ['busy'], ['busy'])).toEqual([]);
        expect(fullGoals(full.slice(0, 11), ['busy'], [])).toEqual([]);
    });
});

const state = vi.hoisted(() => ({ tree: {}, saved: {}, links: {} }));
vi.mock('../../../hooks/useGoalQueries', () => ({ useFractalTree: () => state.tree }));
vi.mock('../../../hooks/useDashboardQueries', () => ({ useAnalyticsViews: () => state.saved }));
vi.mock('../../../hooks/useGoalCharts', async (original) => ({ ...await original(), useViewGoals: () => state.links }));
vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee', getGoalSecondaryColor: () => '#0f766e',
        getGoalIcon: () => 'circle', getScopedCharacteristics: () => ({ icon: 'circle' }),
    }),
}));
vi.mock('../../atoms/GoalIcon', () => ({ default: () => <span /> }));

import React from 'react';
import { beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AddViewToGoalsModal from '../AddViewToGoalsModal';

const view = { id: 'view', name: 'Practice' };

describe('goal attachment picker', () => {
    beforeEach(() => {
        state.tree = { data: { id: 'root', name: 'Root', children: [
            { id: 'busy', name: 'Full goal' }, { id: 'existing', name: 'Existing goal' },
        ] } };
        state.saved = { analyticsViews: Array.from({ length: 12 }, (_, i) => ({ id: `v${i}`, goals: [{ id: 'busy' }, { id: 'existing' }] })) };
        state.links = { data: { goals: [{ goal_id: 'existing' }] }, setGoals: vi.fn().mockResolvedValue(undefined) };
    });

    it('shows capacity, disables full goals, and permits removing existing links', () => {
        render(<AddViewToGoalsModal rootId="root" view={view} isOpen onClose={vi.fn()} />);
        expect(screen.getByLabelText('Select Full goal')).toBeDisabled();
        expect(screen.getAllByText('12/12')[0]).toHaveAttribute('title', 'Shows 12 of 12 charts');
        expect(screen.getByLabelText('Select Existing goal')).toBeEnabled();
        expect(screen.getByLabelText('Select Existing goal')).toBeChecked();
    });

    it('keeps a rejected save open and reports the server error', async () => {
        state.links.setGoals.mockRejectedValueOnce(new Error('A goal can show at most 12 charts'));
        const close = vi.fn();
        render(<AddViewToGoalsModal rootId="root" view={view} isOpen onClose={close} />);
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('A goal can show at most 12 charts');
        expect(close).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    });

    it('waits for capacity and links, and blocks changes if either read fails', () => {
        state.links = { isLoading: true };
        const { rerender } = render(<AddViewToGoalsModal rootId="root" view={view} isOpen onClose={vi.fn()} />);
        expect(screen.getByRole('status')).toHaveTextContent('Loading goals and chart capacity');
        expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
        state.links = { isError: true };
        rerender(<AddViewToGoalsModal rootId="root" view={view} isOpen onClose={vi.fn()} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load goals and chart capacity');
    });
});
