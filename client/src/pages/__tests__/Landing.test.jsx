import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import landingContent from '../../content/landingContent';
import Landing, { demoHref } from '../Landing';

const { createBetaSignup, createDemoSession, probeHealth } = vi.hoisted(() => ({
    createBetaSignup: vi.fn(),
    createDemoSession: vi.fn(() => Promise.resolve({ data: {} })),
    probeHealth: vi.fn(() => Promise.resolve({})),
}));

vi.mock('../../utils/api', () => ({
    publicApi: { createBetaSignup, createDemoSession },
    globalApi: { probeHealth },
}));
vi.mock('../../components/atoms/GoalIcon', () => ({
    default: ({ shape }) => <span data-testid="goal-icon">{shape}</span>,
}));
vi.mock('../../components/atoms/AnimatedGoalIcon', () => ({
    default: ({ shape }) => <span data-testid="animated-goal-icon">{shape}</span>,
}));
vi.mock('../../contexts/ThemeContext', () => ({
    useTheme: () => ({ resolvedTheme: 'light', setPreference: vi.fn() }),
}));

const SNAPSHOT = {
    examples: [
        { root_id: 'chinese', label: 'Chinese', sort_order: 1, root_name: 'Become fluent in Chinese',
            icon: { shape: 'hexagon', color: '#0000ff' } },
        { root_id: 'guitar', label: 'Guitar', sort_order: 0, root_name: 'Become a skilled guitar player',
            icon: { shape: 'star', color: '#d10000' } },
    ],
};

function renderLanding(snapshot = SNAPSHOT) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (snapshot) queryClient.setQueryData(['public', 'landing-examples'], snapshot);
    return render(
        <QueryClientProvider client={queryClient}>
            <Landing />
        </QueryClientProvider>,
    );
}

describe('Landing', () => {
    beforeEach(() => vi.clearAllMocks());

    it('is one hero whose call to action is the live demo of each published example', () => {
        renderLanding();
        expect(screen.getByRole('heading', { level: 1, name: landingContent.hero.title })).toBeInTheDocument();
        expect(screen.getByText(landingContent.hero.kicker)).toBeInTheDocument();
        const demos = within(screen.getByRole('list', { name: landingContent.demo.label })).getAllByRole('link');
        // Published order, each straight into the real app on that fractal with the tour on.
        expect(demos.map((link) => link.getAttribute('href'))).toEqual([demoHref('guitar'), demoHref('chinese')]);
        expect(demoHref('guitar')).toBe('/demo/guitar/goals?tour=1');
        expect(demos[0]).toHaveAccessibleName('Guitar: Become a skilled guitar player. Open the live demo');
        expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/');
        expect(screen.queryByRole('region', { name: /features|faq/i })).not.toBeInTheDocument();
        expect(probeHealth).toHaveBeenCalledTimes(1);
    });

    it('previews an example in the headline and warms a demo session once', () => {
        renderLanding();
        const guitar = screen.getByRole('link', { name: /^Guitar:/ });
        fireEvent.mouseEnter(guitar);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Become a skilled guitar player');
        fireEvent.mouseLeave(guitar);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(landingContent.hero.title);
        fireEvent.focus(screen.getByRole('link', { name: /^Chinese:/ }));
        expect(createDemoSession).toHaveBeenCalledTimes(1);
    });

    it('opens the waitlist from the hero', async () => {
        createBetaSignup.mockResolvedValue({ data: { created: true } });
        renderLanding();
        fireEvent.click(screen.getByRole('button', { name: landingContent.demo.waitlistLabel }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText(landingContent.betaForm.emailLabel), { target: { value: 'will@example.com' } });
        fireEvent.click(within(dialog).getByRole('button', { name: landingContent.betaForm.submitLabel }));
        await waitFor(() => expect(createBetaSignup).toHaveBeenCalledWith({ email: 'will@example.com' }));
        expect(await within(dialog).findByText(landingContent.betaForm.successCreatedMessage)).toBeInTheDocument();
    });

    it('leads with the waitlist when no examples are published', () => {
        renderLanding({ examples: [] });
        expect(screen.queryByRole('list')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: landingContent.betaForm.submitLabel })).toBeInTheDocument();
    });
});
