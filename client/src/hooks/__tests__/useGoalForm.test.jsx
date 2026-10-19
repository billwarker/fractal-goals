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
                            inherit_parent_activities: true,
                            track_activities: true,
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
                    inherit_parent_activities: false,
                    track_activities: false,
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

    it('hydrates the completion condition from top-level session hierarchy goal nodes', () => {
        const { result } = renderHook(() => useGoalForm({
            id: 'goal-1',
            name: 'Session Goal',
            completion_condition: 'activity_threshold',
            started_at: '2026-03-01T00:00:00Z',
            condition: {
                activity_definition_id: 'activity-1',
                kind: 'single_session',
                measure: 'sets',
                min_sets: 3,
                rules: [{ metric_definition_id: 'speed', operator: '>=', value: 80 }],
            },
            attributes: {
                id: 'goal-1',
                description: 'From session hierarchy',
            },
        }, 'view'));

        expect(result.current.completionCondition).toBe('activity_threshold');
        expect(result.current.conditionDraft).toEqual(expect.objectContaining({
            activity_definition_id: 'activity-1',
            min_sets: '3',
            rules: [{ metric_definition_id: 'speed', operator: '>=', value: '80' }],
        }));
    });

    it('starts create mode from the supplied initial completion', () => {
        const conditionDraft = { activity_definition_id: 'activity-1', kind: 'cumulative', rules: [] };
        const { result } = renderHook(() => useGoalForm(null, 'create', {
            completionCondition: 'activity_threshold',
            conditionDraft,
        }));

        expect(result.current.completionCondition).toBe('activity_threshold');
        expect(result.current.conditionDraft).toBe(conditionDraft);
        expect(result.current.startedAt).toBe('');
    });

    it('refreshes same-goal form state when condition content changes without timestamps', () => {
        const goalWithValue = (value) => ({
            id: 'goal-1',
            name: 'Session Goal',
            completion_condition: 'activity_threshold',
            condition: {
                activity_definition_id: 'activity-1',
                kind: 'single_session',
                rules: [{ metric_definition_id: 'speed', operator: '>=', value }],
            },
            attributes: { id: 'goal-1', description: 'Condition snapshot' },
        });
        const { result, rerender } = renderHook(
            ({ goal }) => useGoalForm(goal, 'view'),
            { initialProps: { goal: goalWithValue(80) } }
        );

        expect(result.current.conditionDraft.rules[0].value).toBe('80');

        rerender({ goal: goalWithValue(90) });

        expect(result.current.conditionDraft.rules[0].value).toBe('90');
    });

    it('refreshes same-goal form state when the completion condition switches to manual', () => {
        const { result, rerender } = renderHook(
            ({ goal }) => useGoalForm(goal, 'view'),
            {
                initialProps: {
                    goal: {
                        id: 'goal-1',
                        name: 'Session Goal',
                        completion_condition: 'children',
                        attributes: { id: 'goal-1' },
                    },
                },
            }
        );

        expect(result.current.completionCondition).toBe('children');

        rerender({ goal: { id: 'goal-1', name: 'Session Goal', completion_condition: 'manual', attributes: { id: 'goal-1' } } });

        expect(result.current.completionCondition).toBe('manual');
        expect(result.current.conditionDraft).toBeNull();
    });
});
