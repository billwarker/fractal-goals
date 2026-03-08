import { act, renderHook } from '@testing-library/react';

import { useGoalForm } from '../useGoalForm';

describe('useGoalForm', () => {
    it('hydrates a new goal without an initialization effect and resets to the latest goal state', () => {
        const { result, rerender } = renderHook(
            ({ goal, mode }) => useGoalForm(goal, mode),
            {
                initialProps: {
                    mode: 'edit',
                    goal: {
                        id: 'goal-1',
                        name: 'Deep Work',
                        attributes: {
                            id: 'goal-1',
                            description: 'Initial description',
                            deadline: '2026-04-01T00:00:00.000Z',
                            relevance_statement: 'Initial why',
                            completed_via_children: false,
                            track_activities: true,
                            allow_manual_completion: true,
                            targets: [],
                        },
                    },
                },
            }
        );

        expect(result.current.name).toBe('Deep Work');
        expect(result.current.description).toBe('Initial description');

        act(() => {
            result.current.setName('Edited Name');
            result.current.setDescription('Edited description');
        });

        expect(result.current.name).toBe('Edited Name');
        expect(result.current.description).toBe('Edited description');

        rerender({
            mode: 'edit',
            goal: {
                id: 'goal-2',
                name: 'Practice Scales',
                attributes: {
                    id: 'goal-2',
                    description: 'Fresh description',
                    deadline: '2026-05-01T00:00:00.000Z',
                    relevance_statement: 'Fresh why',
                    completed_via_children: true,
                    track_activities: false,
                    allow_manual_completion: false,
                    targets: [],
                },
            },
        });

        expect(result.current.name).toBe('Practice Scales');
        expect(result.current.description).toBe('Fresh description');

        act(() => {
            result.current.setName('Changed again');
            result.current.resetForm();
        });

        expect(result.current.name).toBe('Practice Scales');
        expect(result.current.description).toBe('Fresh description');
    });
});
