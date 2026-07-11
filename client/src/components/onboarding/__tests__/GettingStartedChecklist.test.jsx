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
        rootId: 'root-1',
        steps: [
            { id: 'create_fractal', number: 1, title: 'Create your fractal', blurb: 'Done', done: true, path: '/', substeps: [] },
            { id: 'first_session', number: 2, title: 'Run your first session', blurb: 'Record evidence', done: false, path: '/root-1/create-session', substeps: [{ id: 'record', title: 'Record values', description: 'Add evidence.', kind: 'tracked', done: false }] },
        ],
    }),
}));

import GettingStartedChecklist from '../GettingStartedChecklist';

function LocationProbe() {
    return <div data-testid="location">{useLocation().pathname}</div>;
}

describe('GettingStartedChecklist', () => {
    it('collapses locally, opens details, deep-links, and dismisses only after confirmation', () => {
        render(<MemoryRouter><GettingStartedChecklist /><LocationProbe /></MemoryRouter>);
        expect(screen.getByText('1/2')).toBeInTheDocument();
        expect(screen.getByText('Run your first session')).toBeInTheDocument();
        expect(screen.queryByText('Create your fractal')).not.toBeInTheDocument();
        expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Previous checklist item' }));
        expect(screen.getByText('Create your fractal')).toBeInTheDocument();
        expect(screen.queryByText('Run your first session')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next checklist item' }));

        fireEvent.click(screen.getByRole('button', { name: 'Go' }));
        expect(screen.getByText('2a')).toBeInTheDocument();
        expect(screen.getByLabelText('Record values: incomplete')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Go to Record values' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/root-1/create-session');
        fireEvent.click(screen.getByRole('button', { name: 'Back to compact view' }));
        fireEvent.click(screen.getByRole('button', { name: 'Hide for now' }));
        expect(screen.queryByText('Step 2 of 2')).not.toBeInTheDocument();
        expect(dismiss).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Open detailed onboarding guide' }));
        expect(screen.getByText('2a')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss onboarding' }));
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(dismiss).toHaveBeenCalled();
    });
});
