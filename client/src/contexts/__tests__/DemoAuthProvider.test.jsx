import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { DemoAuthProvider, useAuth } from '../AuthContext';

const { createDemoSession } = vi.hoisted(() => ({ createDemoSession: vi.fn() }));

vi.mock('../../utils/api', async (importOriginal) => ({
    ...(await importOriginal()),
    publicApi: { createDemoSession: (...args) => createDemoSession(...args) },
    setAccessToken: vi.fn(),
    clearAccessToken: vi.fn(),
}));

function Probe() {
    const { user } = useAuth();
    return <span data-testid="completed">{user ? user.preferences.completed_primary_color || 'none' : 'loading'}</span>;
}

const renderAt = (path) => render(
    <MemoryRouter basename="/demo" initialEntries={[path]}>
        <DemoAuthProvider><Probe /></DemoAuthProvider>
    </MemoryRouter>
);

describe('DemoAuthProvider', () => {
    beforeEach(() => {
        createDemoSession.mockResolvedValue({
            data: {
                token: 'demo-token',
                roots: ['root-a', 'root-b'],
                appearance: { 'root-a': { completed_primary_color: '#ffaa00' }, 'root-b': {} },
            },
        });
    });

    it('colours completed goals as the example’s owner does', async () => {
        renderAt('/demo/root-a/goals');
        expect(await screen.findByText('#ffaa00')).toBeInTheDocument();
    });

    it('falls back to the defaults for an owner without custom colours', async () => {
        renderAt('/demo/root-b/goals');
        expect(await screen.findByText('none')).toBeInTheDocument();
    });
});
