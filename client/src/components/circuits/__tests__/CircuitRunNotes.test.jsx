import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';

vi.mock('../../../hooks/useCircuitQueries', () => ({
    useCircuitRunActions: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
        getGoalSecondaryColor: () => '#0f172a',
        getGoalIcon: () => 'circle',
    }),
}));

import CircuitRunCard from '../CircuitRunCard';
import { getCircuitNotes } from '../circuitNoteTarget';

const render = (ui) => renderWithProviders(ui, {
    withAuth: false,
    withGoalLevels: false,
    withTimezone: false,
    withTheme: false,
});

const run = {
    id: 'run-1',
    name: 'Conditioning',
    status: 'planned',
    round_count: 1,
    slots: [{
        id: 'slot-a',
        sort_order: 0,
        activity_name: 'Press',
        activity_definition_id: 'activity-a',
        activity_instance_id: 'instance-a',
        has_sets: true,
    }],
    rounds: [{
        id: 'round-1',
        round_number: 1,
        members: [{
            id: 'member-a',
            circuit_run_slot_id: 'slot-a',
            sort_order: 0,
            activity_set_id: 'set-a',
        }],
    }],
};

const commonProps = {
    rootId: 'root',
    sessionId: 'session',
    run,
    itemNumber: 1,
    activityInstances: [{ id: 'instance-a', sets: [{ id: 'set-a' }] }],
    activityDefinitions: [],
};

describe('CircuitRunCard notes', () => {
    const circuitNote = {
        id: 'note-circuit',
        context_type: 'circuit_run',
        context_id: 'run-1',
        content: 'Whole circuit cue',
    };
    const roundNote = {
        id: 'note-round',
        context_type: 'circuit_round',
        context_id: 'round-1',
        content: 'Round cue',
    };
    const setNote = {
        id: 'note-set',
        context_type: 'activity_instance',
        context_id: 'instance-a',
        activity_instance_id: 'instance-a',
        activity_set_id: 'set-a',
        set_index: 0,
        content: 'Set cue',
    };

    it('places the circuit quick-note bar before Add Round', async () => {
        const onAddNote = vi.fn().mockResolvedValue({});
        render(<CircuitRunCard {...commonProps} onAddNote={onAddNote} />);

        const input = screen.getByPlaceholderText('Add a note about this activity circuit...');
        const addRound = screen.getByRole('button', { name: '+ Add Round' });
        expect(input.compareDocumentPosition(addRound) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        fireEvent.change(input, { target: { value: 'Whole circuit cue' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => expect(onAddNote).toHaveBeenCalledWith({
            context_type: 'circuit_run',
            context_id: 'run-1',
            session_id: 'session',
            content: 'Whole circuit cue',
        }));
    });

    it('switches between round and canonical set-note targets', async () => {
        const onAddNote = vi.fn().mockResolvedValue({});
        const { rerender } = render(
            <CircuitRunCard
                {...commonProps}
                selectedCircuitItem={{ type: 'round', runId: 'run-1', id: 'round-1' }}
                onAddNote={onAddNote}
            />,
        );
        expect(screen.getByPlaceholderText('Add a note about Round 1...')).toBeInTheDocument();

        rerender(
            <CircuitRunCard
                {...commonProps}
                selectedCircuitItem={{ type: 'member', runId: 'run-1', id: 'member-a' }}
                onAddNote={onAddNote}
            />,
        );
        const input = screen.getByPlaceholderText('Note for Press · Set #1...');
        fireEvent.change(input, { target: { value: 'Set-specific cue' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => expect(onAddNote).toHaveBeenCalledWith({
            context_type: 'activity_instance',
            context_id: 'instance-a',
            session_id: 'session',
            activity_instance_id: 'instance-a',
            activity_definition_id: 'activity-a',
            activity_set_id: 'set-a',
            content: 'Set-specific cue',
        }));
    });

    it('keeps all circuit notes visible and annotates their hierarchy after selection changes', () => {
        const props = {
            ...commonProps,
            allNotes: [circuitNote, roundNote, setNote],
            onAddNote: vi.fn(),
        };
        const { rerender } = render(
            <CircuitRunCard
                {...props}
                selectedCircuitItem={{ type: 'round', runId: 'run-1', id: 'round-1' }}
            />,
        );

        expect(screen.getByText('Whole circuit cue')).toBeInTheDocument();
        expect(screen.getByText('Round cue')).toBeInTheDocument();
        expect(screen.getByText('Set cue')).toBeInTheDocument();
        expect(screen.getAllByText('Conditioning')).toHaveLength(2);
        expect(screen.getAllByText('Round 1')).toHaveLength(2);
        expect(screen.getByText('1.1 Press · Set 1')).toBeInTheDocument();

        rerender(
            <CircuitRunCard
                {...props}
                selectedCircuitItem={{ type: 'member', runId: 'run-1', id: 'member-a' }}
            />,
        );
        expect(screen.getByText('Whole circuit cue')).toBeInTheDocument();
        expect(screen.getByText('Round cue')).toBeInTheDocument();
        expect(screen.getByText('Set cue')).toBeInTheDocument();

        rerender(<CircuitRunCard {...commonProps} allNotes={[circuitNote, roundNote, setNote]} />);
        expect(screen.getByText('Whole circuit cue')).toBeInTheDocument();
        expect(screen.getByText('Round cue')).toBeInTheDocument();
        expect(screen.getByText('Set cue')).toBeInTheDocument();
    });

    it('preserves note order and annotates non-set round activities', () => {
        const nonSetRun = {
            ...run,
            slots: [{
                ...run.slots[0],
                has_sets: false,
                activity_instance_id: null,
            }],
            rounds: [{
                ...run.rounds[0],
                members: [{
                    ...run.rounds[0].members[0],
                    activity_set_id: null,
                    activity_instance_id: 'instance-round-a',
                }],
            }],
        };
        const activityNote = {
            id: 'note-activity',
            context_type: 'activity_instance',
            context_id: 'instance-round-a',
            activity_instance_id: 'instance-round-a',
            content: 'Activity cue',
        };
        const projected = getCircuitNotes(nonSetRun, [activityNote, circuitNote]);

        expect(projected.map((note) => note.id)).toEqual(['note-activity', 'note-circuit']);
        expect(projected[0]).toMatchObject({
            context_display_name: '1.1 Press',
            note_type_label: 'Round Activity',
        });
    });
});
