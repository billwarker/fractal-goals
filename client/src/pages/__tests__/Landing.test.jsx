import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import landingContent from '../../content/landingContent';
import Landing from '../Landing';

const { createBetaSignup, getLandingExamples } = vi.hoisted(() => ({
    createBetaSignup: vi.fn(),
    getLandingExamples: vi.fn(),
}));

vi.mock('../../utils/api', () => ({
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

vi.mock('../../contexts/GoalLevelsContext', () => ({
    GoalLevelsProvider: ({ children }) => <>{children}</>,
    useGoalLevels: () => ({
        getGoalColor: () => '#3A86FF',
        getGoalTextColor: () => '#ffffff',
        getGoalIcon: () => 'circle',
        getGoalSecondaryColor: () => '#102235',
    }),
}));

vi.mock('../../components/sessions/SessionCardExpanded', () => ({
    default: ({ session, readOnly }) => (
        <article data-testid="showcase-session" data-read-only={readOnly ? 'yes' : 'no'}>
            {session.name}
        </article>
    ),
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
        expect(screen.getByRole('link', { name: 'App showcase' })).toHaveAttribute('href', '#showcase');
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
        expect(screen.queryByText('One system, four views: goals, programs, sessions, and progress.')).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Common questions' })).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Will Tester' } });
        fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'will@example.com' } });
        fireEvent.change(screen.getByLabelText(/testing focus/i), { target: { value: 'creative practice' } });
        fireEvent.change(screen.getByLabelText(/note/i), { target: { value: 'I want to track practice.' } });

        fireEvent.click(screen.getByRole('button', { name: /request invite/i }));

        await waitFor(() => {
            expect(createBetaSignup).toHaveBeenCalledWith({
                name: 'Will Tester',
                email: 'will@example.com',
                use_case: 'creative practice',
                note: 'I want to track practice.',
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

    it('keeps /landing as a normal top-to-bottom page with audience and showcase before beta', async () => {
        const { container } = renderLanding();

        const heroHeading = screen.getByRole('heading', { name: landingContent.hero.title });
        const examplesHeading = await screen.findByRole('heading', { name: landingContent.examples.title });
        const audienceHeading = screen.getByRole('heading', { name: landingContent.audience.title });
        const showcase = container.querySelector('#showcase');
        const betaHeading = screen.getByRole('heading', { name: landingContent.beta.title });

        expect(showcase).toBeInTheDocument();
        expect(Boolean(heroHeading.compareDocumentPosition(examplesHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(Boolean(examplesHeading.compareDocumentPosition(audienceHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(Boolean(audienceHeading.compareDocumentPosition(showcase) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(Boolean(showcase.compareDocumentPosition(betaHeading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(container.querySelector('#features')).not.toBeInTheDocument();
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

    it('renders the app showcase frame and switches across read-only snapshot tabs', async () => {
        renderLanding();

        await screen.findByRole('tab', { name: 'Chinese language tracker' });
        expect(await screen.findByRole('heading', { name: /real app surfaces/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Sessions' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('showcase-session')).toHaveTextContent('Technique Session');
        expect(screen.getByTestId('showcase-session')).toHaveAttribute('data-read-only', 'yes');

        fireEvent.click(screen.getByRole('tab', { name: 'Programs' }));
        expect(screen.getByTestId('showcase-calendar')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: 'Analytics' }));
        expect(screen.getByRole('heading', { name: 'Session Duration Trend' })).toBeInTheDocument();
        expect(screen.getByTestId('showcase-chart')).toHaveTextContent('Technique Session');

        fireEvent.click(screen.getByRole('tab', { name: 'Build' }));
        expect(screen.getByRole('heading', { name: 'CAGED Triads' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Practice Template' })).toBeInTheDocument();
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

    it('keeps the sample explorer and showcase visible when no examples are published', async () => {
        getLandingExamples.mockResolvedValue({ data: { published_at: null, examples: [] } });

        renderLanding();

        await waitFor(() => {
            expect(getLandingExamples).toHaveBeenCalled();
        });
        expect(screen.getByRole('tablist', { name: 'Example goal trees' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Guitar practice tracker' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByLabelText('Become a skilled guitar player goal tree')).toBeInTheDocument();
        expect(screen.getByTestId('showcase-session')).toHaveTextContent('Triad Session');
        expect(screen.getByRole('heading', { name: landingContent.hero.title })).toBeInTheDocument();
    });
});
