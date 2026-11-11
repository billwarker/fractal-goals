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
    <NoteCard note={note} onEdit={vi.fn()} onDelete={vi.fn()} minimal {...props} />,
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
            .toEqual(['Edit', 'Manage attachments', 'Delete']);
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

describe('NoteCard pin options', () => {
    const activityNote = {
        ...note, context_type: 'activity_instance', goal_id: null, attachments: [],
        activity_instance_id: 'instance', activity_definition_id: 'bench', activity_definition_name: 'Bench Press',
    };

    it('offers only pin to next for activity notes, never pin to top', () => {
        const onCarryForward = vi.fn();
        render({ note: activityNote, onCarryForward });
        fireEvent.click(screen.getByRole('button', { name: 'Note options' }));
        const menu = screen.getByRole('menu', { name: 'Note options' });
        expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent))
            .toEqual(['Edit', 'Attach pictures, video or audio', 'Pin to next Bench Press', 'Delete']);
        fireEvent.click(within(menu).getByRole('menuitem', { name: 'Pin to next Bench Press' }));
        expect(onCarryForward).toHaveBeenCalledWith('note-1', true);
    });

    it('pins a session note to the next session', () => {
        const onCarryForward = vi.fn();
        render({ note: { ...note, context_type: 'session', goal_id: null, session_id: 's', attachments: [] }, onCarryForward });
        fireEvent.click(screen.getByRole('button', { name: 'Note options' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Pin to next session' }));
        expect(onCarryForward).toHaveBeenCalledWith('note-1', true);
    });

    it('shows a pending pin and offers to undo it, but not once it was carried', () => {
        const onCarryForward = vi.fn();
        const { unmount } = render({ note: { ...activityNote, carry_forward: 'pending' }, onCarryForward });
        const badge = screen.getByText('Pinned to next Bench Press').parentElement;
        expect(badge.querySelector('svg')).toBeInTheDocument();  // The shared pin mark.
        // In the heading row beside the menu; the time keeps its own line above the text.
        expect(badge.closest('[class*="headerActions"]')).toBeInTheDocument();
        expect(badge.closest('[class*="timeLine"]')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Note options' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Unpin from next Bench Press' }));
        expect(onCarryForward).toHaveBeenCalledWith('note-1', false);
        unmount();

        render({ note: { ...activityNote, carry_forward: 'delivered' }, onCarryForward });
        expect(screen.getByText('Carried to next Bench Press')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Note options' }));
        expect(screen.queryByRole('menuitem', { name: /next Bench Press/ })).not.toBeInTheDocument();
    });

    it('offers no next-time pin for notes without an activity or session', () => {
        render({ onCarryForward: vi.fn() });
        fireEvent.click(screen.getByRole('button', { name: 'Note options' }));
        expect(screen.queryByRole('menuitem', { name: /Pin to next/ })).not.toBeInTheDocument();
    });
});

