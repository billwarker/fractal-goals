import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test/test-utils';
import NoteCard from '../NoteCard';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({ getGoalColor: () => '#22d3ee', getGoalSecondaryColor: () => '#0f172a', getGoalIcon: () => 'circle' }),
}));
vi.mock('../../../hooks/useStorageConnections', () => ({ useStorageConnections: () => ({ providers: [], limits: null }) }));

const note = {
    id: 'note-1', root_id: 'root', content: 'form reference', created_at: '2026-10-27T08:51:00Z', context_type: 'goal',
    context_id: 'goal', goal_id: 'goal', is_pinned: false,
    attachments: [{ id: 'asset', name: 'Handstand.png', mime_type: 'image/png', provider: 'google_drive', available: true, alt_text: '' }],
};
const render = (props = {}) => renderWithProviders(
    <NoteCard note={note} onEdit={vi.fn()} onDelete={vi.fn()} onPin={vi.fn()} minimal {...props} />,
    { withAuth: false, withGoalLevels: false },
);

describe('NoteCard options menu', () => {
    it('renders the menu outside the card so the card never changes containment', () => {
        const { container } = render();
        const card = container.querySelector('[class*="noteCard"]');
        fireEvent.click(screen.getByRole('button', { name: 'Note options' }));
        const menu = screen.getByRole('menu', { name: 'Note options' });
        expect(card.contains(menu)).toBe(false);
        expect(card.className).not.toMatch(/menuOpen/);
        expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent))
            .toEqual(['Edit', 'Manage attachments', 'Pin note', 'Delete']);
    });

    it('closes on an outside press and on Escape without selecting anything', () => {
        const onSelect = vi.fn();
        render({ onSelect });
        const trigger = screen.getByRole('button', { name: 'Note options' });
        fireEvent.click(trigger);
        fireEvent.pointerDown(screen.getByText('form reference'));
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        fireEvent.click(trigger);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    it('opens attachment management from the menu instead of a standing button', () => {
        render();
        expect(screen.queryByRole('button', { name: 'Manage attachments' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Note options' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Manage attachments' }));
        const manager = screen.getByRole('region', { name: 'Manage attachments' });
        expect(within(manager).getByLabelText('File name in Google Drive')).toHaveValue('Handstand');
        fireEvent.click(within(manager).getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('region', { name: 'Manage attachments' })).not.toBeInTheDocument();
    });
});
