import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InstanceLinkedGoalIcons from '../InstanceLinkedGoalIcons';

const tree = vi.hoisted(() => ({
    id: 'root', name: 'Guitar', type: 'UltimateGoal', children: Array.from({ length: 6 }, (_, index) => ({
        id: `goal-${index}`, name: `Song ${index}`, type: 'ImmediateGoal', is_smart: index === 0, children: [],
    })),
}));
const fractalTree = vi.hoisted(() => vi.fn(() => ({ data: tree })));
vi.mock('../../../hooks/useGoalQueries', () => ({ useFractalTree: fractalTree }));
vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({ getGoalIcon: () => 'square', getGoalColor: () => '#3366ff', getGoalSecondaryColor: () => '#112244' }),
}));

describe('InstanceLinkedGoalIcons', () => {
    it("renders each linked goal's icon with an explanation, skipping unknown goals", () => {
        render(<InstanceLinkedGoalIcons rootId="root" goalIds={['goal-1', 'missing', 'goal-0']} />);
        const items = screen.getAllByRole('listitem');
        expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
            'Linked to Song 1 (this instance only)', 'Linked to Song 0 (this instance only)',
        ]);
        expect(screen.getByRole('list', { name: 'Linked goals' })).toBeInTheDocument();
        expect(items[0].querySelector('svg')).toBeInTheDocument();
        fireEvent.focus(items[0]);
        expect(screen.getByRole('tooltip')).toHaveTextContent('Linked to Song 1 (this instance only)');
    });

    it('collapses goals past four into a +N item', () => {
        render(<InstanceLinkedGoalIcons rootId="root" goalIds={tree.children.map((goal) => goal.id)} />);
        const items = screen.getAllByRole('listitem');
        expect(items).toHaveLength(5);
        expect(items[4]).toHaveTextContent('+2');
        fireEvent.focus(items[4]);
        expect(screen.getByRole('tooltip')).toHaveTextContent('Also linked to Song 4, Song 5');
    });

    it('renders nothing without links and does not need the tree then', () => {
        const { container } = render(<InstanceLinkedGoalIcons rootId="root" goalIds={[]} />);
        expect(container).toBeEmptyDOMElement();
        expect(fractalTree).toHaveBeenLastCalledWith('root', { enabled: false });
    });
});
