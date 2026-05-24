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
                            inherit_parent_activities: true,
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
        expect(result.current.inheritParentActivities).toBe(true);

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
                    inherit_parent_activities: false,
                    track_activities: false,
                    allow_manual_completion: false,
                    targets: [],
                },
            },
        });

        expect(result.current.name).toBe('Practice Scales');
        expect(result.current.description).toBe('Fresh description');
        expect(result.current.inheritParentActivities).toBe(false);

        act(() => {
            result.current.setName('Changed again');
            result.current.resetForm();
        });

        expect(result.current.name).toBe('Practice Scales');
        expect(result.current.description).toBe('Fresh description');
    });

    it('hydrates targets from top-level session hierarchy goal nodes', () => {
        const { result } = renderHook(() => useGoalForm({
            id: 'goal-1',
            name: 'Session Goal',
            targets: [
                { id: 'target-1', name: 'Section 1', completed: false },
            ],
            attributes: {
                id: 'goal-1',
                description: 'From session hierarchy',
            },
        }, 'view'));

        expect(result.current.targets).toEqual([
            { id: 'target-1', name: 'Section 1', completed: false },
        ]);
    });

    it('refreshes same-goal form state when target revision changes', () => {
        const { result, rerender } = renderHook(
            ({ goal }) => useGoalForm(goal, 'view'),
            {
                initialProps: {
                    goal: {
                        id: 'goal-1',
                        name: 'Session Goal',
                        attributes: {
                            id: 'goal-1',
                            description: 'Empty first snapshot',
                            targets: [],
                        },
                    },
                },
            }
        );

        expect(result.current.targets).toEqual([]);

        rerender({
            goal: {
                id: 'goal-1',
                name: 'Session Goal',
                targets: [
                    { id: 'target-1', name: 'Section 1', completed: false },
                ],
                attributes: {
                    id: 'goal-1',
                    description: 'Target snapshot',
                },
            },
        });

        expect(result.current.targets).toEqual([
            { id: 'target-1', name: 'Section 1', completed: false },
        ]);
    });

    it('refreshes same-goal form state when target content changes without timestamps', () => {
        const { result, rerender } = renderHook(
            ({ goal }) => useGoalForm(goal, 'view'),
            {
                initialProps: {
                    goal: {
                        id: 'goal-1',
                        name: 'Session Goal',
                        targets: [
                            {
                                id: 'target-1',
                                name: 'Section 1',
                                completed: false,
                                metrics: [{ metric_id: 'speed', value: 80 }],
                            },
                        ],
                        attributes: {
                            id: 'goal-1',
                            description: 'Target snapshot',
                        },
                    },
                },
            }
        );

        expect(result.current.targets[0].metrics[0].value).toBe(80);

        rerender({
            goal: {
                id: 'goal-1',
                name: 'Session Goal',
                targets: [
                    {
                        id: 'target-1',
                        name: 'Section 1',
                        completed: false,
                        metrics: [{ metric_id: 'speed', value: 90 }],
                    },
                ],
                attributes: {
                    id: 'goal-1',
                    description: 'Target snapshot',
                },
            },
        });

        expect(result.current.targets[0].metrics[0].value).toBe(90);
    });
});
