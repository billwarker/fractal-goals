import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import NoteContextLine from '../NoteContextLine';

const renderLine = (note, props = {}) => render(<MemoryRouter><NoteContextLine note={note} {...props} /></MemoryRouter>);

const setNote = {
    id: 'n', root_id: 'r', session_id: 's', activity_instance_id: 'i', activity_set_id: 'set-3',
    activity_definition_name: 'Rows', set_metrics: [{ value: 10, name: 'Count' }],
    instance_sets: [
        { id: 'set-1', metrics: [{ value: 1, unit: 'Lbs' }, { value: 10, name: 'Count' }] },
        { id: 'set-3', metrics: [{ value: 1, unit: 'Lbs' }, { value: 10, name: 'Count' }] },
    ],
    instance_plan_note: 'Light, focus on form',
};

describe('NoteContextLine', () => {
    it('always shows the recorded sets with the noted set marked, and the plan note', () => {
        renderLine(setNote);
        const sets = screen.getByRole('list', { name: 'Rows sets' });
        expect(sets.querySelector('[aria-current="true"]')).toHaveTextContent('Set 21 Lbs · 10 Count');
        expect(screen.getByText('Plan: Light, focus on form')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open session' })).toHaveAttribute('href', '/r/session/s');
    });

    it('leaves the session link to a session group header', () => {
        renderLine(setNote, { hideLink: true });
        expect(screen.queryByRole('link', { name: 'Open session' })).not.toBeInTheDocument();
        expect(screen.getByRole('list', { name: 'Rows sets' })).toBeInTheDocument();
    });

    it('in an activity group keeps only the note\'s own set values', () => {
        renderLine(setNote, { grouped: true });
        expect(screen.getByText('10 Count')).toBeInTheDocument();
        expect(screen.queryByRole('list')).not.toBeInTheDocument();
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('shows set-free values, a goal path, and nothing for notes without context', () => {
        const { unmount } = renderLine({ id: 'm', root_id: 'r', activity_instance_id: 'i', instance_metrics: [{ value: 30, unit: 'min' }] });
        expect(screen.getByText('30 min')).toBeInTheDocument();
        unmount();

        const goal = renderLine({ id: 'g', root_id: 'r', context_type: 'goal', goal_id: 'goal', goal_path: ['Music', 'Band'] });
        expect(screen.getByText('Music › Band')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open goal' })).toBeInTheDocument();
        goal.unmount();

        const { container } = renderLine({ id: 'f', root_id: 'r', context_type: 'root' });
        expect(container).toBeEmptyDOMElement();
    });
});
