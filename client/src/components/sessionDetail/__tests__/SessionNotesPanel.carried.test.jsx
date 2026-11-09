import React from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../../test/test-utils';
import SessionNotesPanel from '../SessionNotesPanel';

vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({ getGoalColor: () => '#000', getGoalSecondaryColor: () => '#fff', getGoalIcon: () => 'circle' }),
}));
vi.mock('../../../hooks/useStorageConnections', () => ({ useStorageConnections: () => ({ providers: [], limits: null }) }));

const carried = {
    pending: [
        { id: 'from-last', root_id: 'root', content: 'Warm up the shoulder first', context_type: 'session', session_id: 's0', created_at: '2026-11-02T10:00:00Z', session_date: '2026-11-02T10:00:00Z', carry_forward: 'pending' },
        { id: 'activity', content: 'Grip wider', context_type: 'activity_instance', activity_definition_id: 'bench', carry_forward: 'pending' },
    ],
    delivered: [],
};

describe('SessionNotesPanel next-session pins', () => {
    it('lists notes pinned from the last session first, read-only but unpinnable, and pins its own notes to next', () => {
        const setCarryForward = vi.fn();
        renderWithProviders(
            <SessionNotesPanel
                rootId="root" sessionId="s1" carriedNotes={carried} setCarryForward={setCarryForward}
                notes={[{ id: 'mine', root_id: 'root', content: 'Felt strong', context_type: 'session', session_id: 's1', created_at: '2026-11-09T10:00:00Z' }]}
            />,
            { withAuth: false, withGoalLevels: false },
        );

        const items = screen.getAllByText(/Warm up the shoulder first|Felt strong/).map((node) => node.textContent);
        expect(items).toEqual(['Warm up the shoulder first', 'Felt strong']);  // The pinned note comes first.
        expect(screen.queryByText('Grip wider')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: /^Nov 2/ })).toHaveAttribute('href', '/root/session/s0');
        expect(screen.getByText('Warm up the shoulder first').closest('[class*="carriedContent"]')).toBeInTheDocument();
        expect(screen.getByText(/Pinned from/)).toBeInTheDocument();

        const [carriedMenu, ownMenu] = screen.getAllByRole('button', { name: 'Note options' });
        fireEvent.click(carriedMenu);
        expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Unpin from next session']);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Unpin from next session' }));
        expect(setCarryForward).toHaveBeenCalledWith('from-last', false);

        fireEvent.click(ownMenu);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Pin to next session' }));
        expect(setCarryForward).toHaveBeenCalledWith('mine', true);
    });
});
