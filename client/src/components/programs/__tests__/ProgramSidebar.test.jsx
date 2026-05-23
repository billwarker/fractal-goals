import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import ProgramSidebar from '../ProgramSidebar';

vi.mock('../../../contexts/GoalLevelsContext', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useGoalLevels: () => ({
            getGoalColor: (type) => {
                if (type === 'MidTermGoal') return '#3b82f6';
                if (type === 'ShortTermGoal') return '#14b8a6';
                if (type === 'ImmediateGoal') return '#ef4444';
                return '#94a3b8';
            },
            getGoalSecondaryColor: () => '#0f172a',
            getGoalIcon: () => 'circle',
            getLevelByName: () => ({ icon: 'circle' }),
        }),
    };
});

describe('ProgramSidebar', () => {
    it('renders flattened hierarchy cards and forwards clicks with full goal payloads', () => {
        const onGoalClick = vi.fn();
        const nestedGoal = {
            id: 'mid',
            type: 'MidTermGoal',
            name: 'Mid Goal',
            children: [
                {
                    id: 'short',
                    type: 'ShortTermGoal',
                    name: 'Short Goal',
                    children: [
                        {
                            id: 'immediate',
                            type: 'ImmediateGoal',
                            name: 'Immediate Goal',
                            completed: true,
                            completed_at: '2026-03-09',
                            children: [],
                        },
                    ],
                },
            ],
        };

        const byId = {
            mid: nestedGoal,
            short: nestedGoal.children[0],
            immediate: nestedGoal.children[0].children[0],
        };

        renderWithProviders(
            <ProgramSidebar
                programMetrics={{
                    daysRemaining: 10,
                    completedSessions: 1,
                    scheduledSessions: 3,
                    totalDuration: 300,
                    goalsMet: 1,
                    totalGoals: 3,
                }}
                activeBlock={null}
                blockMetrics={null}
                programGoalSeeds={[nestedGoal]}
                onGoalClick={onGoalClick}
                getGoalDetails={(id) => byId[id]}
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText('Mid Goal')).toBeInTheDocument();
        expect(screen.getByText('Short Goal')).toBeInTheDocument();
        expect(screen.getByText('Immediate Goal')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Immediate Goal'));
        expect(onGoalClick).toHaveBeenCalledWith(byId.immediate);
    });

    it('filters completed goals outside the program date range', () => {
        const nestedGoal = {
            id: 'mid',
            type: 'MidTermGoal',
            name: 'Mid Goal',
            children: [
                {
                    id: 'outside',
                    type: 'ShortTermGoal',
                    name: 'Completed Before Program',
                    completed: true,
                    completed_at: '2026-05-10T12:00:00Z',
                    children: [],
                },
                {
                    id: 'inside',
                    type: 'ShortTermGoal',
                    name: 'Completed During Program',
                    completed: true,
                    completed_at: '2026-05-24T12:00:00Z',
                    children: [],
                },
            ],
        };

        const byId = {
            mid: nestedGoal,
            outside: nestedGoal.children[0],
            inside: nestedGoal.children[1],
        };

        renderWithProviders(
            <ProgramSidebar
                program={{
                    start_date: '2026-05-22T00:00:00Z',
                    end_date: '2026-05-26T00:00:00Z',
                }}
                programMetrics={null}
                activeBlock={null}
                blockMetrics={null}
                programGoalSeeds={[nestedGoal]}
                onGoalClick={vi.fn()}
                getGoalDetails={(id) => byId[id]}
                compact
                hideMetrics
            />,
            {
                withTimezone: false,
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
            }
        );

        expect(screen.getByText('Mid Goal')).toBeInTheDocument();
        expect(screen.queryByText('Completed Before Program')).not.toBeInTheDocument();
        expect(screen.getByText('Completed During Program')).toBeInTheDocument();
    });
});
