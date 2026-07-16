import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import landingContent from '../../content/landingContent';
import Landing from '../Landing';
import createLandingIntersectionObserverStub from './landingIntersectionObserverStub';
const { createBetaSignup, getLandingExamples, connectedGoalDetailModalMock, landingTargetModalMock } = vi.hoisted(() => ({
    createBetaSignup: vi.fn(),
    getLandingExamples: vi.fn(),
    connectedGoalDetailModalMock: vi.fn(),
    landingTargetModalMock: vi.fn(),
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
        const { goal, readOnly, displayMode, onClose, onTargetOpen } = props;
        const targets = goal.attributes?.targets || [];
        return (
            <aside aria-label={`${goal.name} details`}>
                <h3>{goal.name}</h3>
                <span>{readOnly ? 'Read only' : 'Editable'}</span>
                <span>{displayMode}</span>
                {targets.map((target) => (
                    <button
                        type="button"
                        key={target.id}
                        onClick={() => onTargetOpen?.(target)}
                    >
                        {`Open target ${target.name}`}
                    </button>
                ))}
                <button type="button" onClick={onClose} aria-label="Close goal details">Close</button>
            </aside>
        );
    },
}));
vi.mock('../../components/landing/LandingTargetManagerModal', () => ({
    default: (props) => {
        landingTargetModalMock(props);
        return <div role="dialog" aria-label={`Target manager ${props.target.name}`} data-example-id={props.exampleId}>
            <span>{props.goal.name}</span>
            <button type="button" onClick={props.onClose}>Close target manager</button>
        </div>;
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
            activity_instantiation_summary: {
                'activity-1': {
                    instance_count: 2,
                    last_used_at: '2026-07-14T12:00:00Z',
                    average_duration_seconds: 540,
                },
            },
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
const LAZY_PREVIEW_WAIT = { timeout: 5000 };
const IntersectionObserverStub = createLandingIntersectionObserverStub(intersectionObservers, act);
const getActiveSectionObserver = () => intersectionObservers.find((observer) => (
    observer.options.threshold === 0
));
// The landing page branches on viewport media queries (desktop snap sections
// vs the compact vertical experience); tests stub matchMedia explicitly.
const stubMatchMedia = (matcher) => vi.stubGlobal('matchMedia', (query) => ({
    matches: matcher(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
}));
const stubDesktopViewport = (extraMatcher = () => false) => stubMatchMedia(
    (query) => query === '(min-width: 981px)' || extraMatcher(query)
);
const stubCompactViewport = () => stubMatchMedia(
    (query) => query === '(max-width: 980px)' || query === '(max-width: 768px)'
);
function renderLanding(initialExamples = null) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    if (initialExamples) {
        queryClient.setQueryData(['public', 'landing-examples'], initialExamples);
    }
    return render(
        <QueryClientProvider client={queryClient}>
            <Landing />
        </QueryClientProvider>
    );
}
describe('Landing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete window.__fgLandingExamplesPreload;
        getLandingExamples.mockResolvedValue({ data: publishedExamples });
        scrollIntoViewCalls.length = 0;
        intersectionObservers.length = 0;
        Element.prototype.scrollIntoView = function scrollIntoViewStub(options) {
            scrollIntoViewCalls.push({ element: this, options });
        };
        vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
        stubDesktopViewport();
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
        expect(await screen.findByLabelText('Listening Review detail preview', {}, LAZY_PREVIEW_WAIT)).toBeInTheDocument();
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
    it('hydrates each example tree from its admin defaults without leaking visitor changes', async () => {
        const configuredExamples = JSON.parse(JSON.stringify(publishedExamples));
        configuredExamples.examples[0].tree_view_settings = { fadeInactiveBranches: true, hideInactiveGoals: false, hideCompletedGoals: true, showMetricsOverlay: true };
        delete configuredExamples.examples[1].tree_view_settings;
        getLandingExamples.mockResolvedValue({ data: configuredExamples });
        renderLanding(configuredExamples);
        await screen.findByRole('tab', { name: 'Become a skilled guitar player' });
        fireEvent.click(screen.getByRole('button', { name: 'Expand tree view options' }));
        expect(['Fade inactive branches', 'Hide inactive goals', 'Hide completed goals', 'Show metrics overlay']
            .map((label) => screen.getByLabelText(label).checked)).toEqual([true, false, true, true]);
        fireEvent.click(screen.getByLabelText('Hide inactive goals'));
        await waitFor(() => expect(screen.getByLabelText('Hide inactive goals')).toBeChecked());
        fireEvent.click(screen.getByRole('tab', { name: 'Become fluent in Chinese' }));
        await waitFor(() => expect(['Fade inactive branches', 'Hide inactive goals', 'Hide completed goals', 'Show metrics overlay']
            .map((label) => screen.getByLabelText(label).checked)).toEqual([false, false, false, false]));
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
        expect(await screen.findByLabelText('Technique Session detail preview', {}, LAZY_PREVIEW_WAIT)).toBeInTheDocument();
        expect(screen.getByRole('tablist', { name: 'Session side pane views' })).toBeInTheDocument();
        // Activity feature shows the builder modal plus the goal selector demo.
        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.activity.label }));
        expect(screen.getByRole('tab', { name: landingContent.features.items.activity.label })).toHaveAttribute('aria-selected', 'true');
        expect(await screen.findByRole('region', { name: 'Activity catalogue' }, LAZY_PREVIEW_WAIT)).toBeInTheDocument();
        expect(screen.getByText('2 instances')).toBeInTheDocument();
        expect(screen.getByText('Avg: 9m')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Activity builder/i }));
        expect(screen.getByLabelText('Activity Name')).toHaveValue('CAGED Triads');
        expect(screen.getByRole('heading', { name: 'Associate "CAGED Triads"' })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Select Map the fretboard' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.programs.label }));
        expect(screen.getByRole('tab', { name: landingContent.features.items.programs.label })).toHaveAttribute('aria-selected', 'true');
        expect(await screen.findByTestId('showcase-calendar', {}, LAZY_PREVIEW_WAIT)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Blocks' }));
        expect(screen.getByTestId('showcase-program-blocks')).toBeInTheDocument();
        expect(screen.queryByTestId('showcase-calendar')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Program side pane preview')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Hide Sidebar' }));
        expect(screen.queryByLabelText('Program side pane preview')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Show Sidebar' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.analytics.label }));
        expect(await screen.findByText('Session Duration Trend', {}, LAZY_PREVIEW_WAIT)).toBeInTheDocument();
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
                attributes: {
                    updated_at: '2026-01-02T10:00:00Z',
                    session_data: { sections: [{ name: 'Work', activity_ids: ['instance-2'] }] },
                },
                activity_instances: [{ id: 'instance-2', activity_definition_id: 'activity-2' }],
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
        expect(await screen.findByLabelText('Featured Older Session detail preview', {}, LAZY_PREVIEW_WAIT)).toBeInTheDocument();
        // Featured activity is the activity loaded into the builder preview.
        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.activity.label }));
        fireEvent.click(await screen.findByRole('button', { name: /Activity builder/i }, LAZY_PREVIEW_WAIT));
        expect(screen.getByLabelText('Activity Name')).toHaveValue('Featured Scales');
        expect(screen.getByRole('heading', { name: 'Associate "Featured Scales"' })).toBeInTheDocument();
        // The featured activity's linked goal and its ancestors render in the
        // lineage (the goal name also appears inside the mocked FlowTree).
        expect(screen.getAllByText('Practice CAGED triads').length).toBeGreaterThan(1);
        expect(screen.getByText('Map the fretboard')).toBeInTheDocument();
        expect(screen.getAllByText('Build complete musicianship').length).toBeGreaterThan(0);
        // Analytics view curation filters to the featured view only.
        fireEvent.click(screen.getByRole('tab', { name: landingContent.features.items.analytics.label }));
        expect(await screen.findByText('Featured Analytics View', {}, LAZY_PREVIEW_WAIT)).toBeInTheDocument();
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
    it('reserves the final picker footprint while published examples are loading', async () => {
        let resolveExamples;
        getLandingExamples.mockReturnValue(new Promise((resolve) => {
            resolveExamples = resolve;
        }));
        renderLanding();
        expect(screen.queryByRole('tablist', { name: 'Example goal trees' })).not.toBeInTheDocument();
        expect(screen.getByTestId('example-picker-skeleton')).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByTestId('examples-skeleton')).toBeInTheDocument();
        expect(await screen.findByTestId('features-stage-skeleton')).toBeInTheDocument();
        await act(async () => resolveExamples({ data: publishedExamples }));
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
        stubDesktopViewport((query) => query === '(prefers-reduced-motion: reduce)');
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
        const observer = getActiveSectionObserver();
        expect(observer.options.rootMargin).toBe('0px -50% 0px -50%');
        act(() => {
            observer.callback([{ target: document.getElementById('features'), isIntersecting: true }]);
        });
        const updatedButtons = within(headerNav).queryAllByRole('button');
        expect(within(headerNav).getByRole('button', { name: 'Features' })).toHaveAttribute('aria-current', 'page');
        expect(updatedButtons.filter((button) => button.getAttribute('aria-current') === 'page')).toHaveLength(1);
    });
    it('maps desktop wheel and trackpad movement to one smooth section jump', async () => {
        stubDesktopViewport();
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
    it('uses published Goals copy and opens each configured goal example in the intended view', async () => {
        const configuredExamples = JSON.parse(JSON.stringify(publishedExamples));
        const example = configuredExamples.examples[0];
        const targetGoal = example.tree.children[0].children[0].children[0];
        targetGoal.attributes.targets = [{
            id: 'target-1',
            name: '120 BPM clean changes',
            activity_id: 'activity-1',
            metrics: [{ metric_id: 'metric-1', operator: '>=', value: 120 }],
        }];
        example.target_analytics = { 'target-1': { instances: [{ id: 'published-instance' }] } };
        example.analytics_activity_instances = { 'activity-1': [{ id: 'legacy-instance' }] };
        example.landing_content = {
            goals: {
                bullets: [
                    { key: 'break_down', heading: 'Break it down', body: 'Map the work.', goal_id: 'guitar-fretboard', target_id: null },
                    { key: 'associate_activities', heading: 'Connect the evidence', body: 'See the linked work.', goal_id: 'guitar-caged', target_id: null },
                    { key: 'set_targets', heading: 'Set measurable targets', body: 'Track a threshold.', goal_id: 'guitar-caged', target_id: 'target-1' },
                ],
            },
        };
        example.landingContent = example.landing_content;
        getLandingExamples.mockResolvedValue({ data: configuredExamples });
        renderLanding(configuredExamples);
        await screen.findByText('Connect the evidence');
        const cardsGroup = screen.getByRole('group', { name: 'Goals view highlights' });
        fireEvent.click(within(cardsGroup).getByRole('button', { name: /Connect the evidence/ }));
        await waitFor(() => expect(connectedGoalDetailModalMock).toHaveBeenLastCalledWith(expect.objectContaining({
            goal: expect.objectContaining({ id: 'guitar-caged' }),
            initialView: 'goal-activities',
        })));
        fireEvent.click(screen.getByRole('button', { name: 'Open target 120 BPM clean changes' }));
        expect(await screen.findByRole('dialog', { name: 'Target manager 120 BPM clean changes' }))
            .toHaveAttribute('data-example-id', 'guitar-root');
        expect(landingTargetModalMock).toHaveBeenLastCalledWith(expect.objectContaining({
            analyticsData: example.target_analytics['target-1'],
            historicalInstances: example.analytics_activity_instances['activity-1'],
            portalTarget: expect.any(HTMLElement),
        }));
        fireEvent.click(screen.getByRole('button', { name: 'Close target manager' }));
        fireEvent.click(within(cardsGroup).getByRole('button', { name: /Set measurable targets/ }));
        await waitFor(() => expect(connectedGoalDetailModalMock).toHaveBeenLastCalledWith(expect.objectContaining({
            goal: expect.objectContaining({ id: 'guitar-caged' }),
            initialView: 'goal',
        })));
        expect(await screen.findByRole('dialog', { name: 'Target manager 120 BPM clean changes' }))
            .toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Become fluent in Chinese' }));
        expect(screen.queryByRole('dialog', { name: 'Target manager 120 BPM clean changes' }))
            .not.toBeInTheDocument();
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
        const observer = getActiveSectionObserver();
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
        const observer = getActiveSectionObserver();
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
        fireEvent.click(await screen.findByRole('button', { name: /Activity builder/i }, LAZY_PREVIEW_WAIT));
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

describe('Landing (compact viewports)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete window.__fgLandingExamplesPreload;
        getLandingExamples.mockResolvedValue({ data: publishedExamples });
        scrollIntoViewCalls.length = 0;
        intersectionObservers.length = 0;
        Element.prototype.scrollIntoView = function scrollIntoViewStub(options) {
            scrollIntoViewCalls.push({ element: this, options });
        };
        vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
        stubCompactViewport();
    });
    afterEach(() => {
        delete Element.prototype.scrollIntoView;
        vi.unstubAllGlobals();
    });
    it('renders the sticky bar CTA, kicker, hero CTAs, mobile body, and the fixed example tray', async () => {
        renderLanding();
        // The external nav item becomes the sticky-bar CTA (no duplicate).
        const openApp = screen.getByRole('link', { name: 'Open app' });
        expect(openApp).toHaveAttribute('href', 'https://my.fractalgoals.com');
        const headerNav = screen.getByRole('navigation', { name: 'Primary' });
        expect(within(headerNav).queryByRole('link', { name: 'Open app' })).not.toBeInTheDocument();
        expect(within(headerNav).getByRole('button', { name: 'Goals' })).toBeInTheDocument();
        // Kicker + shorter mobile explainer replace the desktop-only copy.
        expect(screen.getByText(landingContent.hero.kicker)).toBeInTheDocument();
        expect(screen.getByText(landingContent.hero.mobileBody)).toBeInTheDocument();
        expect(screen.queryByText(landingContent.hero.body)).not.toBeInTheDocument();
        // Hero CTA row from landing.md actions; no hero example picker.
        const hero = document.getElementById('hero');
        expect(within(hero).getByRole('button', { name: 'Request beta access' })).toBeInTheDocument();
        expect(within(hero).getByRole('link', { name: 'Go to app' })).toHaveAttribute('href', 'https://my.fractalgoals.com');
        await screen.findByTestId('flow-tree-demo');
        expect(within(hero).queryByRole('tablist')).not.toBeInTheDocument();
        // The single example switcher is the fixed icon tray, shown past the hero.
        expect(screen.queryByRole('navigation', { name: 'Example fractals' })).not.toBeInTheDocument();
        const observer = getActiveSectionObserver();
        act(() => {
            observer.callback([{ target: document.getElementById('examples'), isIntersecting: true }]);
        });
        const tray = screen.getByRole('navigation', { name: 'Example fractals' });
        fireEvent.click(within(tray).getByRole('button', { name: 'Chinese language tracker' }));
        await waitFor(() => {
            expect(screen.getByLabelText('Become fluent in Chinese goal tree')).toBeInTheDocument();
        });
        expect(within(tray).getByRole('button', { name: 'Chinese language tracker' })).toHaveAttribute('aria-current', 'true');
    });
    it('tracks sections against the viewport midline and jumps with block start', async () => {
        renderLanding();
        await screen.findByTestId('flow-tree-demo');
        const observer = getActiveSectionObserver();
        expect(observer.options.rootMargin).toBe('-50% 0px -50% 0px');
        expect(observer.options.root).toBe(null);
        const headerNav = screen.getByRole('navigation', { name: 'Primary' });
        fireEvent.click(within(headerNav).getByRole('button', { name: 'Features' }));
        expect(scrollIntoViewCalls.at(-1).element.id).toBe('features');
        expect(scrollIntoViewCalls.at(-1).options).toEqual({ behavior: 'smooth', block: 'start', inline: 'start' });
    });
    it('keeps the inline tree locked and explores through the full-screen takeover', async () => {
        renderLanding();
        const inlineTree = await screen.findByTestId('flow-tree-demo');
        // Permanently locked inline: no tap-to-unlock hint, hierarchy default.
        expect(inlineTree).toHaveAttribute('data-interaction-locked', 'yes');
        expect(inlineTree).toHaveAttribute('data-layout-mode', 'hierarchy');
        expect(screen.queryByText(/unlock panning/i)).not.toBeInTheDocument();
        // Reveal the fixed example tray (active section past the hero), then
        // open the takeover; the tray floats above it and still switches.
        const observer = getActiveSectionObserver();
        act(() => {
            observer.callback([{ target: document.getElementById('examples'), isIntersecting: true }]);
        });
        fireEvent.click(screen.getByRole('button', { name: /Explore full screen/ }));
        const dialog = await screen.findByRole('dialog', { name: 'Become a skilled guitar player goal explorer' });
        expect(document.body.style.overflow).toBe('hidden');
        // Fully interactive tree inside the takeover; inline instance yields.
        await waitFor(() => {
            expect(within(dialog).getByTestId('flow-tree-demo')).toHaveAttribute('data-interaction-locked', 'no');
        });
        const tray = screen.getByRole('navigation', { name: 'Example fractals' });
        fireEvent.click(within(tray).getByRole('button', { name: 'Chinese language tracker' }));
        expect(await screen.findByRole('dialog', { name: 'Become fluent in Chinese goal explorer' })).toBeInTheDocument();
        // Tapping a goal opens the read-only detail as a bottom sheet inside
        // the takeover (panel mode), keeping the example space visible.
        const activeDialog = screen.getByRole('dialog', { name: 'Become fluent in Chinese goal explorer' });
        fireEvent.click(within(activeDialog).getByRole('button', { name: 'Open mocked goal' }));
        await within(activeDialog).findByText('panel');
        expect(screen.queryByText('modal')).not.toBeInTheDocument();
        // Escape steps back: sheet first, takeover second.
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => {
            expect(within(activeDialog).queryByText('panel')).not.toBeInTheDocument();
        });
        expect(screen.getByRole('dialog', { name: 'Become fluent in Chinese goal explorer' })).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Become fluent in Chinese goal explorer' })).not.toBeInTheDocument();
        });
        expect(document.body.style.overflow).toBe('');
        // Goal-detail CTAs outside (demo highlight cards) reopen the takeover
        // with the sheet instead of a page-eclipsing modal.
        const cardsGroup = screen.getByRole('group', { name: 'Goals view highlights' });
        fireEvent.click(within(cardsGroup).getAllByRole('button')[0]);
        const reopened = await screen.findByRole('dialog', { name: 'Become fluent in Chinese goal explorer' });
        await within(reopened).findByText('panel');
    });
    it('frames feature previews in a scaled app window with a full-screen takeover', async () => {
        renderLanding();
        await screen.findByTestId('flow-tree-demo');
        // Feature selector still works as pill tabs.
        expect(await screen.findByRole('tab', { name: landingContent.features.items.session.label })).toHaveAttribute('aria-selected', 'true');
        const expandButton = await screen.findByRole('button', { name: /View full screen/ }, LAZY_PREVIEW_WAIT);
        fireEvent.click(expandButton);
        const dialog = await screen.findByRole('dialog', { name: 'Sessions full-screen preview' });
        // Zoom toggle switches between fitted and natural width.
        const fullZoom = within(dialog).getByRole('button', { name: '100%' });
        fireEvent.click(fullZoom);
        expect(fullZoom).toHaveAttribute('aria-pressed', 'true');
        expect(await within(dialog).findByLabelText('Technique Session detail preview', {}, LAZY_PREVIEW_WAIT)).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Sessions full-screen preview' })).not.toBeInTheDocument();
        });
    });
});
