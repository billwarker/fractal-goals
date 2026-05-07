import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import GoalHierarchySelector from '../GoalHierarchySelector';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
        getGoalSecondaryColor: () => '#0f766e',
        getGoalIcon: () => 'circle',
        getScopedCharacteristics: () => ({ icon: 'circle' }),
    }),
}));

vi.mock('../../atoms/GoalIcon', () => ({
    default: () => <span>icon</span>,
}));

describe('GoalHierarchySelector', () => {
    const goals = [
        { id: 'goal-root', name: 'Root Goal', type: 'UltimateGoal', childrenIds: ['goal-child'] },
        { id: 'goal-child', name: 'Child Goal', type: 'LongTermGoal', parent_id: 'goal-root', childrenIds: ['goal-grandchild'] },
        { id: 'goal-grandchild', name: 'Grandchild Goal', type: 'ShortTermGoal', parent_id: 'goal-child', childrenIds: [] },
    ];

    it('hides the ancestor and descendant bulk controls in single select mode', () => {
        render(
            <GoalHierarchySelector
                goals={goals}
                selectedGoalIds={[]}
                onSelectionChange={vi.fn()}
                selectionMode="single"
            />
        );

        expect(screen.queryByLabelText(/Select all ancestors/i)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Select all descendants/i)).not.toBeInTheDocument();
    });

    it('selects all descendants recursively and allows child goals to be unchecked independently', () => {
        const handleSelectionChange = vi.fn();
        const view = render(
            <GoalHierarchySelector
                goals={goals}
                selectedGoalIds={[]}
                onSelectionChange={handleSelectionChange}
                selectionMode="multiple"
            />
        );

        fireEvent.click(screen.getByLabelText('Select all descendants of Root Goal'));
        expect(handleSelectionChange).toHaveBeenLastCalledWith(['goal-child', 'goal-grandchild']);

        view.rerender(
            <GoalHierarchySelector
                goals={goals}
                selectedGoalIds={['goal-child', 'goal-grandchild']}
                onSelectionChange={handleSelectionChange}
                selectionMode="multiple"
            />
        );

        fireEvent.click(screen.getByLabelText('Select Child Goal'));
        expect(handleSelectionChange).toHaveBeenLastCalledWith(['goal-grandchild']);
    });

    it('selects all ancestors recursively', () => {
        const handleSelectionChange = vi.fn();
        render(
            <GoalHierarchySelector
                goals={goals}
                selectedGoalIds={[]}
                onSelectionChange={handleSelectionChange}
                selectionMode="multiple"
            />
        );

        fireEvent.click(screen.getByLabelText('Select all ancestors of Grandchild Goal'));
        expect(handleSelectionChange).toHaveBeenLastCalledWith(['goal-child', 'goal-root']);
    });

    it('keeps filter-style connector highlighting scoped to explicitly selected goals', () => {
        const { container } = render(
            <GoalHierarchySelector
                goals={goals}
                selectedGoalIds={['goal-root', 'goal-child']}
                onSelectionChange={vi.fn()}
                selectionMode="multiple"
                connectorHighlightMode="selected"
            />
        );

        const grandchildRow = screen.getByText('Grandchild Goal').closest('[data-goal-id]');
        expect(grandchildRow.querySelectorAll('[data-connector-active="true"]')).toHaveLength(0);
        expect(container.querySelectorAll('[data-connector-active="true"]').length).toBeGreaterThan(0);
    });

    it('does not activate connectors for a direct filter-style child selection', () => {
        const { container } = render(
            <GoalHierarchySelector
                goals={goals}
                selectedGoalIds={['goal-grandchild']}
                onSelectionChange={vi.fn()}
                selectionMode="multiple"
                connectorHighlightMode="bulk"
                showGoalHighlightHalo
            />
        );

        expect(container.querySelectorAll('[class*="sessionIconSlotBranchActive"]')).toHaveLength(1);
        expect(container.querySelectorAll('[data-connector-active="true"]')).toHaveLength(0);
    });

    it('uses the ancestor control to explicitly select parents in filter-style mode', () => {
        const handleSelectionChange = vi.fn();
        render(
            <GoalHierarchySelector
                goals={goals}
                selectedGoalIds={['goal-grandchild']}
                onSelectionChange={handleSelectionChange}
                selectionMode="multiple"
                connectorHighlightMode="selected"
            />
        );

        const ancestorControl = screen.getByLabelText('Select all ancestors of Grandchild Goal');
        expect(ancestorControl).toBeEnabled();

        fireEvent.click(ancestorControl);
        expect(handleSelectionChange).toHaveBeenLastCalledWith(['goal-grandchild', 'goal-child', 'goal-root']);
    });

    it('enables ancestor controls when parent ids are only available on normalized goals', () => {
        render(
            <GoalHierarchySelector
                goals={[
                    { id: 'goal-root', attributes: { id: 'goal-root', name: 'Root Goal', type: 'UltimateGoal' } },
                    {
                        id: 'goal-child',
                        attributes: {
                            id: 'goal-child',
                            name: 'Child Goal',
                            type: 'LongTermGoal',
                            parent_id: 'goal-root',
                        },
                    },
                ]}
                selectedGoalIds={[]}
                onSelectionChange={vi.fn()}
                selectionMode="multiple"
                connectorHighlightMode="bulk"
            />
        );

        expect(screen.getByLabelText('Select all ancestors of Child Goal')).toBeEnabled();
    });

    it('can hide completed goals from the hierarchy', () => {
        render(
            <GoalHierarchySelector
                goals={[
                    { id: 'active-goal', name: 'Active Goal', type: 'UltimateGoal' },
                    { id: 'completed-goal', name: 'Completed Goal', type: 'LongTermGoal', completed: true },
                    { id: 'status-completed-goal', name: 'Status Completed Goal', type: 'ShortTermGoal', status: { completed: true } },
                ]}
                selectedGoalIds={[]}
                onSelectionChange={vi.fn()}
                selectionMode="multiple"
            />
        );

        expect(screen.getByText('Active Goal')).toBeInTheDocument();
        expect(screen.getByText('Completed Goal')).toBeInTheDocument();
        expect(screen.getByText('Status Completed Goal')).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Hide completed goals'));

        expect(screen.getByText('Active Goal')).toBeInTheDocument();
        expect(screen.queryByText('Completed Goal')).not.toBeInTheDocument();
        expect(screen.queryByText('Status Completed Goal')).not.toBeInTheDocument();
    });

    it('uses halos for direct filter selections and connector lines only for bulk controls', () => {
        function FilterHarness() {
            const [selectedIds, setSelectedIds] = React.useState([]);
            return (
                <GoalHierarchySelector
                    goals={goals}
                    selectedGoalIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    selectionMode="multiple"
                    connectorHighlightMode="bulk"
                    showGoalHighlightHalo
                />
            );
        }

        const { container } = render(<FilterHarness />);

        fireEvent.click(screen.getByLabelText('Select Child Goal'));
        expect(container.querySelectorAll('[class*="sessionIconSlotBranchActive"]')).toHaveLength(1);
        expect(container.querySelectorAll('[data-connector-active="true"]')).toHaveLength(0);

        fireEvent.click(screen.getByLabelText('Select all descendants of Child Goal'));
        expect(container.querySelectorAll('[class*="sessionIconSlotBranchActive"]')).toHaveLength(2);
        expect(container.querySelectorAll('[data-connector-active="true"]').length).toBeGreaterThan(0);
    });

    it('does not highlight ancestor lineage when selecting filter descendants', () => {
        function FilterHarness() {
            const [selectedIds, setSelectedIds] = React.useState([]);
            return (
                <GoalHierarchySelector
                    goals={goals}
                    selectedGoalIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    selectionMode="multiple"
                    connectorHighlightMode="bulk"
                    showGoalHighlightHalo
                />
            );
        }

        const { container } = render(<FilterHarness />);

        fireEvent.click(screen.getByLabelText('Select all descendants of Child Goal'));

        expect(container.querySelector('[data-parent-goal-id="goal-root"][data-child-goal-id="goal-child"]'))
            .toHaveAttribute('data-connector-active', 'false');
        expect(container.querySelector('[data-parent-goal-id="goal-child"][data-child-goal-id="goal-grandchild"]'))
            .toHaveAttribute('data-connector-active', 'true');
    });

    it('keeps descendant connector highlighting when selecting the bulk source goal afterward', () => {
        function FilterHarness() {
            const [selectedIds, setSelectedIds] = React.useState([]);
            return (
                <GoalHierarchySelector
                    goals={goals}
                    selectedGoalIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    selectionMode="multiple"
                    connectorHighlightMode="bulk"
                    showGoalHighlightHalo
                />
            );
        }

        const { container } = render(<FilterHarness />);

        fireEvent.click(screen.getByLabelText('Select all descendants of Child Goal'));
        expect(container.querySelector('[data-parent-goal-id="goal-child"][data-child-goal-id="goal-grandchild"]'))
            .toHaveAttribute('data-connector-active', 'true');

        fireEvent.click(screen.getByLabelText('Select Child Goal'));
        expect(container.querySelector('[data-parent-goal-id="goal-child"][data-child-goal-id="goal-grandchild"]'))
            .toHaveAttribute('data-connector-active', 'true');
    });

    it('can highlight inherited lineage for activity association mode', () => {
        const { container } = render(
            <GoalHierarchySelector
                goals={goals}
                selectedGoalIds={['goal-grandchild']}
                onSelectionChange={vi.fn()}
                selectionMode="multiple"
                highlightSelectionAncestors
                connectorHighlightMode="lineage"
            />
        );

        expect(container.querySelectorAll('[data-connector-active="true"]').length).toBeGreaterThan(0);
        expect(container.querySelector('[data-parent-goal-id="goal-root"][data-child-goal-id="goal-child"]'))
            .toHaveAttribute('data-connector-active', 'true');
        expect(container.querySelector('[data-parent-goal-id="goal-child"][data-child-goal-id="goal-grandchild"]'))
            .toHaveAttribute('data-connector-active', 'true');
    });
});
