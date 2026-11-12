import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import DemoGuide from '../DemoGuide';
import { buildTourSteps } from '../demoTour';

vi.mock('../../components/atoms/GoalIcon', () => ({ default: () => <span /> }));
vi.mock('../../components/common/ThemeToggleButton', () => ({ default: () => <button type="button">Theme</button> }));
vi.mock('../Spotlight', () => ({ default: ({ selector, active }) => (active ? <i data-testid="spotlight" data-selector={selector} /> : null) }));

const tree = (id, name) => ({
    id, name, attributes: { type: 'UltimateGoal' },
    children: [{ id: `${id}-stg`, name: 'Short term', attributes: { type: 'ShortTermGoal' }, children: [] }],
});
const EXAMPLES = [
    { root_id: 'guitar', label: 'Guitar', root_name: 'Play guitar', tree: tree('guitar', 'Play guitar'), showcase: { session_id: 's-1', program_id: 'p-1' } },
    { root_id: 'spanish', label: 'Spanish', root_name: 'Speak Spanish', tree: tree('spanish', 'Speak Spanish'), sessions: [{ id: 's-9' }] },
];

function Location() {
    const location = useLocation();
    return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderGuide(path = '/guitar/goals?tour=1', onSignup = vi.fn()) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="*" element={<><DemoGuide examples={EXAMPLES} onSignup={onSignup} onExit={vi.fn()} /><Location /></>} />
            </Routes>
        </MemoryRouter>,
    );
    return onSignup;
}

describe('DemoGuide', () => {
    beforeEach(() => window.localStorage.clear());

    it('deep-links every step to the example’s showcase picks', () => {
        const steps = buildTourSteps(EXAMPLES[0]);
        expect(steps.map((step) => step.path)).toEqual([
            '/guitar/goals', '/guitar/goals?goal=guitar-stg', '/guitar/sessions', '/guitar/session/s-1',
            '/guitar/manage-activities', '/guitar/programs/p-1', '/guitar/analytics', '/guitar/notes', null,
        ]);
        expect(buildTourSteps(EXAMPLES[1])[3].path).toBe('/spanish/session/s-9');
    });

    it('walks the tour on the real pages, by button and keyboard', () => {
        renderGuide();
        expect(screen.getByRole('heading', { name: 'One ambition, broken down' })).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/guitar/goals');
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/guitar/goals?goal=guitar-stg');
        expect(screen.getByTestId('spotlight')).toHaveAttribute('data-selector', '[data-tour="goal-detail"]');
        fireEvent.keyDown(screen.getByRole('region', { name: 'Demo guide' }), { key: 'ArrowRight' });
        expect(screen.getByText('Step 3 of 9')).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent('/guitar/sessions');
    });

    it('switches examples in place, keeping the step', () => {
        renderGuide();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByRole('button', { name: 'Speak Spanish' }));
        expect(screen.getByTestId('location')).toHaveTextContent('/spanish/sessions');
        expect(screen.getByRole('button', { name: 'Speak Spanish' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByText('Step 3 of 9')).toBeInTheDocument();
    });

    it('collapses to a pill that keeps sign-up one tap away', () => {
        const onSignup = renderGuide();
        fireEvent.keyDown(screen.getByRole('region', { name: 'Demo guide' }), { key: 'Escape' });
        expect(screen.queryByRole('region', { name: 'Demo guide' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
        expect(onSignup).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Open the demo guide/ }));
        expect(screen.getByRole('region', { name: 'Demo guide' })).toBeInTheDocument();
    });

    it('ends on sign-up', () => {
        const onSignup = renderGuide('/guitar/goals');
        for (let index = 0; index < 8; index += 1) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        expect(screen.getByRole('heading', { name: 'Make it yours' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
        expect(onSignup).toHaveBeenCalled();
    });
});
