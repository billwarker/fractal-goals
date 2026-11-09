import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InstanceGoalIcons, { useInstanceLowestGoals } from '../InstanceGoalIcons';

const view = vi.hoisted(() => ({
    goal_tree: {
        id: 'root', name: 'Guitar', type: 'UltimateGoal', children: [
            { id: 'part', name: 'Part 1', type: 'ShortTermGoal', children: [
                { id: 'chapter', name: 'Chapter 5', type: 'ImmediateGoal', children: [] },
                { id: 'paused', name: 'Paused chapter', type: 'ImmediateGoal', paused: true, children: [] },
            ] },
            { id: 'theory', name: 'Theory', type: 'ShortTermGoal', children: [] },
        ],
    },
    activity_goal_ids_by_activity: { definition: ['part', 'theory'], lone: ['root'] },
}));
vi.mock('../../../hooks/useSessionQueries', () => ({ useSessionGoalsView: () => ({ data: view }) }));
vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({ getGoalIcon: () => 'square', getGoalColor: () => '#3366ff', getGoalSecondaryColor: () => '#112244' }),
}));

const lowestFor = (instance) => renderHook(() => useInstanceLowestGoals('root', 'session', instance))
    .result.current.map((goal) => goal.id);

describe('useInstanceLowestGoals', () => {
    it('keeps one goal per branch, the lowest, combining the definition and one-off links', () => {
        expect(lowestFor({ activity_definition_id: 'definition', associated_goal_ids: ['chapter'] }).sort()).toEqual(['chapter', 'theory']);
    });

    it('shows a goal alone on its branch even at the top of the tree', () => {
        expect(lowestFor({ activity_definition_id: 'lone' })).toEqual(['root']);
    });

    it('skips paused goals like the hierarchy, falling back up the branch', () => {
        expect(lowestFor({ activity_definition_id: 'definition', associated_goal_ids: ['paused'] }).sort()).toEqual(['part', 'theory']);
    });

    it('is empty with no associations or no instance', () => {
        expect(lowestFor({ activity_definition_id: 'unknown' })).toEqual([]);
        const { result } = renderHook(() => useInstanceLowestGoals('root', 'session', null));
        expect(result.current).toEqual([]);
    });
});

describe('InstanceGoalIcons', () => {
    const goals = Array.from({ length: 6 }, (_, index) => ({ id: `goal-${index}`, name: `Song ${index}`, type: 'ImmediateGoal' }));

    it('explains one-off links and names inherited goals', () => {
        render(<InstanceGoalIcons goals={goals.slice(0, 2)} directGoalIds={['goal-0']} />);
        const items = screen.getAllByRole('listitem');
        expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
            'Linked to Song 0 (this instance only)', 'Song 1',
        ]);
        fireEvent.focus(items[1]);
        expect(screen.getByRole('tooltip')).toHaveTextContent('Song 1');
    });

    it('collapses goals past four', () => {
        render(<InstanceGoalIcons goals={goals} />);
        expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('renders nothing without goals', () => {
        const { container } = render(<InstanceGoalIcons />);
        expect(container).toBeEmptyDOMElement();
    });
});
