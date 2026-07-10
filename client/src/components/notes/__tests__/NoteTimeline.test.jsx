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
});
