import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import SessionSection from '../SessionSection';

const {
    createCircuitDefinition,
    createCircuitRun,
    circuitDefinitionsState,
    sessionUiState,
} = vi.hoisted(() => ({
    createCircuitDefinition: vi.fn(),
    createCircuitRun: vi.fn(),
    circuitDefinitionsState: { definitions: [] },
    sessionUiState: { showActivitySelector: {} },
}));

const activity = {
    id: 'activity-1',
    name: 'Scale Practice',
    group_id: 'group-1',
};

vi.mock('../../../contexts/ActiveSessionContext', () => ({
    useActiveSessionData: () => ({
        activityInstances: [],
        activities: [activity],
        activityGroups: [{ id: 'group-1', name: 'Technique', parent_id: null }],
        circuitRuns: [],
        instancesLoading: false,
        localSessionData: null,
        rootId: 'root-1',
        sessionId: 'session-1',
        session: { completed: false },
    }),
    useActiveSessionUi: () => ({
        showActivitySelector: sessionUiState.showActivitySelector,
        setShowActivitySelector: (updater) => {
            sessionUiState.showActivitySelector = typeof updater === 'function'
                ? updater(sessionUiState.showActivitySelector)
                : updater;
        },
        draggedItem: null,
        setDraggedItem: vi.fn(),
    }),
    useActiveSessionActions: () => ({
        addActivity: vi.fn(),
        removeActivity: vi.fn(),
        duplicateActivityInstance: vi.fn(),
        clearActivityInstanceValues: vi.fn(),
        copyActivityValuesFromInstance: vi.fn(),
        moveActivity: vi.fn(),
        reorderActivity: vi.fn(),
    }),
}));

vi.mock('../../../hooks/useIsMobile', () => ({ default: () => false }));

vi.mock('../../../hooks/useCircuitQueries', () => ({
    useCircuits: () => ({ data: circuitDefinitionsState.definitions, isLoading: false }),
    useCreateCircuitRun: () => ({ mutateAsync: createCircuitRun, isPending: false }),
    useCircuitDefinitionMutations: () => ({
        createMutation: { mutateAsync: createCircuitDefinition, isPending: false },
        updateMutation: { mutateAsync: vi.fn(), isPending: false },
    }),
}));

function renderSection(sectionIndex = 0) {
    const view = () => (
        <SessionSection
            section={{ name: 'Main Practice', activity_ids: [] }}
            sectionIndex={sectionIndex}
            onFocusActivity={vi.fn()}
            selectedActivityId={null}
            onOpenActivityBuilder={vi.fn()}
        />
    );
    const result = render(view());
    fireEvent.click(screen.getByRole('button', { name: '+ Add Activity' }));
    result.rerender(view());
    fireEvent.click(screen.getByRole('tab', { name: 'Activity Circuits' }));
    return result;
}

function addBuilderActivity() {
    const builder = screen.getByRole('dialog', { name: /^Create Circuit/ });
    fireEvent.click(within(builder).getByRole('button', { name: '+ Add Activity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Technique' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Scale Practice' }));
}

describe('SessionSection circuit definition creation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        sessionUiState.showActivitySelector = {};
        circuitDefinitionsState.definitions = [];
        createCircuitDefinition.mockResolvedValue({ data: { id: 'created-circuit' } });
        createCircuitRun.mockResolvedValue({});
    });

    it('creates a circuit definition and adds it to the originating section', async () => {
        renderSection(2);
        fireEvent.click(screen.getByRole('button', { name: '+ Create New Activity Circuit' }));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Circuit' } });
        addBuilderActivity();
        fireEvent.click(screen.getByRole('button', { name: 'Save Circuit' }));

        await waitFor(() => expect(createCircuitDefinition).toHaveBeenCalledWith(expect.objectContaining({
            name: 'New Circuit',
            slots: [{ activity_definition_id: 'activity-1' }],
        })));
        await waitFor(() => expect(createCircuitRun).toHaveBeenCalledWith({
            circuitDefinitionId: 'created-circuit',
            sectionIndex: 2,
        }));
        expect(screen.queryByRole('dialog', { name: /^Create Circuit/ })).not.toBeInTheDocument();
    });

    it('copies a circuit definition before adding the copy to the section', async () => {
        circuitDefinitionsState.definitions = [{
            id: 'source-circuit',
            name: 'Technique Circuit',
            description: 'Original description',
            group_id: 'group-1',
            version: 4,
            slots: [{
                id: 'source-slot',
                activity_definition_id: 'activity-1',
                activity,
            }],
        }];
        renderSection();
        fireEvent.click(screen.getByRole('button', { name: '+ Copy Existing Activity Circuit' }));
        fireEvent.click(screen.getByRole('button', { name: 'Technique' }));
        fireEvent.click(screen.getByRole('button', { name: 'Copy Technique Circuit' }));

        expect(screen.getByLabelText('Name')).toHaveValue('Technique Circuit (Copy)');
        expect(screen.getByLabelText('Activity Group')).toHaveValue('group-1');
        fireEvent.click(screen.getByRole('button', { name: 'Save Circuit' }));

        await waitFor(() => expect(createCircuitDefinition).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Technique Circuit (Copy)',
            description: 'Original description',
            group_id: 'group-1',
            slots: [{ activity_definition_id: 'activity-1' }],
        })));
        expect(createCircuitDefinition.mock.calls[0][0]).not.toHaveProperty('version');
    });

    it('retries only session insertion when a newly created circuit could not be added', async () => {
        createCircuitRun
            .mockRejectedValueOnce(new Error('Session insertion failed'))
            .mockResolvedValueOnce({});
        renderSection();
        fireEvent.click(screen.getByRole('button', { name: '+ Create New Activity Circuit' }));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Retry Circuit' } });
        addBuilderActivity();
        fireEvent.click(screen.getByRole('button', { name: 'Save Circuit' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Session insertion failed');
        expect(screen.getByLabelText('Name')).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Retry Add to Session' }));

        await waitFor(() => expect(createCircuitRun).toHaveBeenCalledTimes(2));
        expect(createCircuitDefinition).toHaveBeenCalledTimes(1);
    });
});
