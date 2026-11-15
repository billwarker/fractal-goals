import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import landingContent from '../../content/landingContent';
import Landing, { demoGoalHref, demoHref } from '../Landing';

const media = vi.hoisted(() => ({ wide: false }));
vi.mock('../../hooks/useMediaQuery', () => ({
    default: (query) => (query.includes('min-width: 1024px') ? media.wide : false),
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false, user: null }) }));
// The real preview draws React Flow; here it only shows which example it was given.
vi.mock('../../components/landing/LandingTreePreview', () => ({
    default: ({ example, goalHref }) => (
        <section aria-label={`${example.label} goal tree`}>
            <a href={goalHref(example.preview.tree.id)}>{example.preview.tree.name}</a>
        </section>
    ),
}));

// Seeded tests never fetch; an unseeded render stays loading.
vi.mock('../../utils/landingPrefetch', async (importOriginal) => ({
    ...(await importOriginal()),
    fetchLandingExamples: () => new Promise(() => {}),
}));

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
    useOptionalTheme: () => ({ resolvedTheme: 'light' }),
}));

const SNAPSHOT = {
    examples: [
        { root_id: 'chinese', label: 'Chinese', sort_order: 1, root_name: 'Become fluent in Chinese',
            icon: { shape: 'hexagon', color: '#0000ff' } },
        { root_id: 'guitar', label: 'Guitar', sort_order: 0, root_name: 'Become a skilled guitar player',
            icon: { shape: 'star', color: '#d10000' } },
    ],
};

const LEVELS = [
    { id: 'ultimate', name: 'Ultimate Goal', rank: 0, color: '#123456', secondary_color: '#000000', icon: 'pentagon' },
    { id: 'long', name: 'Long Term Goal', rank: 1, color: '#3bc57c', secondary_color: '#0f271c', icon: 'hexagon' },
];
const previewOf = (name) => ({
    levels: LEVELS,
    tree: { id: `${name}-root`, name, type: 'UltimateGoal', level_id: 'ultimate', level_name: 'Ultimate Goal', is_smart: false, children: [] },
});
const WITH_PREVIEWS = {
    examples: SNAPSHOT.examples.map((example) => ({ ...example, preview: previewOf(example.root_name) })),
};

function renderLanding(snapshot = SNAPSHOT) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (snapshot) queryClient.setQueryData(['public', 'landing-examples'], snapshot);
    return render(
        <MemoryRouter>
            <QueryClientProvider client={queryClient}>
                <Landing />
            </QueryClientProvider>
        </MemoryRouter>,
    );
}

describe('Landing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        media.wide = false;
    });

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

    it('shows the first example\'s goal tree beside the picker on desktop, following the pointer', async () => {
        media.wide = true;
        renderLanding(WITH_PREVIEWS);
        const tree = await screen.findByRole('region', { name: 'Guitar goal tree' });
        // A goal in it opens the demo on that goal.
        expect(within(tree).getByRole('link')).toHaveAttribute('href', demoGoalHref('guitar', 'Become a skilled guitar player-root'));
        expect(demoGoalHref('guitar', 'g 1')).toBe('/demo/guitar/goals?goal=g%201');

        const chinese = screen.getByRole('link', { name: /^Chinese:/ });
        fireEvent.mouseEnter(chinese);
        fireEvent.mouseLeave(chinese);
        // The tree stays on the last example pointed at; the headline goes back.
        expect(await screen.findByRole('region', { name: 'Chinese goal tree' })).toHaveTextContent('Become fluent in Chinese');
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(landingContent.hero.title);
    });

    it('keeps phones and tablets to the one column, without the tree', () => {
        renderLanding(WITH_PREVIEWS);
        expect(screen.queryByRole('region', { name: /goal tree$/ })).not.toBeInTheDocument();
    });

    it('draws each picker icon from the example\'s published levels, as the tree does', () => {
        renderLanding(WITH_PREVIEWS);
        const icons = within(screen.getByRole('list', { name: landingContent.demo.label })).getAllByTestId('goal-icon');
        expect(icons.map((icon) => icon.textContent)).toEqual(['pentagon', 'pentagon']);
    });

    it('opens on desktop in the two columns while the examples load, as the boot shell draws it', () => {
        media.wide = true;
        const { container } = renderLanding(null);
        expect(screen.getByRole('status', { name: 'Loading the demo examples' })).toBeInTheDocument();
        expect(container.querySelector('section').className).toMatch(/heroWithPreview/);
        expect(container.querySelector('main').className).toMatch(/pageWithPreview/);
    });

    it('stays one column on desktop when the published demos carry no tree to show', () => {
        media.wide = true;
        const { container } = renderLanding();
        expect(screen.queryByRole('region', { name: /goal tree$/ })).not.toBeInTheDocument();
        expect(container.querySelector('section').className).not.toMatch(/heroWithPreview/);
    });
});
