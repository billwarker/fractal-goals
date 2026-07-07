import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import NoteCard from '../NoteCard';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#22d3ee',
        getGoalSecondaryColor: () => '#0f172a',
        getGoalIcon: () => 'circle',
    }),
}));

const render = (ui) => renderWithProviders(ui, { withAuth: false, withGoalLevels: false });

describe('NoteCard', () => {
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

    it('renders markdown structure for timeline notes', () => {
        render(
            <NoteCard
                note={{
                    id: 'note-1',
                    content: 'Intro line\n## Testing\n- One\n- Two',
                    created_at: '2026-04-04T13:37:00Z',
                    updated_at: '2026-04-04T13:37:00Z',
                    context_type: 'root',
                    context_id: 'root-1',
                    session_id: null,
                    activity_instance_id: null,
                    activity_definition_id: null,
                    set_index: null,
                    goal_id: null,
                    pinned_at: null,
                    is_pinned: false,
                }}
            />,
        );

        expect(screen.getByText('Intro line')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 2, name: 'Testing' })).toBeInTheDocument();
        expect(screen.getByText('One')).toBeInTheDocument();
        expect(screen.getByText('Two')).toBeInTheDocument();
    });

    it('does not offer pinning for activity set notes', () => {
        render(
            <NoteCard
                note={{
                    id: 'note-2',
                    content: 'Set-specific note',
                    created_at: '2026-04-04T13:37:00Z',
                    updated_at: '2026-04-04T13:37:00Z',
                    context_type: 'activity_instance',
                    context_id: 'instance-1',
                    activity_instance_id: 'instance-1',
                    activity_definition_id: 'activity-1',
                    activity_definition_name: 'Bench Press',
                    set_index: 0,
                    note_type: 'activity_set_note',
                    note_type_label: 'Activity Set Note',
                    goal_id: null,
                    pinned_at: null,
                    is_pinned: false,
                }}
                onPin={vi.fn()}
                onUnpin={vi.fn()}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Note options' })).not.toBeInTheDocument();
    });

    it('shows the session template name in the header for session notes', () => {
        render(
            <NoteCard
                note={{
                    id: 'note-3',
                    content: 'Template-linked note',
                    created_at: '2026-04-04T13:37:00Z',
                    updated_at: '2026-04-04T13:37:00Z',
                    context_type: 'session',
                    context_id: 'session-1',
                    session_id: 'session-1',
                    session_name: 'Session',
                    session_template_name: 'Standard Practice Session',
                    note_type: 'session_note',
                    note_type_label: 'Session Note',
                    set_index: null,
                    goal_id: null,
                    pinned_at: null,
                    is_pinned: false,
                }}
            />,
        );

        expect(screen.getByText('Session Note')).toBeInTheDocument();
        expect(screen.getByText('Standard Practice Session')).toBeInTheDocument();
    });

    it('removes the redundant trailing note word in metadata note type labels', () => {
        render(
            <NoteCard
                note={{
                    id: 'note-5',
                    content: 'Activity definition note',
                    created_at: '2026-04-04T13:37:00Z',
                    updated_at: '2026-04-04T13:37:00Z',
                    context_type: 'activity_definition',
                    context_id: 'activity-1',
                    activity_definition_id: 'activity-1',
                    activity_definition_name: 'Bench Press',
                    note_type: 'activity_definition_note',
                    note_type_label: 'Activity Definition Note',
                    set_index: null,
                    goal_id: null,
                    pinned_at: null,
                    is_pinned: false,
                }}
                noteTypeVariant="metadata"
            />,
        );

        expect(screen.getByText('Activity Definition')).toBeInTheDocument();
        expect(screen.getByText('Bench Press')).toBeInTheDocument();
        expect(screen.queryByText('Activity Definition Note')).not.toBeInTheDocument();
    });

    it('renders links in plain goal note content', () => {
        render(
            <NoteCard
                note={{
                    id: 'note-4',
                    content: 'Watch this: https://youtu.be/example?si=abc123',
                    created_at: '2026-04-04T13:37:00Z',
                    updated_at: '2026-04-04T13:37:00Z',
                    context_type: 'goal',
                    context_id: 'goal-1',
                    note_type: 'goal_note',
                    note_type_label: 'Goal Note',
                    goal_id: 'goal-1',
                    goal_name: 'Girlfriend is Better',
                    goal_type: 'mid_term',
                    set_index: null,
                    pinned_at: null,
                    is_pinned: false,
                }}
            />,
        );

        const link = screen.getByRole('link', { name: 'https://youtu.be/example?si=abc123' });
        expect(link).toHaveAttribute('href', 'https://youtu.be/example?si=abc123');
        expect(link).toHaveAttribute('target', '_blank');
    });

});
