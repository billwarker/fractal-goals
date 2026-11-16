import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SessionSyncIndicator from '../SessionSyncIndicator';

const { outbox, status } = vi.hoisted(() => ({
    outbox: { retry: vi.fn(), discard: vi.fn(), retryNow: vi.fn() },
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

    it('says only "Offline" outside a session when nothing is queued', () => {
        status.current = { ...baseStatus, online: false };
        render(<SessionSyncIndicator idleOfflineLabel="Offline" />);
        expect(screen.getByRole('status')).toHaveTextContent(/^Offline$/);
    });

    it('says when and why it will retry, and lets the user send now', () => {
        status.current = {
            ...baseStatus,
            pendingCount: 2,
            retryAt: Date.now() + 40000,
            lastError: { status: 503 },
            oldestPendingAt: Date.now() - 1000,
        };
        render(<SessionSyncIndicator sessionId="s" />);
        expect(screen.getByRole('status')).toHaveTextContent('Retrying 2 changes in 40 s· server error 503');
        fireEvent.click(screen.getByRole('button', { name: 'Retry now' }));
        expect(outbox.retryNow).toHaveBeenCalled();
    });

    it('warns when changes have been syncing for minutes', () => {
        status.current = { ...baseStatus, pendingCount: 1, oldestPendingAt: Date.now() - 3 * 60 * 1000 };
        render(<SessionSyncIndicator sessionId="s" />);
        expect(screen.getByRole('status')).toHaveTextContent('Still syncing 1 change…');
        expect(screen.getByRole('button', { name: 'Retry now' })).toBeInTheDocument();
    });

    it('says when changes only live in this tab', () => {
        status.current = { ...baseStatus, pendingCount: 1, volatile: true };
        render(<SessionSyncIndicator sessionId="s" />);
        expect(screen.getByRole('status')).toHaveTextContent('1 change saved in this tab only · keep it open');
    });

    it('says another tab is sending the changes', () => {
        status.current = { ...baseStatus, pendingCount: 1, waitingForTab: true, oldestPendingAt: Date.now() };
        render(<SessionSyncIndicator sessionId="s" />);
        expect(screen.getByRole('status')).toHaveTextContent('Syncing 1 change from another tab…');
    });

    it('warns when changes waiting offline are close to the 7 day limit', () => {
        status.current = { ...baseStatus, online: false, pendingCount: 1, oldestPendingAt: Date.now() - 6 * 24 * 60 * 60 * 1000 };
        render(<SessionSyncIndicator sessionId="s" />);
        expect(screen.getByRole('status')).toHaveTextContent('connect soon: timings older than 7 days can’t be saved');
    });

    it('says when a refused change will be discarded', () => {
        status.current = {
            ...baseStatus,
            rejected: [{ opId: 'r', kind: 'session.pause', error: { message: 'Nope' }, rejectedAt: Date.now() - 4 * 24 * 60 * 60 * 1000 }],
        };
        render(<SessionSyncIndicator sessionId="s" />);
        fireEvent.click(screen.getByRole('button', { name: 'Review' }));
        expect(screen.getByText('Discarded in 3 days')).toBeInTheDocument();
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
