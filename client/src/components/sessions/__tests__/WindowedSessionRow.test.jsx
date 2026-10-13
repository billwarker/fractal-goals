import { act, fireEvent, render, screen } from '@testing-library/react';
import WindowedSessionRow from '../WindowedSessionRow';

it('unmounts offscreen content, pins selection, and restores keyboard focus from a spacer', () => {
    let visibility;
    const disconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
        constructor(callback) { visibility = callback; }
        observe() {}
        disconnect = disconnect;
    });
    const children = <a href="/session">Session details</a>;
    const { rerender, unmount } = render(<WindowedSessionRow label="Practice">{children}</WindowedSessionRow>);
    expect(screen.getByText('Session details')).toBeInTheDocument();
    act(() => visibility([{ isIntersecting: true }]));
    expect(screen.getByText('Session details')).toBeInTheDocument();
    act(() => visibility([{ isIntersecting: false }]));
    expect(screen.queryByText('Session details')).not.toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'View session Practice' }).focus());
    expect(screen.getByText('Session details')).toHaveFocus();
    fireEvent.blur(screen.getByText('Session details'), { relatedTarget: document.body });
    rerender(<WindowedSessionRow label="Practice" pinned>{children}</WindowedSessionRow>);
    expect(screen.getByText('Session details')).toBeInTheDocument();
    unmount();
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
});
