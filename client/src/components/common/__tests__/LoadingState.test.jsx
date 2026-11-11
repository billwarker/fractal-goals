import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import LoadingState, { SLOW_LOADING_TEXT, WAKING_SERVER_TEXT } from '../LoadingState';
import {
    SLOW_REQUEST_MS,
    resetServerWarmthForTests,
    settleRequest,
    trackRequest,
} from '../../../offline/serverWarmth';

describe('LoadingState', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetServerWarmthForTests();
    });

    afterEach(() => vi.useRealTimers());

    it('stays invisible for a fast load, then shows its label', () => {
        render(<LoadingState label="Loading sessions…" />);
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Loading sessions…')).toHaveAttribute('aria-busy', 'true');
        act(() => vi.advanceTimersByTime(200));
        expect(screen.getByRole('status')).toHaveTextContent('Loading sessions…');
    });

    it('can show at once (route and page handoffs)', () => {
        render(<LoadingState label="Loading…" delayMs={0} variant="page" />);
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('says it is still loading after a few seconds', () => {
        render(<LoadingState label="Loading notes…" />);
        act(() => vi.advanceTimersByTime(4000));
        expect(screen.getByRole('status')).toHaveTextContent(SLOW_LOADING_TEXT);
    });

    it('explains a server that may be waking up while reads are slow', () => {
        const config = { method: 'get' };
        render(<LoadingState label="Loading goals…" />);
        act(() => {
            trackRequest(config);
            vi.advanceTimersByTime(Math.max(4000, SLOW_REQUEST_MS));
        });
        expect(screen.getByRole('status')).toHaveTextContent(WAKING_SERVER_TEXT);
        act(() => settleRequest(config));
        expect(screen.getByRole('status')).toHaveTextContent(SLOW_LOADING_TEXT);
    });

    it('offers a retry when loading failed', () => {
        const onRetry = vi.fn();
        render(<LoadingState error={new Error('nope')} errorLabel="Couldn’t load notes." onRetry={onRetry} />);
        expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load notes.');
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('keeps the label for assistive tech behind a skeleton', () => {
        const { container } = render(<LoadingState label="Loading activities…" skeleton="cards" delayMs={0} />);
        expect(screen.getByRole('status')).toHaveTextContent('Loading activities…');
        expect(container.querySelectorAll('[aria-hidden="true"] span')).toHaveLength(6);
    });
});
