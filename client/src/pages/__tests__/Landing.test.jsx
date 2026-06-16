import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import landingContent from '../../content/landingContent';
import Landing from '../Landing';

const { createBetaSignup, getLandingExamples, connectedGoalDetailModalMock } = vi.hoisted(() => ({
    createBetaSignup: vi.fn(),
    getLandingExamples: vi.fn(),
    connectedGoalDetailModalMock: vi.fn(),
}));

vi.mock('../../utils/api', () => ({
    API_BASE: '/api',
    publicApi: {
        createBetaSignup: (...args) => createBetaSignup(...args),
        getLandingExamples: (...args) => getLandingExamples(...args),
    },
}));

vi.mock('../../components/atoms/GoalIcon', () => ({
    default: ({ shape, isSmart }) => <span data-testid="goal-icon" data-smart={isSmart ? 'yes' : 'no'}>{shape}</span>,
}));

vi.mock('../../components/atoms/AnimatedGoalIcon', () => ({
    default: ({ shape, isSmart }) => <span data-testid="animated-goal-icon" data-smart={isSmart ? 'yes' : 'no'}>{shape}</span>,
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
        viewSettings,
        interactionLocked,
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
                data-fade-inactive={viewSettings?.fadeInactiveBranches ? 'yes' : 'no'}
                data-metrics-overlay={viewSettings?.showMetricsOverlay ? 'yes' : 'no'}
                data-interaction-locked={interactionLocked ? 'yes' : 'no'}
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

vi.mock('../../components/programs/ProgramBlockView', () => ({
    default: ({ blocks }) => (
        <div data-testid="showcase-program-blocks" data-block-count={blocks.length}>
            Program blocks
        </div>
    ),
}));

vi.mock('../../components/analytics/ProfileWindowLayout', () => ({
    GRID_COLUMNS: 96,
    GRID_ROWS: 48,
    migrateSplitLayoutToGrid: (layout) => layout?.type === 'grid' ? layout : null,
    default: ({ renderWindow }) => (
        <div data-testid="landing-analytics-layout">{renderWindow('window-1', { onDragStart: vi.fn() })}</div>
    ),
}));

vi.mock('../../components/analytics/ProfileWindow', () => ({
    default: ({ windowState }) => (
        <div data-testid="landing-analytics-window">
            {windowState?.selectedVisualization || 'empty-window'}
        </div>
    ),
}));

vi.mock('../../components/analytics/AnalyticsFiltersSidebar', () => ({
    default: () => <aside data-testid="landing-analytics-filters">Filters</aside>,
}));

vi.mock('../../components/ConnectedGoalDetailModal', () => ({
    default: (props) => {
        connectedGoalDetailModalMock(props);
        const { goal, readOnly, displayMode, onClose } = props;
        return (
            <aside aria-label={`${goal.name} details`}>
                <h3>{goal.name}</h3>
                <span>{readOnly ? 'Read only' : 'Editable'}</span>
                <span>{displayMode}</span>
                <button type="button" onClick={onClose} aria-label="Close goal details">Close</button>
            </aside>
        );
    },
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
                group_id: 'group-1',
                metric_definitions: [{ id: 'metric-1', name: 'Reps', unit: 'count' }],
            }],
            activity_groups: [{ id: 'group-1', name: 'Technique', parent_id: null, sort_order: 0 }],
            analytics_views: [{
                id: 'view-1',
                name: 'Session Duration Trend',
                layout: {
                    version: 3,
                    layout: { type: 'grid', panels: [{ id: 'window-1', x: 0, y: 0, w: 96, h: 48 }] },
                    window_states: {
                        'window-1': {
                            selectedCategory: 'sessions',
                            selectedVisualization: 'sessionTrends',
                            selectedActivity: null,
                            selectedModeIds: [],
                            selectedGoal: null,
                            visualizationState: { grain: 'week', metrics: ['sessions'] },
                            visualizationStateByKey: {
                                'sessions:sessionTrends': { grain: 'week', metrics: ['sessions'] },
                            },
                        },
                    },
                    selected_window_id: 'window-1',
                    global_filters: {
                        goals: { goalIds: [], includeDescendants: true, includeInheritedActivities: true },
                        activities: { activityIds: [], groupIds: [], includeChildren: true },
                    },
                    layout_bounds: { columns: 96, rows: 48 },
                },
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
                attributes: { id: 'guitar-root', type: 'UltimateGoal', created_at: '2026-01-01T00:00:00Z', is_smart: true },
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
        expect(screen.getByText(landingContent.hero.body)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: landingContent.audience.title })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Features' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open app' })).toHaveAttribute('href', 'https://my.fractalgoals.com');
        expect(await screen.findByRole('tab', { name: 'Become a skilled guitar player' })).toHaveAttribute('aria-selected', 'true');
        const chineseHeroTab = await screen.findByRole('tab', { name: 'Become fluent in Chinese' });
        expect(chineseHeroTab).toBeInTheDocument();
        fireEvent.mouseEnter(chineseHeroTab);
        expect(screen.getByRole('heading', { name: 'Become fluent in Chinese' })).toBeInTheDocument();
        fireEvent.mouseLeave(chineseHeroTab);
        expect(screen.getByRole('heading', { name: landingContent.hero.title })).toBeInTheDocument();
        expect(screen.getAllByTestId('animated-goal-icon').some((icon) => (
            icon.textContent === 'star' && icon.getAttribute('data-smart') === 'yes'
        ))).toBe(true);
        expect(screen.getByLabelText('Become a skilled guitar player goal tree')).toBeInTheDocument();
        expect(await screen.findByTestId('flow-tree-demo')).toHaveAttribute('data-layout-mode', 'tree');
        expect(screen.getAllByText('Become a skilled guitar player').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Practice CAGED triads').length).toBeGreaterThan(0);

        fireEvent.pointerDown(screen.getByLabelText('Become a skilled guitar player goal tree'));
        fireEvent.click(screen.getByRole('button', { name: 'Open mocked goal' }));
        expect(await screen.findByLabelText('Build complete musicianship details')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Build complete musicianship' })).toBeInTheDocument();
        expect(screen.getByText('Read only')).toBeInTheDocument();
        expect(screen.getByText('panel')).toBeInTheDocument();
        expect(connectedGoalDetailModalMock).toHaveBeenLastCalledWith(expect.objectContaining({
            activityDefinitions: expect.arrayContaining([expect.objectContaining({ id: 'activity-1', name: 'CAGED Triads' })]),
            activityGroups: expect.arrayContaining([expect.objectContaining({ id: 'group-1', name: 'Technique' })]),
        }));
        fireEvent.click(screen.getByRole('button', { name: 'Close goal details' }));
        expect(screen.queryByLabelText('Build complete musicianship details')).not.toBeInTheDocument();

        fireEvent.click(chineseHeroTab);
        expect(screen.getByRole('tab', { name: 'Become fluent in Chinese' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getAllByText('Shadow 10 minutes').length).toBeGreaterThan(0);
        expect(await screen.findByLabelText('Listening Review detail preview')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Session Notes' })).toBeInTheDocument();
        expect(screen.queryByText('One system, four views: goals, programs, sessions, and progress.')).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Common questions' })).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'will@example.com' } });
        fireEvent.change(screen.getByLabelText(landingContent.betaForm.goalLabel), {
            target: { value: 'Learn jazz guitar' },
        });

        fireEvent.click(screen.getByRole('button', { name: /request beta access/i }));

        await waitFor(() => {
            expect(createBetaSignup).toHaveBeenCalledWith({
                email: 'will@example.com',
                use_case: 'Learn jazz guitar',
            });
        });
        expect(await screen.findByText(landingContent.betaForm.successCreatedMessage)).toBeInTheDocument();
    });

    it('scopes and centers the flow tree to the clicked goal lineage', async () => {
        renderLanding();

        await screen.findByRole('tab', { name: 'Become fluent in Chinese' });
        const tree = await screen.findByTestId('flow-tree-demo');
        expect(tree).toHaveAttribute('data-selected-node-id', '');
        const initialScopeKey = tree.getAttribute('data-scope-transition-key');

        fireEvent.pointerDown(screen.getByLabelText('Become a skilled guitar player goal tree'));
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

    it('keeps the landing sections in document order: hero, goals, features, beta', async () => {
        const { container } = renderLanding();

        const heroHeading = screen.getByRole('heading', { name: landingContent.hero.title });
        const examplesHeading = await screen.findByRole('heading', { name: landingContent.examples.title });
        const features = container.querySelector('#features');
        const betaHeading = screen.getByRole('heading', { name: landingContent.beta.title });
        const beta = container.querySelector('#beta');
        const audienceHeading = within(beta).getByRole('heading', { name: landingContent.audience.title });

        expect(features).toBeInTheDocument();
        expect(container.querySelector('#audience')).not.toBeInTheDocument();
        expect(Boolean(heroHeading.compareDocumentPosition(examplesHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(Boolean(examplesHeading.compareDocumentPosition(features) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(Boolean(features.compareDocumentPosition(betaHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(Boolean(audienceHeading.compareDocumentPosition(betaHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(container.querySelector('#showcase')).not.toBeInTheDocument();
        expect(container.querySelector('#faq')).not.toBeInTheDocument();
    });

    it('mirrors the goals page: view-options widget, view-mode toggle, and full snapshot data', async () => {
        renderLanding();

        await screen.findByRole('tab', { name: 'Become fluent in Chinese' });
        const tree = await screen.findByTestId('flow-tree-demo');

        // The FlowTreeOptionsPane starts collapsed while keeping the view toggle available.
        expect(screen.getByRole('button', { name: 'Tree' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Hierarchy' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Fade inactive branches')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Hide inactive goals')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Expand tree view options' }));
        expect(screen.getByLabelText('Fade inactive branches')).toBeInTheDocument();
        expect(screen.getByLabelText('Hide inactive goals')).toBeInTheDocument();
        expect(screen.getByLabelText('Hide completed goals')).toBeInTheDocument();
        expect(screen.getByLabelText('Show metrics overlay')).toBeInTheDocument();

        // Full snapshot data reaches the FlowTree.
        expect(tree).toHaveAttribute('data-layout-mode', 'tree');
        expect(tree).toHaveAttribute('data-evidence-count', '2');
        expect(tree).toHaveAttribute('data-has-metrics', 'yes');
        expect(tree).toHaveAttribute('data-program-count', '1');

        // Switching to hierarchy view updates the existing tree immediately.
        fireEvent.click(screen.getByRole('button', { name: 'Hierarchy' }));
        expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-layout-mode', 'hierarchy');
    });

    it('renders the features section with sidebar controls and read-only surfaces', async () => {
        const { container } = renderLanding();

        await screen.findByRole('tab', { name: 'Become fluent in Chinese' });
        expect(screen.getByRole('heading', { name: landingContent.features.title })).toBeInTheDocument();

        // The feature controls live in the sidebar, not nested in the stage frame.
        const featureTabs = screen.getByRole('tablist', { name: 'Product features' });
        const stage = container.querySelector('#features [class*="featureStage"]');
        expect(stage).toBeInTheDocument();
        expect(stage.contains(featureTabs)).toBe(false);
        expect(container.querySelector('#features [class*="featureInfo"]')).not.toBeInTheDocument();

        // Session feature is the default, with its explanatory copy in the sidebar card.
        expect(screen.getByRole('tab', { name: landingContent.features.items.session.label })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getAllByText(landingContent.features.items.session.heading)).toHaveLength(1);
        expect(screen.getByText(landingContent.features.items.session.body)).toBeInTheDocument();
        landingContent.features.items.session.cards.forEach((card) => {
            expect(screen.getByRole('heading', { name: card.title })).toBeInTheDocument();
        });
        expect(screen.getByLabelText('Technique Session detail preview')).toBeInTheDocument();
        expect(screen.getByRole('tablist', { name: 'Session side pane views' })).toBeInTheDocument();

        // Activity feature shows the builder modal plus the goal selector demo.
        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.activity.label }));
        expect(screen.getByRole('tab', { name: landingContent.features.items.activity.label })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByLabelText('Activity Name')).toHaveValue('CAGED Triads');
        expect(screen.getByRole('heading', { name: 'Associate "CAGED Triads"' })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Select Map the fretboard' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.programs.label }));
        expect(screen.getByRole('tab', { name: landingContent.features.items.programs.label })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('showcase-calendar')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Blocks' }));
        expect(screen.getByTestId('showcase-program-blocks')).toBeInTheDocument();
        expect(screen.queryByTestId('showcase-calendar')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Program side pane preview')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Hide Sidebar' }));
        expect(screen.queryByLabelText('Program side pane preview')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Show Sidebar' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.analytics.label }));
        expect(screen.getByText('Session Duration Trend')).toBeInTheDocument();
        expect(screen.getByTestId('landing-analytics-window')).toHaveTextContent('sessionTrends');
        expect(screen.getByRole('button', { name: 'Show Filters' })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: landingContent.features.items.more.label })).not.toBeInTheDocument();
    });

    it('honors admin showcase picks for featured session, activities, and analytics views', async () => {
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
        example.analytics_views = [
            ...example.analytics_views,
            {
                id: 'view-2',
                name: 'Featured Analytics View',
                layout: {
                    version: 3,
                    layout: { type: 'grid', panels: [{ id: 'window-1', x: 0, y: 0, w: 96, h: 48 }] },
                    window_states: {
                        'window-1': {
                            selectedCategory: 'activities',
                            selectedVisualization: 'activityTrends',
                            selectedActivity: null,
                            selectedModeIds: [],
                            selectedGoal: null,
                            visualizationState: { metrics: ['duration'] },
                            visualizationStateByKey: {
                                'activities:activityTrends': { metrics: ['duration'] },
                            },
                        },
                    },
                    selected_window_id: 'window-1',
                    global_filters: {
                        goals: { goalIds: [], includeDescendants: true, includeInheritedActivities: true },
                        activities: { activityIds: [], groupIds: [], includeChildren: true },
                    },
                    layout_bounds: { columns: 96, rows: 48 },
                },
            },
        ];
        example.showcase = {
            session_id: 'session-2',
            activity_ids: ['activity-2'],
            program_id: 'prog-1',
            program_start_date: '2026-01-01',
            program_end_date: '2026-01-31',
            analytics_view_ids: ['view-2'],
        };
        getLandingExamples.mockResolvedValue({ data: showcaseExamples });

        renderLanding();

        await screen.findByRole('tab', { name: 'Become fluent in Chinese' });
        // Featured session replaces the most-recent default.
        expect(screen.getByLabelText('Featured Older Session detail preview')).toBeInTheDocument();

        // Featured activity is the activity loaded into the builder preview.
        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.activity.label }));
        expect(screen.getByLabelText('Activity Name')).toHaveValue('Featured Scales');
        expect(screen.getByRole('heading', { name: 'Associate "Featured Scales"' })).toBeInTheDocument();
        // The featured activity's linked goal and its ancestors render in the
        // lineage (the goal name also appears inside the mocked FlowTree).
        expect(screen.getAllByText('Practice CAGED triads').length).toBeGreaterThan(1);
        expect(screen.getByText('Map the fretboard')).toBeInTheDocument();
        expect(screen.getAllByText('Build complete musicianship').length).toBeGreaterThan(0);

        // Analytics view curation filters to the featured view only.
        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.analytics.label }));
        expect(screen.getByText('Featured Analytics View')).toBeInTheDocument();
        expect(screen.getByTestId('landing-analytics-window')).toHaveTextContent('activityTrends');
        expect(screen.queryByRole('button', { name: 'Session Duration Trend' })).not.toBeInTheDocument();
    });

    it('opens the goal detail in the real docked side-in panel', async () => {
        const { container } = renderLanding();

        await screen.findByRole('tab', { name: 'Become fluent in Chinese' });
        await screen.findByTestId('flow-tree-demo');
        fireEvent.pointerDown(screen.getByLabelText('Become a skilled guitar player goal tree'));
        fireEvent.click(screen.getByRole('button', { name: 'Open mocked goal' }));

        await screen.findByLabelText('Build complete musicianship details');
        // Uses the shared docked detail-window container (carries slideInRight animation).
        expect(container.querySelector('.details-window.sidebar.docked.landing-goal-dock')).toBeInTheDocument();
    });

    it('shows fallback example icons while published examples are loading', async () => {
        let resolveExamples;
        getLandingExamples.mockReturnValue(new Promise((resolve) => {
            resolveExamples = resolve;
        }));

        renderLanding();

        expect(screen.getByRole('tablist', { name: 'Example goal trees' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Become a skilled guitar player' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.queryByTestId('example-picker-skeleton')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Become a skilled guitar player goal tree')).toBeInTheDocument();
        expect(screen.getByTestId('features-stage-skeleton')).toBeInTheDocument();

        resolveExamples({ data: publishedExamples });

        expect(await screen.findByRole('tab', { name: 'Become a skilled guitar player' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByLabelText('Become a skilled guitar player goal tree')).toBeInTheDocument();
        expect(screen.queryByTestId('example-picker-skeleton')).not.toBeInTheDocument();
        expect(screen.queryByTestId('examples-skeleton')).not.toBeInTheDocument();
        await waitFor(() => {
            expect(screen.queryByTestId('features-stage-skeleton')).not.toBeInTheDocument();
        });
    });

    it('hosts the example picker in the hero and auto-scrolls to the goals view on pick', async () => {
        renderLanding();

        const picker = await screen.findByRole('tablist', { name: 'Example goal trees' });
        const hero = document.getElementById('hero');
        expect(hero).toBeInTheDocument();
        expect(hero.contains(picker)).toBe(true);

        // The initial default selection must not auto-scroll the page.
        expect(scrollIntoViewCalls).toHaveLength(0);

        fireEvent.click(await screen.findByRole('tab', { name: 'Become fluent in Chinese' }));
        expect(scrollIntoViewCalls).toHaveLength(1);
        expect(scrollIntoViewCalls[0].element.id).toBe('examples');
        expect(scrollIntoViewCalls[0].options).toEqual({ behavior: 'smooth', block: 'nearest', inline: 'start' });
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

        fireEvent.click(await screen.findByRole('tab', { name: 'Become fluent in Chinese' }));
        expect(scrollIntoViewCalls).toHaveLength(1);
        expect(scrollIntoViewCalls[0].options).toEqual({ behavior: 'auto', block: 'nearest', inline: 'start' });
    });

    it('uses the persistent header as section navigation, tracks active section, and jumps on click', async () => {
        renderLanding();
        await screen.findByRole('tab', { name: 'Become fluent in Chinese' });

        expect(screen.queryByRole('navigation', { name: 'Page sections' })).not.toBeInTheDocument();
        const headerNav = screen.getByRole('navigation', { name: 'Primary' });
        expect(within(headerNav).getByRole('button', { name: 'Goals' })).toBeInTheDocument();
        expect(within(headerNav).getByRole('button', { name: 'Features' })).toBeInTheDocument();
        expect(within(headerNav).getByRole('button', { name: 'Private beta' })).toBeInTheDocument();
        expect(within(headerNav).getByRole('link', { name: 'Open app' })).toHaveAttribute('href', 'https://my.fractalgoals.com');
        expect(within(headerNav).queryAllByRole('button').filter((button) => button.getAttribute('aria-current') === 'page')).toHaveLength(0);

        fireEvent.click(within(headerNav).getByRole('button', { name: 'Features' }));
        expect(scrollIntoViewCalls.at(-1).element.id).toBe('features');

        // A section crossing the scroll container's center activates its header item.
        const observer = intersectionObservers.at(-1);
        expect(observer.options.rootMargin).toBe('0px -50% 0px -50%');
        act(() => {
            observer.callback([{ target: document.getElementById('features'), isIntersecting: true }]);
        });
        const updatedButtons = within(headerNav).queryAllByRole('button');
        expect(within(headerNav).getByRole('button', { name: 'Features' })).toHaveAttribute('aria-current', 'page');
        expect(updatedButtons.filter((button) => button.getAttribute('aria-current') === 'page')).toHaveLength(1);
    });

    it('maps desktop wheel and trackpad movement to one smooth section jump', async () => {
        vi.stubGlobal('matchMedia', (query) => ({
            matches: query === '(min-width: 981px)',
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
            addListener: () => {},
            removeListener: () => {},
        }));

        const { container } = renderLanding();
        await screen.findByRole('tab', { name: 'Become fluent in Chinese' });

        const page = container.querySelector('main');
        fireEvent.wheel(page, { deltaY: 140, deltaX: 0 });
        fireEvent.wheel(page, { deltaY: 160, deltaX: 0 });
        fireEvent.wheel(page, { deltaY: 0, deltaX: 180 });

        expect(scrollIntoViewCalls).toHaveLength(1);
        expect(scrollIntoViewCalls[0].element.id).toBe('examples');
        expect(scrollIntoViewCalls[0].options).toEqual({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    });

    it('drives the live tree from the goals-view highlight cards', async () => {
        renderLanding();
        await screen.findByRole('tab', { name: 'Become fluent in Chinese' });

        const cardsGroup = screen.getByRole('group', { name: 'Goals view highlights' });
        const cards = within(cardsGroup).getAllByRole('button');
        expect(cards.map((card) => card.textContent)).toEqual(
            landingContent.examples.cards.map((card) => `${card.title}${card.body}`)
        );
        cards.forEach((card) => expect(card).toHaveAttribute('aria-pressed', 'false'));

        // Lineage card scopes the tree to a representative goal and toggles off.
        const [lineageCard, evidenceCard, metricsCard, layoutCard] = cards;
        fireEvent.click(lineageCard);
        await waitFor(() => {
            expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-selected-node-id', 'guitar-caged');
        });
        expect(lineageCard).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(lineageCard);
        await waitFor(() => {
            expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-selected-node-id', '');
        });

        // Evidence and metrics cards toggle their view settings on the tree.
        fireEvent.click(evidenceCard);
        expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-fade-inactive', 'yes');
        expect(evidenceCard).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(metricsCard);
        expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-metrics-overlay', 'yes');

        // Layout card flips between tree and hierarchy rendering.
        fireEvent.click(layoutCard);
        await waitFor(() => {
            expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-layout-mode', 'hierarchy');
        });
        expect(layoutCard).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(layoutCard);
        await waitFor(() => {
            expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-layout-mode', 'tree');
        });
    });

    it('keeps the landing goal viewport interaction locked until the user clicks it', async () => {
        renderLanding();
        await screen.findByRole('tab', { name: 'Become fluent in Chinese' });

        const flowTree = await screen.findByTestId('flow-tree-demo');
        expect(flowTree).toHaveAttribute('data-interaction-locked', 'yes');
        expect(document.querySelector('[data-interaction-locked="true"]')).toBeInTheDocument();
        expect(screen.getByText('Click the graph to unlock panning and zooming.')).toBeInTheDocument();

        const hierarchyButton = screen.getByRole('button', { name: 'Hierarchy' });
        fireEvent.pointerDown(hierarchyButton);
        fireEvent.click(hierarchyButton);
        expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-interaction-locked', 'no');
        expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-layout-mode', 'hierarchy');
        expect(screen.getByText('Unlocked. Explore the tree.')).toBeInTheDocument();

        fireEvent.keyDown(screen.getByLabelText('Become a skilled guitar player goal tree'), { key: 'Escape' });
        expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-interaction-locked', 'yes');
        expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-selected-node-id', '');

        vi.useFakeTimers();
        try {
            fireEvent.pointerDown(screen.getByLabelText('Become a skilled guitar player goal tree'));
            expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-interaction-locked', 'no');
            expect(document.querySelector('[data-interaction-locked="false"]')).toBeInTheDocument();
            expect(screen.getByText('Unlocked. Explore the tree.')).toBeInTheDocument();
            act(() => {
                vi.advanceTimersByTime(1500);
            });
            expect(screen.queryByText('Unlocked. Explore the tree.')).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }

        const observer = intersectionObservers.at(-1);
        act(() => {
            observer.callback([{ target: document.getElementById('features'), isIntersecting: true }]);
        });
        expect(screen.getByTestId('flow-tree-demo')).toHaveAttribute('data-interaction-locked', 'yes');
        expect(screen.getByText('Click the graph to unlock panning and zooming.')).toBeInTheDocument();
    });

    it('shows the example icon rail past the hero and flips examples in place', async () => {
        renderLanding();
        await screen.findByRole('tab', { name: 'Become fluent in Chinese' });

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
        expect(screen.getByRole('tab', { name: 'Become fluent in Chinese' })).toHaveAttribute('aria-selected', 'true');
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

    it('keeps users in the Activity feature when the goal selector preview is clicked', async () => {
        const linkedExamples = JSON.parse(JSON.stringify(publishedExamples));
        linkedExamples.examples[0].activity_definitions[0].associated_goal_ids = ['guitar-caged'];
        getLandingExamples.mockResolvedValue({ data: linkedExamples });

        renderLanding();
        await screen.findByRole('tab', { name: 'Become fluent in Chinese' });

        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.activity.label }));
        scrollIntoViewCalls.length = 0;

        fireEvent.click(screen.getByText('Map the fretboard'));
        expect(scrollIntoViewCalls).toHaveLength(0);
    });

    it('keeps the sample explorer and showcase visible when no examples are published', async () => {
        getLandingExamples.mockResolvedValue({ data: { published_at: null, examples: [] } });

        renderLanding();

        await waitFor(() => {
            expect(getLandingExamples).toHaveBeenCalled();
        });
        expect(await screen.findByRole('tablist', { name: 'Example goal trees' })).toBeInTheDocument();
        expect(await screen.findByRole('tab', { name: 'Become a skilled guitar player' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByLabelText('Become a skilled guitar player goal tree')).toBeInTheDocument();
        expect(screen.getByLabelText('Triad Session detail preview')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: landingContent.hero.title })).toBeInTheDocument();
    });
});
