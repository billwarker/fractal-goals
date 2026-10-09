import { act, render, screen } from '@testing-library/react';
import GoalHeaderTitle from '../GoalHeaderTitle';

describe('GoalHeaderTitle', () => {
    let resize;
    let disconnect;

    beforeEach(() => {
        disconnect = vi.fn();
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback) { resize = callback; }
            observe() {}
            disconnect = disconnect;
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('responds to overflow appearing and disappearing, and releases its observer', () => {
        const { unmount } = render(<GoalHeaderTitle name="Learn a long piece" />);
        const text = screen.getByText('Learn a long piece');
        const viewport = text.parentElement;
        let availableWidth = 200;
        Object.defineProperty(viewport, 'clientWidth', { get: () => availableWidth });
        Object.defineProperty(text, 'scrollWidth', { value: 350 });

        act(() => resize());
        expect(viewport).toHaveAttribute('data-overflow', 'true');
        expect(viewport).toHaveAttribute('tabindex', '0');
        expect(viewport.style.getPropertyValue('--goal-title-pan-distance')).toBe('-150px');
        expect(viewport).toHaveAttribute('title', 'Learn a long piece');

        availableWidth = 400;
        act(() => resize());
        expect(viewport).toHaveAttribute('data-overflow', 'false');
        expect(viewport).toHaveAttribute('tabindex', '-1');
        unmount();
        expect(disconnect).toHaveBeenCalledOnce();
    });

    it('restarts at the beginning when the name changes', () => {
        const { rerender } = render(<GoalHeaderTitle name="First goal" />);
        const originalText = screen.getByText('First goal');
        rerender(<GoalHeaderTitle name="Next goal" />);
        expect(originalText).not.toBeInTheDocument();
        expect(screen.getByText('Next goal').parentElement).toHaveAttribute('title', 'Next goal');
    });
});
