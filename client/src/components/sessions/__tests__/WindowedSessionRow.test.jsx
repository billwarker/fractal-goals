import { act, render, screen } from '@testing-library/react';
import WindowedSessionRow from '../WindowedSessionRow';

it('keeps the actual card and its focus when selection changes without a placeholder', () => {
    const { rerender } = render(<WindowedSessionRow><a href="/session">Session details</a></WindowedSessionRow>);
    const link = screen.getByRole('link', { name: 'Session details' });
    act(() => link.focus());
    for (const pinned of [true, false, true]) {
        rerender(<WindowedSessionRow pinned={pinned}><a href="/session">Session details</a></WindowedSessionRow>);
        expect(screen.getByRole('link', { name: 'Session details' })).toBe(link);
        expect(link).toHaveFocus();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    }
});
