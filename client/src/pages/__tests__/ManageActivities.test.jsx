import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import ManageActivities from '../ManageActivities';


const { createCircuitMutation } = vi.hoisted(() => ({
    createCircuitMutation: { isPending: false, mutateAsync: vi.fn() },
}));

vi.mock('../../contexts/ActivitiesContext', () => ({
    useActivities: () => ({
        updateActivity: vi.fn(),
        deleteActivity: vi.fn(),
        deleteActivityGroup: vi.fn(),
        reorderActivityGroups: vi.fn(),
    }),
}));

vi.mock('../../hooks/useActivityQueries', () => ({
    useActivities: () => ({
        activities: [{ id: 'activity-1', name: 'Press', group_id: null }],
        isLoading: false,
    }),
    useActivityGroups: () => ({
        activityGroups: [
            { id: 'group-used', name: 'Circuit Group', parent_id: null, sort_order: 0 },
            { id: 'group-empty', name: 'Unused Group', parent_id: null, sort_order: 1 },
        ],
        isLoading: false,
    }),
}));

vi.mock('../../hooks/useSessionQueries', () => ({
    useActivityInstantiationSummary: () => ({ data: {} }),
}));

vi.mock('../../hooks/useCircuitQueries', () => ({
    useCircuits: () => ({
        data: [
            {
                id: 'circuit-1',
                name: 'Morning Circuit',
                slots: [],
                group_id: 'group-used',
            },
            {
                id: 'circuit-2',
                name: 'Ungrouped Circuit',
                slots: [],
                group_id: null,
            },
        ],
        isLoading: false,
    }),
    useCircuitDefinitionMutations: () => ({
        createMutation: createCircuitMutation,
        updateMutation: { isPending: false, mutateAsync: vi.fn() },
        archiveMutation: { isPending: false, mutateAsync: vi.fn() },
    }),
}));

vi.mock('../../components/ActivityBuilder', () => ({
    default: ({ isOpen }) => (isOpen ? <div role="dialog" aria-label="Activity builder" /> : null),
}));
vi.mock('../../components/modals/GroupBuilderModal', () => ({
    default: ({ isOpen }) => (isOpen ? <div role="dialog" aria-label="Group builder" /> : null),
}));
vi.mock('../../components/modals/ManageMetricsModal', () => ({ default: () => null }));
vi.mock('../../components/circuits/CircuitBuilderModal', () => ({
    default: ({ isOpen, onSave }) => (isOpen ? (
        <div role="dialog" aria-label="Circuit builder">
            <button type="button" onClick={() => onSave({ name: 'New circuit' })}>Save test circuit</button>
        </div>
    ) : null),
}));
vi.mock('../../components/ActivityCard', () => ({
    default: ({ activity }) => <article><h3>{activity.name}</h3></article>,
}));
vi.mock('../../components/circuits/CircuitDefinitionCard', () => ({
    default: ({ circuit }) => <article><h3>{circuit.name}</h3></article>,
}));

function renderPage() {
    return render(
        <MemoryRouter initialEntries={['/fractals/root-1/activities']}>
            <Routes>
                <Route path="/fractals/:rootId/activities" element={<ManageActivities />} />
            </Routes>
        </MemoryRouter>,
    );
}

describe('ManageActivities', () => {
    beforeEach(() => {
        createCircuitMutation.mutateAsync.mockReset().mockResolvedValue({});
    });

    it('keeps activities and circuits in separate toggle views', () => {
        renderPage();

        expect(screen.getByRole('heading', { name: 'Press' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Morning Circuit' })).not.toBeInTheDocument();
        expect(screen.getByPlaceholderText('Groups or activities')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: 'Activity Circuits' }));

        expect(screen.queryByRole('heading', { name: 'Press' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Morning Circuit' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Circuit Group' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Unused Group' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Ungrouped Activity Circuits' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Ungrouped Circuit' })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Groups or activity circuits')).toBeInTheDocument();
    });

    it('opens each existing builder from the single Create menu', () => {
        renderPage();
        const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Create' }));

        openMenu();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Activity' }));
        expect(screen.getByRole('dialog', { name: 'Activity builder' })).toBeInTheDocument();

        openMenu();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Activity Group' }));
        expect(screen.getByRole('dialog', { name: 'Group builder' })).toBeInTheDocument();

        openMenu();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Activity Circuit' }));
        expect(screen.getByRole('dialog', { name: 'Circuit builder' })).toBeInTheDocument();
    });

    it('switches to Activity Circuits after creating a circuit', async () => {
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Create' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Activity Circuit' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save test circuit' }));

        await waitFor(() => expect(createCircuitMutation.mutateAsync).toHaveBeenCalledWith({ name: 'New circuit' }));
        expect(screen.getByRole('tab', { name: 'Activity Circuits' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByRole('dialog', { name: 'Circuit builder' })).not.toBeInTheDocument();
    });
});
