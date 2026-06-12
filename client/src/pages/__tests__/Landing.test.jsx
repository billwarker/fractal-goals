import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import landingContent from '../../content/landingContent';
import Landing from '../Landing';

const { createBetaSignup, getLandingExamples } = vi.hoisted(() => ({
    createBetaSignup: vi.fn(),
    getLandingExamples: vi.fn(),
}));

vi.mock('../../utils/api', () => ({
    API_BASE: '/api',
    publicApi: {
        createBetaSignup: (...args) => createBetaSignup(...args),
        getLandingExamples: (...args) => getLandingExamples(...args),
    },
}));

vi.mock('../../components/atoms/GoalIcon', () => ({
    default: ({ shape }) => <span data-testid="goal-icon">{shape}</span>,
}));

vi.mock('../../components/atoms/AnimatedGoalIcon', () => ({
    default: ({ shape }) => <span data-testid="animated-goal-icon">{shape}</span>,
}));

vi.mock('../../FlowTree', () => ({
    default: ({
        treeData,
        layoutMode,
        onNodeClick,
        selectedNodeId,
        zoomTargetNodeId,
        scopeTransitionKey,
        evidenceGoalIds,
        metricsSummary,
        programs,
    }) => {
        const firstChild = treeData.children[0];
        const displayedLeaf = firstChild?.children?.[0]?.children?.[0] || firstChild?.children?.[0] || firstChild;
        return (
            <div
                data-testid="flow-tree-demo"
                data-layout-mode={layoutMode}
                data-selected-node-id={selectedNodeId || ''}
                data-zoom-target-node-id={zoomTargetNodeId || ''}
                data-scope-transition-key={scopeTransitionKey}
                data-evidence-count={evidenceGoalIds ? evidenceGoalIds.size : 'none'}
                data-has-metrics={metricsSummary ? 'yes' : 'no'}
                data-program-count={Array.isArray(programs) ? programs.length : 'none'}
            >
                <span>{treeData.name}</span>
                {displayedLeaf && <span>{displayedLeaf.name}</span>}
                <button type="button" onClick={() => onNodeClick(firstChild)}>
                    Open mocked goal
                </button>
            </div>
        );
    },
}));

vi.mock('../../contexts/ThemeContext', () => {
    let theme = 'dark';
    return {
        ThemeProvider: ({ children }) => <>{children}</>,
        useTheme: () => ({
            theme,
            toggleTheme: () => {
                theme = theme === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', theme);
            },
        }),
    };
});

vi.mock('../../contexts/TimezoneContext', () => ({
    useTimezone: () => ({ timezone: 'America/Toronto' }),
}));

vi.mock('../../contexts/GoalsContext', () => ({
    useGoals: () => ({ setActiveRootId: vi.fn() }),
}));

vi.mock('../../contexts/GoalLevelsContext', () => ({
    GoalLevelsProvider: ({ children }) => <>{children}</>,
    useGoalLevels: () => ({
        getGoalColor: () => '#3A86FF',
        getGoalTextColor: () => '#ffffff',
        getGoalIcon: () => 'circle',
        getGoalSecondaryColor: () => '#102235',
    }),
}));

vi.mock('../../components/programs/ProgramCalendarView', () => ({
    default: ({ calendarEvents }) => (
        <div data-testid="showcase-calendar" data-event-count={calendarEvents.length}>
            Program calendar
        </div>
    ),
}));

vi.mock('react-chartjs-2', () => ({
    Bar: ({ data }) => <div data-testid="showcase-chart">{data.labels.join(', ')}</div>,
    Line: ({ data }) => <div data-testid="showcase-chart">{data.labels.join(', ')}</div>,
}));

vi.mock('../../components/ConnectedGoalDetailModal', () => ({
    default: ({ goal, readOnly, displayMode, onClose }) => (
        <aside aria-label={`${goal.name} details`}>
            <h3>{goal.name}</h3>
            <span>{readOnly ? 'Read only' : 'Editable'}</span>
            <span>{displayMode}</span>
            <button type="button" onClick={onClose} aria-label="Close goal details">Close</button>
        </aside>
    ),
}));

