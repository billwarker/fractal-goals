import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AppUpdatePrompt from '../AppUpdatePrompt';

const { status } = vi.hoisted(() => ({ status: { current: null } }));
vi.mock('../OutboxContext', () => ({ useOutboxStatus: () => status.current }));
vi.mock('../serviceWorker', () => ({
    applyAppUpdate: vi.fn(),
    isAppUpdateReady: () => true,
    subscribeAppUpdate: () => () => {},
}));

describe('AppUpdatePrompt', () => {
    beforeEach(() => {
        status.current = { pendingCount: 0, rejected: [] };
    });

    it('waits while changes are still waiting to sync', () => {
        status.current = { pendingCount: 2, rejected: [] };
        render(<AppUpdatePrompt />);
        expect(screen.queryByText(/new version/)).toBeNull();
    });

    it('is not held back by changes the server rejected', () => {
        status.current = { pendingCount: 0, rejected: [{ opId: 'r' }] };
        render(<AppUpdatePrompt />);
        expect(screen.getByText('A new version of Fractal Goals is ready.')).toBeInTheDocument();
    });
});
