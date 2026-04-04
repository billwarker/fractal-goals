import React from 'react';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import NoteCard from '../NoteCard';

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
        renderWithProviders(
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
                    nano_goal_id: null,
                    is_nano_goal: false,
                    nano_goal_completed: false,
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
});
