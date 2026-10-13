import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SessionSyncIndicator from '../SessionSyncIndicator';

const { outbox, status } = vi.hoisted(() => ({
    outbox: { retry: vi.fn(), discard: vi.fn() },
    status: { current: null },
}));

vi.mock('../../../offline/OutboxContext', () => ({
    useOutbox: () => outbox,
    useOutboxStatus: () => status.current,
}));

const baseStatus = {
    enabled: true,
    online: true,
    pendingCount: 0,
    rejected: [],
    syncing: false,
    pausedForAuth: false,
    lastSyncedAt: null,
};

describe('SessionSyncIndicator', () => {
    beforeEach(() => {
        status.current = { ...baseStatus };
        outbox.retry.mockReset();
        outbox.discard.mockReset();
    });

    it('renders the fallback when offline sync is disabled', () => {
        status.current = { ...baseStatus, enabled: false };
        render(<SessionSyncIndicator sessionId="s" fallback={<span>Saved</span>} />);
        expect(screen.getByText('Saved')).toBeInTheDocument();
    });

    it('tells the user changes are safe on the device while offline', () => {
        status.current = { ...baseStatus, online: false, pendingCount: 3 };
        render(<SessionSyncIndicator sessionId="s" />);
        expect(screen.getByRole('status')).toHaveTextContent('Offline · 3 changes saved on this device');
    });

    it('shows progress while syncing', () => {
        status.current = { ...baseStatus, pendingCount: 1 };
        render(<SessionSyncIndicator sessionId="s" />);
        expect(screen.getByRole('status')).toHaveTextContent('Syncing 1 change…');
    });

    it('lets the user retry or discard a rejected change', () => {
        status.current = {
            ...baseStatus,
            rejected: [{
                opId: 'op-1',
                kind: 'session.timer',
                meta: { action: 'complete' },
                error: { message: 'Session is already completed' },
            }],
        };
        render(<SessionSyncIndicator sessionId="s" />);

        expect(screen.getByRole('status')).toHaveTextContent("1 change couldn't sync");
        fireEvent.click(screen.getByRole('button', { name: 'Review' }));
        expect(screen.getByText('Completed activity')).toBeInTheDocument();
        expect(screen.getByText('Session is already completed')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
        expect(outbox.retry).toHaveBeenCalledWith('op-1');
        expect(outbox.discard).toHaveBeenCalledWith('op-1');
    });
});