describe('NoteCard structured reviews', () => {
    it('renders the answers instead of the derived text and offers no text editing', () => {
        const review = {
            ...note, note_kind: 'goal_review', attachments: [], content: 'Status: On track',
            review_data: { schema: 1, status: 'on_track', went_well: 'Gigged twice', change: '', next_focus: '' },
        };
        render({ note: review });
        expect(screen.getByText('Gigged twice')).toBeInTheDocument();
        expect(screen.queryByText('Status: On track')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Note options' }));
        expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'Attach pictures, video or audio' })).toBeInTheDocument();
    });

    it('heads a feed review with its goal and status, the goal name opening the goal', () => {
        const review = {
            ...note, note_kind: 'goal_review', note_type: 'goal_review_note', attachments: [], goal_name: 'Handstand push ups', goal_type: 'ShortTermGoal',
            goal_path: ['Become an Elite Calisthenics Athlete'],
            review_data: { schema: 1, status: 'on_track', went_well: 'Decent', change: '', next_focus: '' },
        };
        const onOpenGoal = vi.fn();
        renderWithProviders(
            <NoteCard note={review} onDelete={vi.fn()} onOpenGoal={onOpenGoal} showContext />,
            { withAuth: false, withGoalLevels: false },
        );
        expect(screen.queryByText('Become an Elite Calisthenics Athlete')).not.toBeInTheDocument();
        expect(screen.getAllByText('On track')).toHaveLength(1);
        expect(screen.queryByRole('link', { name: 'Open goal' })).not.toBeInTheDocument();
        const name = screen.getByRole('button', { name: 'Handstand push ups' });
        // "Goal Review: [icon] [name]", then the status.
        expect(name.parentElement).toHaveTextContent(/^Goal Review:Handstand push ups$/);
        expect(within(name.parentElement.parentElement).getByText('On track')).toBeInTheDocument();
        fireEvent.click(name);
        expect(onOpenGoal).toHaveBeenCalledWith(review);
    });

    it('opens a plain goal note\'s goal from its name, with no separate link', () => {
        const goalNote = { ...note, note_type: 'goal_note', goal_type: 'ShortTermGoal', goal_name: 'Handstand', attachments: [] };
        const onOpenGoal = vi.fn();
        renderWithProviders(
            <NoteCard note={goalNote} onDelete={vi.fn()} onOpenGoal={onOpenGoal} showContext />,
            { withAuth: false, withGoalLevels: false },
        );
        expect(screen.queryByRole('link', { name: 'Open goal' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Handstand' }));
        expect(onOpenGoal).toHaveBeenCalledWith(goalNote);
    });

    it.each(['program', 'program_date'])('links a %s note\'s name to its program, with no separate link', (contextType) => {
        const programNote = {
            ...note, context_type: contextType, context_id: 'prog', program_id: 'prog', program_name: 'End 2026 Strong',
            goal_id: null, note_type: `${contextType}_note`, calendar_date: '2026-11-10', attachments: [],
        };
        renderWithProviders(<NoteCard note={programNote} onDelete={vi.fn()} showContext />, { withAuth: false, withGoalLevels: false });
        expect(screen.queryByRole('link', { name: 'Open program' })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: /^End 2026 Strong/ })).toHaveAttribute('href', '/root/programs/prog');
    });

    it('colours a date note\'s program name by its program and its date by its block', () => {
        const dateNote = {
            ...note, context_type: 'program_date', context_id: 'prog', program_id: 'prog', program_name: 'End 2026 Strong',
            program_color: 'rgb(249, 115, 22)', block_color: 'rgb(34, 197, 94)', goal_id: null,
            note_type: 'program_date_note', calendar_date: '2026-11-10', attachments: [],
        };
        renderWithProviders(<NoteCard note={dateNote} onDelete={vi.fn()} showContext />, { withAuth: false, withGoalLevels: false });
        expect(screen.getByText('End 2026 Strong')).toHaveStyle({ color: 'rgb(249, 115, 22)' });
        expect(screen.getByText('Nov 10, 2026')).toHaveStyle({ color: 'rgb(34, 197, 94)' });
    });

    it('edits a review in its review form when the host offers one', () => {
        const review = { ...note, note_kind: 'goal_review', attachments: [], review_data: { schema: 1, status: 'on_track' } };
        const onEditReview = vi.fn();
        render({ note: review, onEditReview });
        fireEvent.click(screen.getByRole('button', { name: 'Note options' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
        expect(onEditReview).toHaveBeenCalledWith(review);
    });
});

describe('NoteOptionsMenu placement', () => {
    it('flips to left alignment instead of running off the left edge', async () => {
        const { default: NoteOptionsMenu } = await import('../NoteOptionsMenu');
        renderWithProviders(<NoteOptionsMenu label="Filter options" items={[{ label: 'Rename', onSelect: vi.fn() }]} />,
            { withAuth: false, withGoalLevels: false });
        const trigger = screen.getByRole('button', { name: 'Filter options' });
        trigger.getBoundingClientRect = () => ({ left: 40, right: 60, top: 100, bottom: 120, width: 20, height: 20 });
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(160);
        fireEvent.click(trigger);
        const menu = screen.getByRole('menu', { name: 'Filter options' });
        expect(menu.style.left).toBe('40px');
        expect(menu.style.right).toBe('');
    });
});
