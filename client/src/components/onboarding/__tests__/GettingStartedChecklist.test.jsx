import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const dismiss = vi.fn();
vi.mock('../../../contexts/OnboardingContext', () => ({
    useOnboarding: () => ({
        enabled: true,
        state: { status: 'active' },
        completedCount: 1,
        isLoading: false,
        dismiss,
        steps: [
            { id: 'create_fractal', title: 'Create your fractal', blurb: 'Done', done: true, path: '/' },
            { id: 'first_session', title: 'Run your first session', blurb: 'Record evidence', done: false, path: '/root-1/create-session' },
        ],
    }),
}));

import GettingStartedChecklist from '../GettingStartedChecklist';

function LocationProbe() {
    return <div data-testid="location">{useLocation().pathname}</div>;
}

describe('GettingStartedChecklist', () => {
    it('shows real progress, deep-links the next step, and can be dismissed', () => {
        render(<MemoryRouter><GettingStartedChecklist inline /><LocationProbe /></MemoryRouter>);
        expect(screen.getByText('1/2')).toBeInTheDocument();
        expect(screen.getByText('Run your first session')).toBeInTheDocument();
        expect(screen.queryByText('Create your fractal')).not.toBeInTheDocument();
        expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Previous checklist item' }));
        expect(screen.getByText('Create your fractal')).toBeInTheDocument();
        expect(screen.queryByText('Run your first session')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next checklist item' }));

        fireEvent.click(screen.getByRole('button', { name: 'Go' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/root-1/create-session');
        fireEvent.click(screen.getByRole('button', { name: 'Hide for now' }));
        expect(dismiss).toHaveBeenCalled();
    });
});
