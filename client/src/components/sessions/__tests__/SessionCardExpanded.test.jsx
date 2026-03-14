import React from 'react';
import { renderWithProviders, screen } from '../../../test/test-utils';
import SessionCardExpanded from '../SessionCardExpanded';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalIcon: (goal) => {
            const type = typeof goal === 'string' ? goal : goal?.type || goal?.attributes?.type;
            const icons = {
                UltimateGoal: 'star',
                LongTermGoal: 'diamond',
                MidTermGoal: 'hexagon',
                ShortTermGoal: 'square',
                ImmediateGoal: 'triangle',
                MicroGoal: 'circle',
                NanoGoal: 'diamond',
            };
            return icons[type] || 'circle';
        },
        getGoalColor: (goal) => {
            const type = typeof goal === 'string' ? goal : goal?.type || goal?.attributes?.type;
            const colors = {
                UltimateGoal: '#ff9800',
                LongTermGoal: '#8bc34a',
                MidTermGoal: '#03a9f4',
                ShortTermGoal: '#3f51b5',
                ImmediateGoal: '#009688',
                MicroGoal: '#e91e63',
                NanoGoal: '#9c27b0',
            };
            return colors[type] || '#607d8b';
        },
        getGoalSecondaryColor: () => '#111111',
    }),
}));

vi.mock('../SessionSectionGrid', () => ({
    default: () => <div data-testid="section-grid" />,
}));

describe('SessionCardExpanded', () => {
    it('shows completed goals in level order and aggregates nano goals into a count', () => {
        renderWithProviders(
            <SessionCardExpanded
                session={{
                    id: 'session-1',
                    name: 'Standard Practice Session',
                    notes: [
                        { id: 'note-1', is_nano_goal: true, nano_goal_completed: true, nano_goal_id: 'nano-1' },
                        { id: 'note-2', is_nano_goal: true, nano_goal_completed: true, nano_goal_id: 'nano-2' },
                        { id: 'note-3', is_nano_goal: true, nano_goal_completed: false, nano_goal_id: 'nano-3' },
                    ],
                    short_term_goals: [
                        {
                            id: 'ultimate-1',
                            type: 'UltimateGoal',
                            name: 'Master performance',
                            completed: true,
                            completed_at: '2026-03-12T15:10:00Z',
                            children: [],
                        },
                        {
                            id: 'short-1',
                            type: 'ShortTermGoal',
                            name: 'Lock the arrangement',
                            completed: true,
                            completed_at: '2026-03-12T15:15:00Z',
                            children: [],
                        },
                        {
                            id: 'old-goal',
                            type: 'ImmediateGoal',
                            name: 'Completed outside session',
                            completed: true,
                            completed_at: '2026-03-11T15:22:00Z',
                            children: [],
                        },
                    ],
                    immediate_goals: [],
                    micro_goals: [
                        {
                            id: 'micro-1',
                            type: 'MicroGoal',
                            name: 'Clean up bar 8',
                            completed: true,
                            completed_at: '2026-03-12T15:20:00Z',
                            children: [],
                        },
                    ],
                    attributes: {
                        updated_at: '2026-03-12T15:43:00Z',
                        session_data: {
                            session_start: '2026-03-12T15:04:00Z',
                            session_end: '2026-03-12T15:43:00Z',
                            sections: [],
                        },
                    },
                }}
                rootId="root-1"
                activities={[]}
                isSelected={false}
                onSelect={() => {}}
                getGoalColor={(goal) => {
                    const type = typeof goal === 'string' ? goal : goal?.type || goal?.attributes?.type;
                    const colors = {
                        UltimateGoal: '#ff9800',
                        LongTermGoal: '#8bc34a',
                        MidTermGoal: '#03a9f4',
                        ShortTermGoal: '#3f51b5',
                        ImmediateGoal: '#009688',
                        MicroGoal: '#e91e63',
                        NanoGoal: '#9c27b0',
                    };
                    return colors[type] || '#607d8b';
                }}
                formatDate={(value) => value}
                sessionActivityInstances={[]}
            />,
            {
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
                withTimezone: false,
            }
        );

        const ultimateGoal = screen.getByText('Master performance');
        const shortTermGoal = screen.getByText('Lock the arrangement');
        const microGoal = screen.getByText('Clean up bar 8');
        const nanoSummary = screen.getByText('2 Nano Goals Completed');

        expect(ultimateGoal.compareDocumentPosition(shortTermGoal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(shortTermGoal.compareDocumentPosition(microGoal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(microGoal.compareDocumentPosition(nanoSummary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        expect(screen.queryByText('Slow rep')).not.toBeInTheDocument();
        expect(screen.queryByText('Completed outside session')).not.toBeInTheDocument();
    });

    it('shows a goal completed in the session when completed_session_id matches without relying on timestamps', () => {
        renderWithProviders(
            <SessionCardExpanded
                session={{
                    id: 'session-2',
                    name: 'Open Session',
                    notes: [],
                    short_term_goals: [],
                    immediate_goals: [
                        {
                            id: 'goal-1',
                            type: 'ImmediateGoal',
                            name: 'Manual completion',
                            completed: true,
                            completed_at: '2026-03-12T18:10:00Z',
                            completed_session_id: 'session-2',
                            children: [],
                        },
                    ],
                    micro_goals: [],
                    attributes: {
                        updated_at: '2026-03-12T17:30:00Z',
                        session_data: {
                            session_start: '2026-03-12T17:00:00Z',
                            session_end: null,
                            sections: [],
                        },
                    },
                }}
                rootId="root-1"
                activities={[]}
                isSelected={false}
                onSelect={() => {}}
                getGoalColor={(goal) => {
                    const type = typeof goal === 'string' ? goal : goal?.type || goal?.attributes?.type;
                    const colors = {
                        ImmediateGoal: '#009688',
                        NanoGoal: '#9c27b0',
                    };
                    return colors[type] || '#607d8b';
                }}
                formatDate={(value) => value}
                sessionActivityInstances={[]}
            />,
            {
                withAuth: false,
                withGoalLevels: false,
                withTheme: false,
                withTimezone: false,
            }
        );

        expect(screen.getByText('Manual completion')).toBeInTheDocument();
    });
});