const publishedExamples = {
    published_at: '2026-06-09T12:00:00Z',
    examples: [
        {
            root_id: 'guitar-root',
            label: 'Guitar practice tracker',
            root_name: 'Become a skilled guitar player',
            sort_order: 0,
            evidence_goal_ids: ['guitar-musicianship', 'guitar-caged'],
            metrics_summary: { row1: { totalGoals: 4 } },
            programs: [{
                id: 'prog-1',
                name: 'Demo Program',
                goal_ids: ['guitar-musicianship'],
                start_date: '2026-01-01',
                end_date: '2026-01-31',
                blocks: [],
            }],
            sessions: [{
                id: 'session-1',
                name: 'Technique Session',
                attributes: {
                    updated_at: '2026-01-10T10:00:00Z',
                    session_data: { sections: [] },
                },
                activity_instances: [],
            }],
            activity_definitions: [{
                id: 'activity-1',
                name: 'CAGED Triads',
                metric_definitions: [{ id: 'metric-1', name: 'Reps', unit: 'count' }],
            }],
            activity_groups: [],
            analytics_charts: [{
                id: 'chart-1',
                title: 'Session Duration Trend',
                type: 'bar',
                data: {
                    labels: ['Technique Session'],
                    datasets: [{ data: [45] }],
                },
                options: {},
            }],
            session_templates: [{
                id: 'template-1',
                name: 'Practice Template',
                template_data: {
                    sections: [{
                        name: 'Warmup',
                        activities: [{ activity_id: 'activity-1', name: 'CAGED Triads' }],
                    }],
                },
            }],
            tree: {
                id: 'guitar-root',
                name: 'Become a skilled guitar player',
                type: 'UltimateGoal',
                level: { icon: 'star', color: '#66d9ef', secondary_color: '#102235' },
                attributes: { id: 'guitar-root', type: 'UltimateGoal', created_at: '2026-01-01T00:00:00Z' },
                children: [
                    {
                        id: 'guitar-musicianship',
                        name: 'Build complete musicianship',
                        type: 'LongTermGoal',
                        attributes: { id: 'guitar-musicianship', type: 'LongTermGoal', created_at: '2026-01-01T00:00:00Z' },
                        children: [
                            {
                                id: 'guitar-fretboard',
                                name: 'Map the fretboard',
                                type: 'MidTermGoal',
                                attributes: { id: 'guitar-fretboard', type: 'MidTermGoal', created_at: '2026-01-01T00:00:00Z' },
                                children: [
                                    {
                                        id: 'guitar-caged',
                                        name: 'Practice CAGED triads',
                                        type: 'ShortTermGoal',
                                        attributes: { id: 'guitar-caged', type: 'ShortTermGoal', created_at: '2026-01-01T00:00:00Z' },
                                        children: [],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        },
        {
            root_id: 'chinese-root',
            label: 'Chinese language tracker',
            root_name: 'Become fluent in Chinese',
            sort_order: 1,
            sessions: [{
                id: 'zh-session-1',
                name: 'Listening Review',
                attributes: {
                    session_data: {
                        notes: [{
                            id: 'note-1',
                            content: 'Shadowing felt smoother after the second pass.',
                            context_type: 'session',
                        }],
                        sections: [],
                    },
                },
                activity_instances: [],
            }],
            tree: {
                id: 'chinese-root',
                name: 'Become fluent in Chinese',
                type: 'UltimateGoal',
                attributes: { id: 'chinese-root', type: 'UltimateGoal', created_at: '2026-01-01T00:00:00Z' },
                children: [
                    {
                        id: 'zh-listening',
                        name: 'Build listening comprehension',
                        type: 'MidTermGoal',
                        attributes: { id: 'zh-listening', type: 'MidTermGoal', created_at: '2026-01-01T00:00:00Z' },
                        children: [
                            {
                                id: 'zh-shadow',
                                name: 'Shadow 10 minutes',
                                type: 'ImmediateGoal',
                                attributes: { id: 'zh-shadow', type: 'ImmediateGoal', created_at: '2026-01-01T00:00:00Z' },
                                children: [],
                            },
                        ],
                    },
                ],
            },
        },
    ],
};

// jsdom implements neither scrollIntoView nor IntersectionObserver; the stubs
// record calls/instances so tests can assert section jumps and drive the
// active-section observer manually.
const scrollIntoViewCalls = [];
const intersectionObservers = [];

class IntersectionObserverStub {
    constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        intersectionObservers.push(this);
    }

    observe() {}

    unobserve() {}

    disconnect() {}
}

function renderLanding() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <Landing />
        </QueryClientProvider>
    );
}

describe('Landing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getLandingExamples.mockResolvedValue({ data: publishedExamples });
        scrollIntoViewCalls.length = 0;
        intersectionObservers.length = 0;
        Element.prototype.scrollIntoView = function scrollIntoViewStub(options) {
            scrollIntoViewCalls.push({ element: this, options });
        };
        vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
    });

    afterEach(() => {
        delete Element.prototype.scrollIntoView;
        vi.unstubAllGlobals();
    });

    it('renders the beta signup page and submits a request', async () => {
        createBetaSignup.mockResolvedValue({ data: { created: true } });

        renderLanding();

        expect(screen.getByRole('heading', { name: landingContent.hero.title })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: landingContent.hero.body })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: landingContent.audience.title })).toBeInTheDocument();
        const goalLevels = screen.getByLabelText('Goal levels from ultimate to immediate');
        expect(goalLevels).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Ultimate: The identity-level ambition/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Long Term: Major directions/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Mid Term: Trackable milestones/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Short Term: Focused projects/ })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Immediate: The next concrete action/ })).toBeInTheDocument();
        expect(screen.getAllByTestId('animated-goal-icon').length).toBeGreaterThan(0);
        expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '#features');
        expect(await screen.findByRole('tab', { name: 'Guitar practice tracker' })).toHaveAttribute('aria-selected', 'true');
        expect(await screen.findByRole('tab', { name: 'Chinese language tracker' })).toBeInTheDocument();
        expect(screen.getAllByTestId('goal-icon').some((icon) => icon.textContent === 'star')).toBe(true);
        expect(screen.getByLabelText('Become a skilled guitar player goal tree')).toBeInTheDocument();
        expect(await screen.findByTestId('flow-tree-demo')).toHaveAttribute('data-layout-mode', 'tree');
        expect(screen.getAllByText('Become a skilled guitar player').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Practice CAGED triads').length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: 'Open mocked goal' }));
        expect(await screen.findByLabelText('Build complete musicianship details')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Build complete musicianship' })).toBeInTheDocument();
        expect(screen.getByText('Read only')).toBeInTheDocument();
        expect(screen.getByText('panel')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Close goal details' }));
        expect(screen.queryByLabelText('Build complete musicianship details')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: 'Chinese language tracker' }));
        expect(screen.getByRole('tab', { name: 'Chinese language tracker' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getAllByText('Shadow 10 minutes').length).toBeGreaterThan(0);
        expect(await screen.findByLabelText('Listening Review detail preview')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Session Notes' })).toBeInTheDocument();
        expect(screen.queryByText('One system, four views: goals, programs, sessions, and progress.')).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Common questions' })).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'will@example.com' } });

        fireEvent.click(screen.getByRole('button', { name: /request beta access/i }));

        await waitFor(() => {
            expect(createBetaSignup).toHaveBeenCalledWith({
                email: 'will@example.com',
            });
        });
        expect(await screen.findByText(landingContent.betaForm.successCreatedMessage)).toBeInTheDocument();
    });

    it('scopes and centers the flow tree to the clicked goal lineage', async () => {
        renderLanding();

        await screen.findByRole('tab', { name: 'Chinese language tracker' });
        const tree = await screen.findByTestId('flow-tree-demo');
        expect(tree).toHaveAttribute('data-selected-node-id', '');
        const initialScopeKey = tree.getAttribute('data-scope-transition-key');

        fireEvent.click(screen.getByRole('button', { name: 'Open mocked goal' }));

        await waitFor(() => {
            const scopedTree = screen.getByTestId('flow-tree-demo');
            expect(scopedTree).toHaveAttribute('data-selected-node-id', 'guitar-musicianship');
            expect(scopedTree).toHaveAttribute('data-zoom-target-node-id', 'guitar-musicianship');
            expect(scopedTree.getAttribute('data-scope-transition-key')).not.toBe(initialScopeKey);
        });

        // Closing the detail panel restores the full (unscoped) tree.
        fireEvent.click(await screen.findByRole('button', { name: 'Close goal details' }));
        await waitFor(() => {
            expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-selected-node-id', '');
        });
    });

    it('keeps the landing sections in document order: hero, goals, audience, features, beta', async () => {
        const { container } = renderLanding();

        const heroHeading = screen.getByRole('heading', { name: landingContent.hero.title });
        const examplesHeading = await screen.findByRole('heading', { name: landingContent.examples.title });
        const audienceHeading = screen.getByRole('heading', { name: landingContent.audience.title });
        const features = container.querySelector('#features');
        const betaHeading = screen.getByRole('heading', { name: landingContent.beta.title });

        expect(features).toBeInTheDocument();
        expect(Boolean(heroHeading.compareDocumentPosition(examplesHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(Boolean(examplesHeading.compareDocumentPosition(audienceHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(Boolean(audienceHeading.compareDocumentPosition(features) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(Boolean(features.compareDocumentPosition(betaHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(container.querySelector('#showcase')).not.toBeInTheDocument();
        expect(container.querySelector('#faq')).not.toBeInTheDocument();
    });

    it('mirrors the goals page: view-options widget, view-mode toggle, and full snapshot data', async () => {
        renderLanding();

        await screen.findByRole('tab', { name: 'Chinese language tracker' });
        const tree = await screen.findByTestId('flow-tree-demo');

        // The full FlowTreeOptionsPane widget renders (tree/hierarchy toggle + checkboxes).
        expect(screen.getByRole('button', { name: 'Tree' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Hierarchy' })).toBeInTheDocument();
        expect(screen.getByLabelText('Fade inactive branches')).toBeInTheDocument();
        expect(screen.getByLabelText('Hide inactive goals')).toBeInTheDocument();
        expect(screen.getByLabelText('Hide completed goals')).toBeInTheDocument();
        expect(screen.getByLabelText('Show metrics overlay')).toBeInTheDocument();

        // Full snapshot data reaches the FlowTree.
        expect(tree).toHaveAttribute('data-layout-mode', 'tree');
        expect(tree).toHaveAttribute('data-evidence-count', '2');
        expect(tree).toHaveAttribute('data-has-metrics', 'yes');
        expect(tree).toHaveAttribute('data-program-count', '1');

        // Switching to hierarchy view re-renders the tree in hierarchy layout.
        fireEvent.click(screen.getByRole('button', { name: 'Hierarchy' }));
        await waitFor(() => {
            expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-layout-mode', 'hierarchy');
        });
    });

    it('renders the features section with detached toggles, in-box copy, and read-only surfaces', async () => {
        const { container } = renderLanding();

        await screen.findByRole('tab', { name: 'Chinese language tracker' });
        expect(screen.getByRole('heading', { name: landingContent.features.title })).toBeInTheDocument();

        // The feature toggle row is its own tablist, not nested in the stage frame.
        const featureTabs = screen.getByRole('tablist', { name: 'Product features' });
        const stage = container.querySelector('#features [class*="featureStage"]');
        expect(stage).toBeInTheDocument();
        expect(stage.contains(featureTabs)).toBe(false);
        expect(container.querySelector('#features [class*="featureInfo"]')).not.toBeInTheDocument();

        // Session feature is the default, with its explanatory copy inside the wide stage.
        expect(screen.getByRole('tab', { name: landingContent.features.items.session.label })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('heading', { name: landingContent.features.items.session.heading })).toBeInTheDocument();
        expect(screen.getByText(landingContent.features.items.session.body)).toBeInTheDocument();
        expect(screen.getByLabelText('Technique Session detail preview')).toBeInTheDocument();
        expect(screen.getByRole('tablist', { name: 'Session side pane views' })).toBeInTheDocument();

        // Activity feature shows the activity card plus the goal lineage demo.
        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.activity.label }));
        expect(screen.getByRole('heading', { name: landingContent.features.items.activity.heading })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'CAGED Triads' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Goals this activity feeds' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.programs.label }));
        expect(screen.getByRole('heading', { name: landingContent.features.items.programs.heading })).toBeInTheDocument();
        expect(screen.getByTestId('showcase-calendar')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.analytics.label }));
        expect(screen.getByRole('heading', { name: 'Session Duration Trend' })).toBeInTheDocument();
        expect(screen.getAllByTestId('showcase-chart')[0]).toHaveTextContent('Technique Session');

        // "And more" renders the extras cards, including the live theme toggle.
        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.more.label }));
        landingContent.features.extras.forEach((extra) => {
            expect(screen.getByRole('heading', { name: extra.title })).toBeInTheDocument();
        });
        const themeBefore = document.documentElement.getAttribute('data-theme');
        fireEvent.click(screen.getByRole('button', { name: /tap for/i }));
        expect(document.documentElement.getAttribute('data-theme')).not.toBe(themeBefore);
    });

    it('honors admin showcase picks for featured session, activities, and charts', async () => {
        const showcaseExamples = JSON.parse(JSON.stringify(publishedExamples));
        const example = showcaseExamples.examples[0];
        example.sessions = [
            ...example.sessions,
            {
                id: 'session-2',
                name: 'Featured Older Session',
                attributes: { updated_at: '2026-01-02T10:00:00Z', session_data: { sections: [] } },
                activity_instances: [],
            },
        ];
        example.activity_definitions = [
            ...example.activity_definitions,
            { id: 'activity-2', name: 'Featured Scales', metric_definitions: [], associated_goal_ids: ['guitar-caged'] },
        ];
        example.analytics_charts = [
            ...example.analytics_charts,
            {
                id: 'chart-2',
                title: 'Featured Chart',
                type: 'bar',
                data: { labels: ['Featured Label'], datasets: [{ data: [1] }] },
                options: {},
            },
        ];
        example.showcase = {
            session_id: 'session-2',
            activity_ids: ['activity-2'],
            program_id: 'prog-1',
            program_start_date: '2026-01-01',
            program_end_date: '2026-01-31',
            chart_ids: ['chart-2'],
        };
        getLandingExamples.mockResolvedValue({ data: showcaseExamples });

        renderLanding();

        await screen.findByRole('tab', { name: 'Chinese language tracker' });
        // Featured session replaces the most-recent default.
        expect(screen.getByLabelText('Featured Older Session detail preview')).toBeInTheDocument();

        // Featured activity is the only chip content shown.
        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.activity.label }));
        expect(screen.getByRole('heading', { name: 'Featured Scales' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'CAGED Triads' })).not.toBeInTheDocument();
        // The featured activity's linked goal and its ancestors render in the
        // lineage (the goal name also appears inside the mocked FlowTree).
        expect(screen.getAllByText('Practice CAGED triads').length).toBeGreaterThan(1);
        expect(screen.getByText('Map the fretboard')).toBeInTheDocument();
        expect(screen.getAllByText('Build complete musicianship').length).toBeGreaterThan(0);

        // Chart curation filters to the featured chart only.
        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.analytics.label }));
        expect(screen.getByRole('heading', { name: 'Featured Chart' })).toBeInTheDocument();
        expect(screen.getAllByTestId('showcase-chart')).toHaveLength(1);
        expect(screen.getByTestId('showcase-chart')).toHaveTextContent('Featured Label');
    });

    it('opens the goal detail in the real docked side-in panel', async () => {
        const { container } = renderLanding();

        await screen.findByRole('tab', { name: 'Chinese language tracker' });
        await screen.findByTestId('flow-tree-demo');
        fireEvent.click(screen.getByRole('button', { name: 'Open mocked goal' }));

        await screen.findByLabelText('Build complete musicianship details');
        // Uses the shared docked detail-window container (carries slideInRight animation).
        expect(container.querySelector('.details-window.sidebar.docked.landing-goal-dock')).toBeInTheDocument();
    });

    it('does not flash the built-in demo while published examples are loading', async () => {
        let resolveExamples;
        getLandingExamples.mockReturnValue(new Promise((resolve) => {
            resolveExamples = resolve;
        }));

        renderLanding();

        expect(screen.queryByRole('tablist', { name: 'Example goal trees' })).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Become a skilled guitar player goal tree')).not.toBeInTheDocument();
        // All three surfaces hold their footprint with skeletons instead of unmounting.
        expect(screen.getByTestId('example-picker-skeleton')).toBeInTheDocument();
        expect(screen.getByTestId('examples-skeleton')).toBeInTheDocument();
        expect(screen.getByTestId('features-stage-skeleton')).toBeInTheDocument();

        resolveExamples({ data: publishedExamples });

        expect(await screen.findByRole('tab', { name: 'Guitar practice tracker' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByLabelText('Become a skilled guitar player goal tree')).toBeInTheDocument();
        expect(screen.queryByTestId('example-picker-skeleton')).not.toBeInTheDocument();
        expect(screen.queryByTestId('examples-skeleton')).not.toBeInTheDocument();
        expect(screen.queryByTestId('features-stage-skeleton')).not.toBeInTheDocument();
    });

    it('hosts the example picker in the hero and auto-scrolls to the goals view on pick', async () => {
        renderLanding();

        const picker = await screen.findByRole('tablist', { name: 'Example goal trees' });
        const hero = document.getElementById('hero');
        expect(hero).toBeInTheDocument();
        expect(hero.contains(picker)).toBe(true);

        // The initial default selection must not auto-scroll the page.
        expect(scrollIntoViewCalls).toHaveLength(0);

        fireEvent.click(screen.getByRole('tab', { name: 'Chinese language tracker' }));
        expect(scrollIntoViewCalls).toHaveLength(1);
        expect(scrollIntoViewCalls[0].element.id).toBe('examples');
        expect(scrollIntoViewCalls[0].options).toEqual({ behavior: 'smooth', block: 'start' });
    });

    it('jumps without animation when the user prefers reduced motion', async () => {
        vi.stubGlobal('matchMedia', (query) => ({
            matches: query === '(prefers-reduced-motion: reduce)',
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
        }));

        renderLanding();

        fireEvent.click(await screen.findByRole('tab', { name: 'Chinese language tracker' }));
        expect(scrollIntoViewCalls).toHaveLength(1);
        expect(scrollIntoViewCalls[0].options).toEqual({ behavior: 'auto', block: 'start' });
    });

    it('renders the section dot rail, tracks the active section, and jumps on click', async () => {
        renderLanding();
        await screen.findByRole('tab', { name: 'Chinese language tracker' });

        const rail = screen.getByRole('navigation', { name: 'Page sections' });
        const dots = within(rail).getAllByRole('button');
        expect(dots.map((dot) => dot.getAttribute('aria-label'))).toEqual([
            landingContent.hero.navLabel,
            landingContent.examples.navLabel,
            landingContent.audience.navLabel,
            landingContent.features.navLabel,
            landingContent.beta.navLabel,
        ]);

        // The hero starts as the single active section.
        expect(dots[0]).toHaveAttribute('aria-current', 'true');
        expect(dots.filter((dot) => dot.getAttribute('aria-current') === 'true')).toHaveLength(1);

        fireEvent.click(within(rail).getByRole('button', { name: landingContent.features.navLabel }));
        expect(scrollIntoViewCalls.at(-1).element.id).toBe('features');

        // A section crossing the scroll container's center activates its dot.
        const observer = intersectionObservers.at(-1);
        expect(observer.options.rootMargin).toBe('-50% 0px -50% 0px');
        act(() => {
            observer.callback([{ target: document.getElementById('features'), isIntersecting: true }]);
        });
        const updatedDots = within(rail).getAllByRole('button');
        expect(within(rail).getByRole('button', { name: landingContent.features.navLabel })).toHaveAttribute('aria-current', 'true');
        expect(updatedDots.filter((dot) => dot.getAttribute('aria-current') === 'true')).toHaveLength(1);
    });

    it('shows the example icon rail past the hero and flips examples in place', async () => {
        renderLanding();
        await screen.findByRole('tab', { name: 'Chinese language tracker' });

        // Hidden while the hero is the active section.
        expect(screen.queryByRole('navigation', { name: 'Example fractals' })).not.toBeInTheDocument();

        const observer = intersectionObservers.at(-1);
        act(() => {
            observer.callback([{ target: document.getElementById('features'), isIntersecting: true }]);
        });

        const rail = screen.getByRole('navigation', { name: 'Example fractals' });
        const exampleButtons = within(rail).getAllByRole('button');
        expect(exampleButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
            'Guitar practice tracker',
            'Chinese language tracker',
        ]);
        expect(exampleButtons[0]).toHaveAttribute('aria-current', 'true');

        scrollIntoViewCalls.length = 0;
        fireEvent.click(within(rail).getByRole('button', { name: 'Chinese language tracker' }));

        // The active example flips without scrolling the page.
        expect(scrollIntoViewCalls).toHaveLength(0);
        expect(screen.getByRole('tab', { name: 'Chinese language tracker' })).toHaveAttribute('aria-selected', 'true');
        await waitFor(() => {
            expect(screen.getByLabelText('Become fluent in Chinese goal tree')).toBeInTheDocument();
        });
        expect(within(rail).getByRole('button', { name: 'Chinese language tracker' })).toHaveAttribute('aria-current', 'true');

        // Scrolling back to the hero hides the rail again.
        act(() => {
            observer.callback([{ target: document.getElementById('hero'), isIntersecting: true }]);
        });
        expect(screen.queryByRole('navigation', { name: 'Example fractals' })).not.toBeInTheDocument();
    });

    it('scrolls back to the goals view when a lineage goal is clicked in the Activity feature', async () => {
        const linkedExamples = JSON.parse(JSON.stringify(publishedExamples));
        linkedExamples.examples[0].activity_definitions[0].associated_goal_ids = ['guitar-caged'];
        getLandingExamples.mockResolvedValue({ data: linkedExamples });

        renderLanding();
        await screen.findByRole('tab', { name: 'Chinese language tracker' });

        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.activity.label }));
        scrollIntoViewCalls.length = 0;

        fireEvent.click(screen.getByText('Map the fretboard'));
        expect(scrollIntoViewCalls.at(-1).element.id).toBe('examples');
    });

    it('keeps the sample explorer and showcase visible when no examples are published', async () => {
        getLandingExamples.mockResolvedValue({ data: { published_at: null, examples: [] } });

        renderLanding();

        await waitFor(() => {
            expect(getLandingExamples).toHaveBeenCalled();
        });
        expect(await screen.findByRole('tablist', { name: 'Example goal trees' })).toBeInTheDocument();
        expect(await screen.findByRole('tab', { name: 'Guitar practice tracker' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByLabelText('Become a skilled guitar player goal tree')).toBeInTheDocument();
        expect(screen.getByLabelText('Triad Session detail preview')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: landingContent.hero.title })).toBeInTheDocument();
    });
});
