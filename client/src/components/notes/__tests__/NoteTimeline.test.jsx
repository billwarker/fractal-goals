import React from 'react';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import NoteTimeline from '../NoteTimeline';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
        getGoalSecondaryColor: () => '#0f172a',
        getGoalIcon: () => 'circle',
    }),
}));

const render = (ui) => renderWithProviders(ui, { withAuth: false, withGoalLevels: false });

function note(id, overrides = {}) {
    return {
        id,
        content: `Content ${id}`,
        created_at: '2026-07-04T16:00:00Z',
        context_type: 'activity_instance',
        context_id: `instance-${id}`,
        activity_instance_id: `instance-${id}`,
        activity_definition_name: `Activity ${id}`,
        note_type: 'activity_instance_note',
        note_type_label: 'Activity Instance Note',
        is_pinned: false,
        ...overrides,
    };
}

describe('NoteTimeline timeline presentation', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn(() => null),
                setItem: vi.fn(),
                removeItem: vi.fn(),
            },
            configurable: true,
        });
    });

    it('marks sessions, activities and lone goal notes with directory icons on their lines', () => {
        const { container } = render(
            <NoteTimeline
                notes={[
                    note('a', { root_id: 'root', session_id: 's1', session_name: 'Guitar', created_at: '2026-07-04T18:21:00Z' }),
                    note('b', { root_id: 'root', session_id: 's1', session_name: 'Guitar', context_type: 'session', activity_instance_id: null, note_type: 'session_note', created_at: '2026-07-04T18:20:00Z' }),
                    note('g', { context_type: 'goal', goal_id: 'goal', goal_type: 'LongTermGoal', activity_instance_id: null, note_type: 'goal_note', created_at: '2026-07-04T18:00:00Z' }),
                ]}
                showContext
                presentation="timeline"
                noteTypeVariant="metadata"
                groupByDate
            />,
        );
        expect(container.querySelectorAll('[class*="sessionNode"]')).toHaveLength(1);
        // Only the activity note branches off the session; the session note is a plain leaf.
        expect(container.querySelectorAll('[class*="activityNode"]')).toHaveLength(1);
        // Every note's first line says something: the session note is headed, not blank.
        expect(screen.getByText('Session note')).toBeInTheDocument();
        expect(container.querySelectorAll('[class*="goalNode"]')).toHaveLength(1);
    });

    it('groups notes on the same activity instance under one activity header', () => {
        const shared = {
            root_id: 'root', session_id: 's1', session_name: 'Guitar', activity_instance_id: 'inst', context_id: 'inst',
            activity_definition_name: 'Figuring out Songs by Ear',
            instance_sets: [{ id: 'set-a', metrics: [{ value: 5, name: 'takes' }] }],
        };
        render(
            <NoteTimeline
                notes={[
                    note('a', { ...shared, created_at: '2026-07-04T18:21:00Z' }),
                    note('b', { ...shared, created_at: '2026-07-04T18:14:00Z', note_type: 'activity_set_note', set_index: 1 }),
                    note('c', { ...shared, created_at: '2026-07-04T18:09:00Z' }),
                    note('d', { root_id: 'root', session_id: 's1', session_name: 'Guitar', created_at: '2026-07-04T18:00:00Z' }),
                ]}
                showContext
                presentation="timeline"
                noteTypeVariant="metadata"
                groupByDate
            />,
        );

        const group = screen.getByRole('region', { name: 'Figuring out Songs by Ear notes' });
        expect(within(group).getByText('3 notes')).toBeInTheDocument();
        expect(within(group).getAllByText('Figuring out Songs by Ear')).toHaveLength(1);
        expect(within(group).getAllByRole('list', { name: 'Figuring out Songs by Ear sets' })).toHaveLength(1);
        expect(within(group).queryByRole('link', { name: 'Open session' })).not.toBeInTheDocument();
        const session = screen.getByRole('region', { name: 'Guitar session notes' });
        expect(within(session).getAllByRole('link', { name: 'Open session' })).toHaveLength(1);
        expect(within(session).getByRole('link', { name: 'Open session' })).toHaveAttribute('href', '/root/session/s1');
        expect(within(group).getByText('Set #2')).toBeInTheDocument();
        // Every note shows its time once, on the line directly above its text.
        const noteA = within(group).getByText('Content a').closest('[class*="noteCard"]');
        expect(within(noteA).getAllByText(/\d:\d\d/)).toHaveLength(1);
        const timeLine = noteA.querySelector('[class*="timeLine"]');
        expect(timeLine.textContent).toMatch(/\d:\d\d/);
        expect(timeLine.nextElementSibling).toHaveTextContent('Content a');
        ['Content a', 'Content b', 'Content c'].forEach((text) => expect(within(group).getByText(text)).toBeInTheDocument());
        // A single note on another instance keeps its own header and links.
        expect(within(group).queryByText('Content d')).not.toBeInTheDocument();
        expect(screen.getByText('Activity d')).toBeInTheDocument();
    });

    it('groups consecutive notes from the same session under one shared badge', () => {
        render(
            <NoteTimeline
                presentation="timeline"
                showContext
                notes={[
                    note('one', { session_id: 'session-1', session_name: 'Practice', session_template_name: 'Guitar Practice' }),
                    note('two', { session_id: 'session-1', session_name: 'Practice', session_template_name: 'Guitar Practice' }),
                ]}
            />,
        );

        const group = screen.getByRole('region', { name: 'Guitar Practice session notes' });
        expect(screen.getByText('Saturday, July 4, 2026')).toBeInTheDocument();
        expect(within(group).getByText('2 notes')).toBeInTheDocument();
        expect(within(group).getAllByText('Guitar Practice')).toHaveLength(1);
        expect(within(group).getByText('Activity one')).toBeInTheDocument();
        expect(within(group).getByText('Activity two')).toBeInTheDocument();
        expect(within(group).getAllByText('12:00 PM')).toHaveLength(2);
        expect(within(group).queryByText(/Jul 4/)).not.toBeInTheDocument();
        expect(group.querySelector('[class*="_noteCard_"]').className).toContain('_timeline_');
    });

    it('starts a new group when another note interrupts a session sequence', () => {
        render(
            <NoteTimeline
                presentation="timeline"
                notes={[
                    note('one', { session_id: 'session-1', session_template_name: 'Practice' }),
                    note('standalone', { session_id: null }),
                    note('two', { session_id: 'session-1', session_template_name: 'Practice' }),
                ]}
            />,
        );

        expect(screen.getAllByRole('region', { name: 'Practice session notes' })).toHaveLength(2);
    });

    it('keeps the legacy card presentation free of session group regions', () => {
        const { container } = render(
            <NoteTimeline notes={[note('one', { session_id: 'session-1', session_template_name: 'Practice' })]} />,
        );

        expect(screen.queryByRole('region', { name: 'Practice session notes' })).not.toBeInTheDocument();
        expect(screen.getByText('Content one')).toBeInTheDocument();
        expect(container.querySelector('[class*="_noteCard_"]').className).not.toContain('_timeline_');
    });

    it('does not repeat the session inside its group', () => {
        render(
            <NoteTimeline
                presentation="timeline"
                noteTypeVariant="metadata"
                showContext
                notes={[
                    note('session', {
                        session_id: 'session-1', session_template_name: 'Upper Body - Heavy', context_type: 'session',
                        note_type: 'session_note', note_type_label: 'Session Note', content: 'Abort tonight',
                    }),
                    note('set', { session_id: 'session-1', session_template_name: 'Upper Body - Heavy', activity_definition_name: 'Bench Press' }),
                ]}
            />,
        );

        const group = screen.getByRole('region', { name: 'Upper Body - Heavy session notes' });
        expect(group.style.getPropertyValue('--session-color')).toBe('');
        expect(within(group).getAllByText('Session note')).toHaveLength(1);  // A heading, not the session's name again.
        expect(within(group).queryByText('Session')).not.toBeInTheDocument();
        expect(within(group).queryByText('Activity Instance')).not.toBeInTheDocument();
        expect(within(group).getByText('Bench Press')).toBeInTheDocument();
        expect(within(group).getAllByText('Upper Body - Heavy')).toHaveLength(1);
    });

    it('colours a session group with its template colour', () => {
        render(
            <NoteTimeline presentation="timeline" notes={[note('one', { session_id: 's', session_template_name: 'Heavy', session_template_color: '#ef4444' })]} />,
        );
        expect(screen.getByRole('region', { name: 'Heavy session notes' }).style.getPropertyValue('--session-color')).toBe('#ef4444');
    });
});
