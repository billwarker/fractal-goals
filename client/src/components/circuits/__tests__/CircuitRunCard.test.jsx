import React from 'react';
import { fireEvent, render as testingLibraryRender, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mutateAsync = vi.fn();
const replaceActivityInstanceTags = vi.fn();
const replaceActivitySetTags = vi.fn();
vi.mock('../../../hooks/useCircuitQueries', () => ({
    useCircuitRunActions: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('../../../utils/api', () => ({
    fractalApi: {
        replaceActivityInstanceTags: (...args) => replaceActivityInstanceTags(...args),
        replaceActivitySetTags: (...args) => replaceActivitySetTags(...args),
    },
}));
import CircuitRunCard from '../CircuitRunCard';

function render(ui) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return testingLibraryRender(
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    );
}
const run = {
    id: 'run-1',
    name: 'Conditioning',
    status: 'active',
    round_count: 1,
    duration_seconds: 30,
    slots: [
        {
            id: 'slot-a',
            sort_order: 0,
            activity_name: 'Press',
            activity_definition_id: 'activity-a',
            has_sets: true,
            has_metrics: true,
            activity_instance_id: 'instance-a',
        },
        { id: 'slot-b', sort_order: 1, activity_name: 'Burpee', has_sets: false },
    ],
    rounds: [{
        id: 'round-1',
        round_number: 1,
        members: [
            { id: 'member-a', circuit_run_slot_id: 'slot-a', sort_order: 0, activity_set_id: 'set-a', metrics: [] },
            { id: 'member-b', circuit_run_slot_id: 'slot-b', sort_order: 1, activity_instance_id: 'instance-b' },
        ],
    }],
};

const definitions = [{
    id: 'activity-a',
    name: 'Press',
    has_metrics: true,
    has_splits: false,
    metric_definitions: [{ id: 'metric-weight', name: 'Weight', unit: 'lbs', input_type: 'number' }],
    split_definitions: [],
}];
describe('CircuitRunCard', () => {
    beforeEach(() => {
        mutateAsync.mockReset();
        replaceActivityInstanceTags.mockReset().mockResolvedValue({ data: { tags: [], version: 3 } });
        replaceActivitySetTags.mockReset().mockResolvedValue({ data: { tags: [], version: 5 } });
    });

    it('edits activity-owned instance and direct set tags on circuit members', async () => {
        const activityTags = [
            { id: 'tag-parent', name: 'Meet prep', archived: false },
            { id: 'tag-heavy', name: 'Heavy', archived: false },
            { id: 'tag-new', name: 'Competition', archived: false },
        ];
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{
                    ...run,
                    slots: [
                        run.slots[0],
                        { ...run.slots[1], activity_definition_id: 'activity-b', activity_instance_id: 'instance-b' },
                    ],
                }}
                itemNumber={1}
                activityDefinitions={[
                    { ...definitions[0], tags: activityTags },
                    { id: 'activity-b', name: 'Burpee', tags: activityTags, metric_definitions: [] },
                ]}
                activityInstances={[
                    {
                        id: 'instance-a',
                        tag_assignment_version: 3,
                        tags: [activityTags[0]],
                        sets: [{ id: 'set-a', tag_assignment_version: 4, tags: [activityTags[1]], metrics: [] }],
                    },
                    { id: 'instance-b', tag_assignment_version: 2, tags: [activityTags[2]], sets: [] },
                ]}
            />,
        );

        const setTags = screen.getByRole('group', { name: 'Set tags' });
        expect(within(setTags).getByText('Heavy')).toBeInTheDocument();
        expect(within(setTags).queryByText('Meet prep')).not.toBeInTheDocument();
        fireEvent.click(within(setTags).getByRole('button', { name: 'Add tag' }));
        const setPicker = within(setTags).getByRole('dialog', { name: 'Choose set tags' });
        const competitionOption = within(setPicker).getByText('Competition');
        expect(competitionOption).toBeInTheDocument();
        expect(within(setPicker).queryByText('Meet prep')).not.toBeInTheDocument();
        fireEvent.click(competitionOption);
        await waitFor(() => expect(replaceActivitySetTags).toHaveBeenCalledWith(
            'root',
            'set-a',
            ['tag-heavy', 'tag-new'],
            4,
        ));

        const instanceTags = screen.getByRole('group', { name: 'Activity tags' });
        expect(within(instanceTags).getByText('Competition')).toBeInTheDocument();
        fireEvent.click(within(instanceTags).getByText('Competition'));
        await waitFor(() => expect(replaceActivityInstanceTags).toHaveBeenCalledWith(
            'root',
            'instance-b',
            [],
            2,
        ));
    });

    it('renders the immutable activity schema captured by the circuit run', () => {
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{
                    ...run,
                    slots: [{
                        ...run.slots[0],
                        activity_schema: {
                            id: 'activity-a',
                            name: 'Press at execution',
                            has_metrics: true,
                            has_splits: false,
                            metric_definitions: [{
                                id: 'metric-weight',
                                name: 'Historical Load',
                                unit: 'kg',
                                input_type: 'number',
                            }],
                            split_definitions: [],
                        },
                    }],
                    rounds: [{
                        ...run.rounds[0],
                        members: [run.rounds[0].members[0]],
                    }],
                }}
                itemNumber={1}
                activityInstances={[]}
                activityDefinitions={definitions}
            />
        );

        expect(screen.getByText('Historical Load')).toBeInTheDocument();
        expect(screen.queryByText('Weight')).not.toBeInTheDocument();
    });

    it('keeps timing controls only on the circuit container', () => {
        mutateAsync.mockResolvedValue({ data: run });
        render(<CircuitRunCard rootId="root" sessionId="session" run={run} itemNumber={3} activityInstances={[]} />);

        expect(screen.getByText('1 round')).toBeInTheDocument();
        expect(screen.queryByText('1 rounds')).not.toBeInTheDocument();
        expect(screen.getByText('Round 1')).toBeInTheDocument();
        expect(screen.getByText('#1.1')).toBeInTheDocument();
        expect(screen.getByText('#1.2')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Complete circuit' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /start round/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument();
        expect(screen.getAllByText('Duration')).toHaveLength(1);
    });

    it('shows the shared start, stop, and duration fields before a circuit starts', () => {
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{
                    ...run,
                    status: 'planned',
                    time_start: null,
                    time_stop: null,
                    duration_seconds: null,
                }}
                itemNumber={3}
                activityInstances={[]}
            />,
        );

        expect(screen.getByLabelText('Start')).toHaveAttribute('placeholder', 'YYYY-MM-DD HH:MM:SS');
        expect(screen.getByLabelText('Stop')).toHaveAttribute('placeholder', 'YYYY-MM-DD HH:MM:SS');
        expect(screen.getByLabelText('Circuit duration')).toHaveAttribute('placeholder', 'MM:SS');
        const startButton = screen.getByRole('button', { name: 'Start' });
        const completeButton = screen.getByRole('button', { name: 'Complete circuit' });
        expect(startButton).toBeEnabled();
        expect(completeButton).toBeEnabled();
        expect(startButton.className).toMatch(/startButton/);
        expect(completeButton.className).toMatch(/completeButton/);
        expect(startButton.className).not.toMatch(/secondary/);
        expect(completeButton.className).not.toMatch(/secondary/);
    });

    it('reflects completed circuit timestamps and duration in the shared timer fields', () => {
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{
                    ...run,
                    status: 'completed',
                    time_start: '2026-07-28T13:00:00.000Z',
                    time_stop: '2026-07-28T13:01:30.000Z',
                    duration_seconds: 90,
                }}
                itemNumber={3}
                activityInstances={[]}
            />,
        );

        expect(screen.getByLabelText('Start')).not.toHaveValue('');
        expect(screen.getByLabelText('Stop')).not.toHaveValue('');
        expect(screen.getByText('01:30')).toBeInTheDocument();
        expect(screen.queryByLabelText('Circuit duration')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Complete circuit' })).not.toBeInTheDocument();
        expect(screen.getByText('Completed')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reset/i })).toBeEnabled();
    });

    it('keeps planned lifecycle controls visible but disabled for a completed session', () => {
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{
                    ...run,
                    status: 'planned',
                    time_start: null,
                    time_stop: null,
                    duration_seconds: null,
                }}
                itemNumber={3}
                activityInstances={[]}
                disabled
            />,
        );

        expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Complete circuit' })).toBeDisabled();
    });

    it('treats circuit pause and resume as parent-session lifecycle actions', () => {
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{
                    ...run,
                    status: 'paused',
                    is_paused: true,
                    time_start: '2026-07-28T13:00:00.000Z',
                    last_paused_at: '2026-07-28T13:00:30.000Z',
                }}
                itemNumber={3}
                activityInstances={[]}
            />,
        );

        expect(screen.getByText('Paused')).toHaveAttribute(
            'title',
            'Resume the session to continue this circuit',
        );
        expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Complete circuit' })).toBeEnabled();
        expect(screen.getByRole('button', { name: /reset/i })).toBeEnabled();
    });

    it('starts and completes a planned circuit from its top-level controls', async () => {
        mutateAsync.mockResolvedValue({ data: run });
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{
                    ...run,
                    status: 'planned',
                    time_start: null,
                    time_stop: null,
                    duration_seconds: null,
                }}
                itemNumber={3}
                activityInstances={[]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Start' }));
        await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
            action: 'startRun',
            runId: 'run-1',
        }));
        fireEvent.click(screen.getByRole('button', { name: 'Complete circuit' }));
        await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
            action: 'completeRun',
            runId: 'run-1',
        }));
    });

    it('coordinates member indexes to their round and ordered activity position', () => {
        const secondRound = {
            id: 'round-2',
            round_number: 2,
            members: [
                { id: 'member-2-a', circuit_run_slot_id: 'slot-a', sort_order: 0, activity_set_id: 'set-2-a', metrics: [] },
                { id: 'member-2-b', circuit_run_slot_id: 'slot-b', sort_order: 1, activity_instance_id: 'instance-2-b' },
            ],
        };
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{ ...run, round_count: 2, rounds: [...run.rounds, secondRound] }}
                itemNumber={3}
                activityInstances={[]}
            />,
        );

        expect(screen.getByText('#1.1')).toBeInTheDocument();
        expect(screen.getByText('#1.2')).toBeInTheDocument();
        expect(screen.getByText('#2.1')).toBeInTheDocument();
        expect(screen.getByText('#2.2')).toBeInTheDocument();
        expect(screen.queryByText('#3.1')).not.toBeInTheDocument();
    });

    it('collapses rounds while preserving the circuit clock', () => {
        mutateAsync.mockResolvedValue({ data: run });
        render(<CircuitRunCard rootId="root" sessionId="session" run={run} itemNumber={3} activityInstances={[]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Collapse details' }));
        expect(screen.queryByText('Round 1')).not.toBeInTheDocument();
        expect(screen.getByText('Duration')).toBeInTheDocument();
    });

    it('does not expose the removed completed-run history correction workflow', () => {
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{ ...run, status: 'completed' }}
                itemNumber={3}
                activityInstances={[]}
            />,
        );
        expect(screen.queryByRole('button', { name: /correct history/i })).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/correct circuit history/i)).not.toBeInTheDocument();
        expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('resets a completed circuit using the same active lifecycle control as an activity', async () => {
        mutateAsync.mockResolvedValue({ data: run });
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{
                    ...run,
                    status: 'completed',
                    time_start: '2026-07-28T13:00:00.000Z',
                    time_stop: '2026-07-28T13:01:30.000Z',
                }}
                itemNumber={3}
                activityInstances={[]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /reset/i }));
        await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
            action: 'resetRun',
            runId: 'run-1',
        }));
    });

    it('offers shared relative start and stop adjustments when the circuit is selected', async () => {
        mutateAsync.mockResolvedValue({ data: run });
        const completedRun = {
            ...run,
            status: 'completed',
            time_start: '2026-07-28T13:00:00.000Z',
            time_stop: '2026-07-28T13:01:30.000Z',
            duration_seconds: 90,
        };
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={completedRun}
                itemNumber={3}
                activityInstances={[]}
                selectedCircuitItem={{ type: 'run', runId: 'run-1', id: 'run-1' }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Adjust start time' }));
        fireEvent.change(screen.getByLabelText('Relative start adjustment'), { target: { value: '+10S' } });
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
            action: 'updateRunTiming',
            inlineError: true,
            runId: 'run-1',
            value: { time_start: '2026-07-28T13:00:10.000Z' },
        }));
        expect(screen.getByRole('button', { name: 'Adjust stop time' })).toBeInTheDocument();
    });

    it('adjusts an active circuit start before a stop exists', async () => {
        mutateAsync.mockResolvedValue({ data: run });
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{
                    ...run,
                    status: 'active',
                    time_start: '2026-07-28T13:00:00.000Z',
                    time_stop: null,
                    duration_seconds: null,
                }}
                itemNumber={3}
                activityInstances={[]}
                selectedCircuitItem={{ type: 'run', runId: 'run-1', id: 'run-1' }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Adjust start time' }));
        fireEvent.change(screen.getByLabelText('Relative start adjustment'), { target: { value: '-10M' } });
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
            action: 'updateRunTiming',
            inlineError: true,
            runId: 'run-1',
            value: { time_start: '2026-07-28T12:50:00.000Z' },
        }));
        await waitFor(() => expect(screen.queryByLabelText('Relative start adjustment')).not.toBeInTheDocument());
    });

    it('does not offer boundary corrections after a circuit has accumulated paused time', () => {
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{
                    ...run,
                    status: 'completed',
                    time_start: '2026-07-28T13:00:00.000Z',
                    time_stop: '2026-07-28T13:01:30.000Z',
                    total_paused_seconds: 15,
                }}
                itemNumber={3}
                activityInstances={[]}
                selectedCircuitItem={{ type: 'run', runId: 'run-1', id: 'run-1' }}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Adjust start time' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Adjust stop time' })).not.toBeInTheDocument();
    });

    it('removes a round from its top-right collection action', async () => {
        mutateAsync.mockResolvedValue({ data: run });
        const secondRound = {
            ...run.rounds[0],
            id: 'round-2',
            round_number: 2,
            members: [],
        };
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={{ ...run, round_count: 2, rounds: [...run.rounds, secondRound] }}
                itemNumber={3}
                activityInstances={[]}
            />,
        );
        expect(screen.getByText('2 rounds')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Remove round 1' }));
        await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
            action: 'removeRound',
            roundId: 'round-1',
            runId: 'run-1',
        }));
    });

    it('adds a round from the bottom collection action', async () => {
        mutateAsync.mockResolvedValue({ data: run });
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={run}
                itemNumber={3}
                activityInstances={[]}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: '+ Add Round' }));
        await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({
            action: 'addRound',
            runId: 'run-1',
        }));
    });

    it('deletes the whole circuit from the standard top-right action', async () => {
        mutateAsync.mockResolvedValue({ data: { id: run.id } });
        render(<CircuitRunCard rootId="root" sessionId="session" run={run} itemNumber={3} activityInstances={[]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Delete circuit Conditioning' }));
        await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
            action: 'deleteRun',
            runId: 'run-1',
        })));
    });

    it('saves metrics against the exact round result', async () => {
        mutateAsync.mockResolvedValue({ data: run });
        render(
            <CircuitRunCard
                rootId="root"
                sessionId="session"
                run={run}
                itemNumber={3}
                activityInstances={[{ id: 'instance-a', sets: [{ id: 'set-a' }] }]}
                activityDefinitions={definitions}
            />,
        );
        fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '135' } });
        fireEvent.blur(screen.getByLabelText('Weight'));
        expect(within(screen.getByLabelText('Press metrics')).queryByText(/^#/)).not.toBeInTheDocument();
        await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
            action: 'updateMemberMetrics',
            memberId: 'member-a',
            value: [{ metric_id: 'metric-weight', value: 135 }],
        })));
    });

});
