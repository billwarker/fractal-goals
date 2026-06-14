import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AnimatedGoalIcon from '../components/atoms/AnimatedGoalIcon';
import GoalIcon from '../components/atoms/GoalIcon';
import FlowTreeOptionsPane from '../components/flowTree/FlowTreeOptionsPane';
import LandingExampleRail from '../components/landing/LandingExampleRail';
import LandingFeaturesSection from '../components/landing/LandingFeaturesSection';
import LandingSkeleton from '../components/landing/LandingSkeleton';
import { GoalLevelsProvider } from '../contexts/GoalLevelsContext';
import landingContent from '../content/landingContent';
import useActiveLandingSection from '../hooks/useActiveLandingSection';
import useIsMobile, { getIsMobileViewport } from '../hooks/useIsMobile';
import { queryKeys } from '../hooks/queryKeys';
import { findGoalNodeById, getGoalNodeId } from '../utils/goalNodeModel';
import { publicApi } from '../utils/api';
import { fetchLandingExamples, LANDING_EXAMPLES_STALE_TIME } from '../utils/landingPrefetch';
import styles from './Landing.module.css';
// Reuse the real goals-page styles for the view-options widget and the docked
// side-in detail panel (.flowtree-options-pane, .details-window.sidebar.docked).
import './FractalGoals.css';

const FlowTree = lazy(() => import('../FlowTree'));
const GoalDetailModal = lazy(() => import('../components/ConnectedGoalDetailModal'));

const DEFAULT_VIEW_SETTINGS = {
    fadeInactiveBranches: false,
    hideInactiveGoals: false,
    hideCompletedGoals: false,
    showMetricsOverlay: false,
};
const FLOWTREE_SCOPE_TRANSITION_MS = 160;
const WHEEL_SECTION_COOLDOWN_MS = 760;
const WHEEL_SECTION_DELTA_THRESHOLD = 24;

const goalLevels = [
    {
        label: 'Ultimate',
        type: 'UltimateGoal',
        shape: 'twelvePointStar',
        color: '#4f9cf9',
        secondaryColor: '#102235',
        description: 'The identity-level ambition everything else serves.',
    },
    {
        label: 'Long Term',
        type: 'LongTermGoal',
        shape: 'hexagon',
        color: '#3bc57c',
        secondaryColor: '#0f271c',
        description: 'Major directions that make the big ambition real.',
    },
    {
        label: 'Mid Term',
        type: 'MidTermGoal',
        shape: 'diamond',
        color: '#f59f4d',
        secondaryColor: '#2c1d0f',
        description: 'Trackable milestones with a clear outcome.',
    },
    {
        label: 'Short Term',
        type: 'ShortTermGoal',
        shape: 'triangle',
        color: '#8b6fff',
        secondaryColor: '#181329',
        description: 'Focused projects that turn plans into near-term work.',
    },
    {
        label: 'Immediate',
        type: 'ImmediateGoal',
        shape: 'circle',
        color: '#ef6a6a',
        secondaryColor: '#301515',
        description: 'The next concrete action you can log and measure.',
    },
];

const levelByType = {
    UltimateGoal: goalLevels[0],
    LongTermGoal: goalLevels[1],
    MidTermGoal: goalLevels[2],
    ShortTermGoal: goalLevels[3],
    ImmediateGoal: goalLevels[4],
};

const initialFormState = {
    email: '',
};

// Full-viewport snap sections in document order. The persistent header uses
// these IDs for active-section tracking and sideways navigation.
const SECTION_IDS = ['hero', 'examples', 'features', 'beta'];

// The goals-view sidebar cards demo one tree feature each; card copy comes from
// landing.md (examples cards) in this fixed order.
const GOAL_VIEW_DEMO_KEYS = ['lineage', 'evidence', 'metrics', 'layout'];
const goalViewCards = (landingContent.examples.cards || [])
    .slice(0, GOAL_VIEW_DEMO_KEYS.length)
    .map((card, index) => ({ ...card, key: GOAL_VIEW_DEMO_KEYS[index] }));

function prefersReducedMotion() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function scrollToSection(sectionId) {
    document.getElementById(sectionId)?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'start',
    });
}

function canScrollVerticallyWithin(target, boundary, deltaY) {
    let element = target instanceof Element ? target : null;
    while (element && element !== boundary) {
        const style = window.getComputedStyle(element);
        const canScroll = /(auto|scroll)/.test(style.overflowY)
            && element.scrollHeight > element.clientHeight;
        if (canScroll) {
            const canScrollUp = element.scrollTop > 0;
            const canScrollDown = element.scrollTop + element.clientHeight < element.scrollHeight - 1;
            if ((deltaY < 0 && canScrollUp) || (deltaY > 0 && canScrollDown)) {
                return true;
            }
        }
        element = element.parentElement;
    }
    return false;
}

const fallbackLandingExamples = [{
    root_id: 'demo-guitar-root',
    label: 'Guitar practice tracker',
    root_name: 'Become a skilled guitar player',
    sort_order: 0,
    showcase: {
        session_id: 'demo-session-1',
        activity_ids: ['demo-activity-1'],
        program_id: 'demo-program-1',
        program_start_date: '2026-01-05',
        program_end_date: '2026-02-01',
        analytics_view_ids: ['demo-analytics-view-1'],
    },
    evidence_goal_ids: ['demo-guitar-musicianship', 'demo-guitar-caged'],
    metrics_summary: {
        'demo-guitar-root': { total_duration_seconds: 12600, session_count: 6 },
        'demo-guitar-caged': { total_duration_seconds: 3600, session_count: 3 },
    },
    programs: [{
        id: 'demo-program-1',
        name: 'Weekly musicianship block',
        color: '#3A86FF',
        start_date: '2026-01-05',
        end_date: '2026-02-01',
        goal_ids: ['demo-guitar-musicianship', 'demo-guitar-caged'],
        blocks: [{
            id: 'demo-block-1',
            name: 'Fretboard map',
            color: '#3A86FF',
            start_date: '2026-01-05',
            end_date: '2026-01-18',
            goal_ids: ['demo-guitar-caged'],
            days: [{
                id: 'demo-day-1',
                name: 'Triad practice',
                day_of_week: ['Monday', 'Wednesday', 'Friday'],
                templates: [{ id: 'demo-template-1', name: 'Triad Session', is_required: true }],
            }],
        }],
    }],
    sessions: [{
        id: 'demo-session-1',
        name: 'Triad Session',
        root_id: 'demo-guitar-root',
        session_start: '2026-01-12T18:00:00Z',
        session_end: '2026-01-12T18:45:00Z',
        duration_minutes: 45,
        total_duration_seconds: 2700,
        completed: true,
        attributes: {
            updated_at: '2026-01-12T18:45:00Z',
            completed: true,
            session_data: {
                session_start: '2026-01-12T18:00:00Z',
                session_end: '2026-01-12T18:45:00Z',
                sections: [{
                    name: 'Main',
                    duration_minutes: 45,
                    activity_ids: ['demo-instance-1'],
                }],
                notes: 'CAGED shapes are getting faster; B-string transitions still need attention.',
            },
        },
        activity_instances: [{
            id: 'demo-instance-1',
            activity_definition_id: 'demo-activity-1',
            name: 'CAGED Triads',
            duration_seconds: 2700,
            completed: true,
            sets: [],
            metrics: [{ metric_id: 'demo-metric-1', value: 36 }],
        }],
        completed_goals: [],
        stats: {},
    }],
    activity_definitions: [{
        id: 'demo-activity-1',
        name: 'CAGED Triads',
        description: 'Move triad shapes through the neck with clean naming.',
        has_metrics: true,
        has_sets: false,
        metric_definitions: [{ id: 'demo-metric-1', name: 'Reps', unit: 'clean changes' }],
        split_definitions: [],
        associated_goal_ids: ['demo-guitar-caged'],
        associated_goals: [{ id: 'demo-guitar-caged', name: 'Practice CAGED triads', type: 'ShortTermGoal' }],
    }],
    activity_groups: [],
    analytics_views: [{
        id: 'demo-analytics-view-1',
        name: 'Session Trends',
        layout: {
            version: 3,
            layout: {
                type: 'grid',
                panels: [{ id: 'window-1', x: 0, y: 0, w: 96, h: 48 }],
            },
            window_states: {
                'window-1': {
                    selectedCategory: 'sessions',
                    selectedVisualization: 'sessionTrends',
                    selectedActivity: null,
                    selectedModeIds: [],
                    selectedGoal: null,
                    visualizationState: { grain: 'week', metrics: ['sessions', 'duration'] },
                    visualizationStateByKey: {
                        'sessions:sessionTrends': { grain: 'week', metrics: ['sessions', 'duration'] },
                    },
                },
            },
            selected_window_id: 'window-1',
            global_filters: {
                goals: {
                    goalIds: [],
                    includeDescendants: true,
                    includeInheritedActivities: true,
                },
                activities: {
                    activityIds: [],
                    groupIds: [],
                    includeChildren: true,
                },
            },
            layout_bounds: { columns: 96, rows: 48 },
        },
    }],
    session_templates: [{
        id: 'demo-template-1',
        name: 'Triad Session',
        description: 'A reusable practice shape for fretboard work.',
        session_type: 'standard',
        template_data: {
            sections: [{
                name: 'Main',
                activities: [{ activity_id: 'demo-activity-1', name: 'CAGED Triads' }],
            }],
        },
    }],
    tree: {
        id: 'demo-guitar-root',
        name: 'Become a skilled guitar player',
        type: 'UltimateGoal',
        level: { id: 'demo-level-ultimate', name: 'Ultimate Goal', icon: 'twelvePointStar', color: '#4f9cf9', secondary_color: '#102235' },
        attributes: { id: 'demo-guitar-root', type: 'UltimateGoal', created_at: '2026-01-01T00:00:00Z', is_smart: true },
        children: [{
            id: 'demo-guitar-musicianship',
            name: 'Build complete musicianship',
            type: 'LongTermGoal',
            level: { id: 'demo-level-long', name: 'Long Term Goal', icon: 'hexagon', color: '#3bc57c', secondary_color: '#0f271c' },
            attributes: { id: 'demo-guitar-musicianship', type: 'LongTermGoal', created_at: '2026-01-01T00:00:00Z', is_smart: true },
            children: [{
                id: 'demo-guitar-fretboard',
                name: 'Map the fretboard',
                type: 'MidTermGoal',
                level: { id: 'demo-level-mid', name: 'Mid Term Goal', icon: 'diamond', color: '#f59f4d', secondary_color: '#2c1d0f' },
                attributes: { id: 'demo-guitar-fretboard', type: 'MidTermGoal', created_at: '2026-01-01T00:00:00Z' },
                children: [{
                    id: 'demo-guitar-caged',
                    name: 'Practice CAGED triads',
                    type: 'ShortTermGoal',
                    level: { id: 'demo-level-short', name: 'Short Term Goal', icon: 'triangle', color: '#8b6fff', secondary_color: '#181329' },
                    attributes: {
                        id: 'demo-guitar-caged',
                        type: 'ShortTermGoal',
                        created_at: '2026-01-01T00:00:00Z',
                        associated_activity_ids: ['demo-activity-1'],
                        associated_activities: [{
                            id: 'demo-activity-1',
                            name: 'CAGED Triads',
                            metric_definitions: [{ id: 'demo-metric-1', name: 'Reps', unit: 'clean changes' }],
                        }],
                    },
                    children: [{
                        id: 'demo-guitar-session-goal',
                        name: 'Complete one clean triad session',
                        type: 'ImmediateGoal',
                        level: { id: 'demo-level-immediate', name: 'Immediate Goal', icon: 'circle', color: '#ef6a6a', secondary_color: '#301515' },
                        attributes: { id: 'demo-guitar-session-goal', type: 'ImmediateGoal', created_at: '2026-01-01T00:00:00Z' },
                        children: [],
                    }],
                }],
            }],
        }],
    },
}];

// Collect the distinct goal levels embedded in a snapshot tree so the landing page
// can seed GoalLevelsContext, making colors/icons/SMART resolve from the published
// snapshot's real (admin-customized) levels rather than the generic fallback palette.
function collectSnapshotLevels(rootNode) {
    if (!rootNode) return [];
    const levelsByKey = new Map();
    const stack = [rootNode];
    while (stack.length > 0) {
        const node = stack.pop();
        if (!node) continue;
        const level = node.level || node.attributes?.level;
        const key = level?.id || level?.name;
        if (level && key && !levelsByKey.has(key)) {
            levelsByKey.set(key, {
                id: level.id,
                name: level.name,
                color: level.color,
                secondary_color: level.secondary_color,
                icon: level.icon,
                ...(node.level_characteristics || {}),
            });
        }
        const children = node.children || [];
        for (let index = children.length - 1; index >= 0; index -= 1) {
            stack.push(children[index]);
        }
    }
    return Array.from(levelsByKey.values());
}

function getGoalIconProps(goal) {
    const goalType = goal?.attributes?.type || goal?.type || 'UltimateGoal';
    const serializedLevel = goal?.level || goal?.attributes?.level || null;
    if (serializedLevel?.icon) {
        return {
            shape: serializedLevel.icon,
            color: serializedLevel.color || levelByType[goalType]?.color || levelByType.UltimateGoal.color,
            secondaryColor: serializedLevel.secondary_color || levelByType[goalType]?.secondaryColor || levelByType.UltimateGoal.secondaryColor,
            isSmart: Boolean(goal?.attributes?.is_smart ?? goal?.is_smart),
        };
    }

    const fallbackLevel = levelByType[goalType] || levelByType.UltimateGoal;

    return {
        shape: fallbackLevel.shape,
        color: fallbackLevel.color,
        secondaryColor: fallbackLevel.secondaryColor,
        isSmart: Boolean(goal?.attributes?.is_smart ?? goal?.is_smart),
    };
}

function findFirstGoalByType(rootNode, goalType) {
    if (!rootNode) return null;
    const stack = [rootNode];
    while (stack.length > 0) {
        const node = stack.shift();
        const nodeType = node?.attributes?.type || node?.type;
        if (nodeType === goalType) return node;
        stack.unshift(...(node?.children || []));
    }
    return null;
}

function Landing() {
    const isMobile = useIsMobile();
    const [selectedExampleId, setSelectedExampleId] = useState(null);
    const [selectedGoalId, setSelectedGoalId] = useState(null);
    const [flowTreeScopeKey, setFlowTreeScopeKey] = useState(0);
    const [viewSettings, setViewSettings] = useState(DEFAULT_VIEW_SETTINGS);
    const [goalsViewMode, setGoalsViewMode] = useState(() => (getIsMobileViewport() ? 'hierarchy' : 'tree'));
    const [isOptionsPaneMinimized, setIsOptionsPaneMinimized] = useState(false);
    const [hoveredHeroExampleId, setHoveredHeroExampleId] = useState(null);
    const [isGoalTreeInteractionLocked, setIsGoalTreeInteractionLocked] = useState(true);
    const [formState, setFormState] = useState(initialFormState);
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');
    const flowTreeRef = useRef(null);
    const flowTreeScopeTransitionTimerRef = useRef(null);
    const wheelSectionCooldownTimerRef = useRef(null);
    const wheelTargetSectionRef = useRef(SECTION_IDS[0]);
    const mainRef = useRef(null);
    const activeSectionId = useActiveLandingSection(mainRef, SECTION_IDS);

    // The page itself is the snap-scroll container (html/body are overflow
    // hidden), so it must hold focus for Space/PageDown/arrow paging to work.
    useEffect(() => {
        mainRef.current?.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        wheelTargetSectionRef.current = activeSectionId || SECTION_IDS[0];
    }, [activeSectionId]);

    // Same key/fn/staleTime as the boot-time prefetch in main.jsx, so this
    // dedupes against the request already in flight instead of starting late.
    const landingExamplesQuery = useQuery({
        queryKey: queryKeys.landingExamples(),
        queryFn: fetchLandingExamples,
        staleTime: LANDING_EXAMPLES_STALE_TIME,
    });
    const isExamplesLoading = landingExamplesQuery.isPending;
    const publishedExamples = useMemo(() => {
        const apiExamples = landingExamplesQuery.data?.examples || [];
        const shouldUseFallback = landingExamplesQuery.isPending
            || landingExamplesQuery.isError
            || (landingExamplesQuery.isSuccess && apiExamples.length === 0);
        const sourceExamples = apiExamples.length > 0
            ? apiExamples
            : (shouldUseFallback ? fallbackLandingExamples : []);
        return sourceExamples
            .slice()
            .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
            .map((example) => ({
                id: example.root_id,
                label: example.label,
                root: example.root_name || example.tree?.name || example.label,
                tree: example.tree,
                rootIcon: getGoalIconProps(example.tree),
                // Root-scoped data that drives the FlowTree view-options widget,
                // mirroring what the authenticated goals page fetches live.
                evidenceGoalIds: Array.isArray(example.evidence_goal_ids)
                    ? new Set(example.evidence_goal_ids.map((goalId) => String(goalId)))
                    : null,
                metricsSummary: example.metrics_summary || null,
                programs: Array.isArray(example.programs) ? example.programs : [],
                sessions: Array.isArray(example.sessions) ? example.sessions : [],
                activityDefinitions: Array.isArray(example.activity_definitions) ? example.activity_definitions : [],
                activityGroups: Array.isArray(example.activity_groups) ? example.activity_groups : [],
                analyticsViews: Array.isArray(example.analytics_views) ? example.analytics_views : [],
                sessionTemplates: Array.isArray(example.session_templates) ? example.session_templates : [],
                // Admin-curated feature picks (schema v6); null on older
                // snapshots, in which case the Features section auto-derives.
                showcase: example.showcase || null,
            }))
            .filter((example) => example.id && example.tree);
    }, [landingExamplesQuery.data, landingExamplesQuery.isError, landingExamplesQuery.isSuccess]);

    useEffect(() => {
        if (publishedExamples.length === 0) {
            setSelectedExampleId(null);
            setSelectedGoalId(null);
            return;
        }
        if (!publishedExamples.some((example) => example.id === selectedExampleId)) {
            setSelectedExampleId(publishedExamples[0].id);
            setSelectedGoalId(null);
        }
    }, [publishedExamples, selectedExampleId]);

    const selectedExample = useMemo(
        () => publishedExamples.find((example) => example.id === selectedExampleId) || publishedExamples[0] || null,
        [publishedExamples, selectedExampleId]
    );
    const selectedGoal = useMemo(
        () => findGoalNodeById(selectedExample?.tree, selectedGoalId),
        [selectedExample, selectedGoalId]
    );
    const hoveredHeroExample = useMemo(
        () => publishedExamples.find((example) => example.id === hoveredHeroExampleId) || null,
        [hoveredHeroExampleId, publishedExamples]
    );
    const heroTitle = hoveredHeroExample?.root || landingContent.hero.title;
    const snapshotLevels = useMemo(
        () => collectSnapshotLevels(selectedExample?.tree),
        [selectedExample]
    );
    useEffect(() => {
        const previousTitle = document.title;
        const upsertMeta = (selector, attributes) => {
            let element = document.head.querySelector(selector);
            const existed = Boolean(element);
            const previousAttributes = {};

            if (!element) {
                element = document.createElement('meta');
                document.head.appendChild(element);
            } else {
                Object.keys(attributes).forEach((key) => {
                    previousAttributes[key] = element.getAttribute(key);
                });
            }
            Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
            return { element, existed, previousAttributes, attributes };
        };

        document.title = landingContent.seo.title;
        const descriptionMeta = upsertMeta('meta[name="description"]', {
            name: 'description',
            content: landingContent.seo.description,
        });
        const ogTitleMeta = upsertMeta('meta[property="og:title"]', {
            property: 'og:title',
            content: landingContent.seo.ogTitle,
        });
        const ogDescriptionMeta = upsertMeta('meta[property="og:description"]', {
            property: 'og:description',
            content: landingContent.seo.description,
        });

        return () => {
            document.title = previousTitle;
            [descriptionMeta, ogTitleMeta, ogDescriptionMeta].forEach((element) => {
                if (!element?.element?.parentNode) return;
                if (!element.existed) {
                    element.element.parentNode.removeChild(element.element);
                    return;
                }
                Object.keys(element.attributes).forEach((key) => {
                    const previousValue = element.previousAttributes[key];
                    if (previousValue == null) {
                        element.element.removeAttribute(key);
                    } else {
                        element.element.setAttribute(key, previousValue);
                    }
                });
            });
        };
    }, []);

    const canSubmit = useMemo(() => (
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formState.email.trim())
        && status !== 'submitting'
    ), [formState, status]);

    const updateField = (field) => (event) => {
        setFormState((current) => ({
            ...current,
            [field]: event.target.value,
        }));
    };

    const navigateToSection = useCallback((sectionId) => {
        wheelTargetSectionRef.current = sectionId;
        scrollToSection(sectionId);
    }, []);

    // scrollToTree is only passed from the hero picker's click handler, so the
    // initial default selection (set directly in an effect) never auto-scrolls.
    const handleExampleSelect = (exampleId, { scrollToTree = false } = {}) => {
        setSelectedExampleId(exampleId);
        setSelectedGoalId(null);
        setHoveredHeroExampleId(null);
        setIsGoalTreeInteractionLocked(true);
        setFlowTreeScopeKey((current) => current + 1);
        if (scrollToTree) {
            navigateToSection('examples');
        }
    };

    const handleGoalSelect = (goal) => {
        const goalId = getGoalNodeId(goal);
        setSelectedGoalId(goalId);
        // Bump the scope transition key so FlowTree re-filters to this goal's
        // lineage and re-centers smoothly, matching the authenticated goals page.
        setFlowTreeScopeKey((current) => current + 1);
    };

    const clearSelectedGoal = () => {
        setSelectedGoalId(null);
        setFlowTreeScopeKey((current) => current + 1);
    };

    // Clicking a goal in the Features lineage demo selects it in the live
    // example explorer and scrolls back up to it.
    const handleFeatureGoalSelect = (goal) => {
        handleGoalSelect(goal);
        navigateToSection('examples');
    };

    useEffect(() => {
        if (activeSectionId !== 'examples') {
            setIsGoalTreeInteractionLocked(true);
        }
    }, [activeSectionId]);

    // A representative mid-tree goal for the lineage-scoping card demo.
    const demoLineageGoal = useMemo(() => (
        findFirstGoalByType(selectedExample?.tree, 'ShortTermGoal')
        || findFirstGoalByType(selectedExample?.tree, 'MidTermGoal')
        || selectedExample?.tree?.children?.[0]
        || null
    ), [selectedExample]);

    const goalViewCardActiveState = {
        lineage: Boolean(selectedGoal),
        evidence: viewSettings.fadeInactiveBranches,
        metrics: viewSettings.showMetricsOverlay,
        layout: goalsViewMode === 'hierarchy',
    };

    const handleGoalViewCardActivate = (cardKey) => {
        if (cardKey === 'lineage') {
            if (selectedGoalId) {
                clearSelectedGoal();
            } else if (demoLineageGoal) {
                handleGoalSelect(demoLineageGoal);
            }
            return;
        }
        if (cardKey === 'evidence') {
            setViewSettings((prev) => ({ ...prev, fadeInactiveBranches: !prev.fadeInactiveBranches }));
            return;
        }
        if (cardKey === 'metrics') {
            setViewSettings((prev) => ({ ...prev, showMetricsOverlay: !prev.showMetricsOverlay }));
            return;
        }
        if (cardKey === 'layout') {
            setGoalsViewMode((prev) => (prev === 'tree' ? 'hierarchy' : 'tree'));
        }
    };

    const isHeaderNavItemActive = (href) => {
        if (!href?.startsWith('#')) return false;
        return activeSectionId === href.slice(1);
    };

    // Mirror the goals page: scope-changing toggles fade the tree out, apply after a
    // short delay, and bump the scope key so FlowTree re-centers; others apply instantly.
    const handleToggleViewSetting = useCallback((settingKey) => (event) => {
        const nextChecked = event.target.checked;
        const shouldTransitionScope = settingKey === 'hideInactiveGoals' || settingKey === 'hideCompletedGoals';

        if (!shouldTransitionScope) {
            setViewSettings((prev) => ({ ...prev, [settingKey]: nextChecked }));
            return;
        }

        flowTreeRef.current?.startFadeOut?.();
        if (flowTreeScopeTransitionTimerRef.current) {
            clearTimeout(flowTreeScopeTransitionTimerRef.current);
        }
        flowTreeScopeTransitionTimerRef.current = setTimeout(() => {
            setViewSettings((prev) => ({ ...prev, [settingKey]: nextChecked }));
            setFlowTreeScopeKey((prev) => prev + 1);
            flowTreeScopeTransitionTimerRef.current = null;
        }, FLOWTREE_SCOPE_TRANSITION_MS);
    }, []);

    useEffect(() => () => {
        if (flowTreeScopeTransitionTimerRef.current) {
            clearTimeout(flowTreeScopeTransitionTimerRef.current);
        }
        if (wheelSectionCooldownTimerRef.current) {
            clearTimeout(wheelSectionCooldownTimerRef.current);
        }
    }, []);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!canSubmit) {
            setStatus('error');
            setMessage(landingContent.betaForm.validationMessage);
            return;
        }

        setStatus('submitting');
        setMessage('');

        try {
            const payload = {
                email: formState.email.trim(),
            };
            const response = await publicApi.createBetaSignup(payload);
            setStatus('success');
            setMessage(response.data?.created
                ? landingContent.betaForm.successCreatedMessage
                : landingContent.betaForm.successUpdatedMessage);
            setFormState(initialFormState);
        } catch (error) {
            setStatus('error');
            setMessage(error.response?.data?.error || landingContent.betaForm.errorMessage);
        }
    };

    const handleLandingWheel = useCallback((event) => {
        const container = mainRef.current;
        if (!container || event.defaultPrevented) return;
        if (!window.matchMedia('(min-width: 981px)').matches) return;
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)
            && canScrollVerticallyWithin(event.target, container, event.deltaY)) {
            return;
        }

        event.preventDefault();
        if (wheelSectionCooldownTimerRef.current) return;

        const primaryDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY;
        if (Math.abs(primaryDelta) < WHEEL_SECTION_DELTA_THRESHOLD) return;

        const currentSectionId = wheelTargetSectionRef.current || activeSectionId || SECTION_IDS[0];
        const currentIndex = SECTION_IDS.indexOf(currentSectionId);
        const nextIndex = Math.min(
            Math.max(currentIndex + (primaryDelta > 0 ? 1 : -1), 0),
            SECTION_IDS.length - 1
        );
        if (nextIndex === currentIndex) return;

        const nextSectionId = SECTION_IDS[nextIndex];
        wheelTargetSectionRef.current = nextSectionId;
        scrollToSection(nextSectionId);
        wheelSectionCooldownTimerRef.current = setTimeout(() => {
            wheelSectionCooldownTimerRef.current = null;
        }, WHEEL_SECTION_COOLDOWN_MS);
    }, [activeSectionId]);

    return (
        <main ref={mainRef} className={styles.page} tabIndex={-1} onWheel={handleLandingWheel}>
            <header className={styles.header}>
                <a className={styles.brand} href="/">
                    <span className={styles.brandMark}>
                        <GoalIcon
                            shape="twelvePointStar"
                            color="var(--color-brand-primary)"
                            secondaryColor="var(--color-bg-input)"
                            isSmart
                            size={34}
                        />
                    </span>
                    <span>{landingContent.header.brand}</span>
                </a>
                <nav className={styles.nav} aria-label="Primary">
                    {landingContent.header.nav.map((item) => {
                        const isInternal = item.href?.startsWith('#');
                        if (!isInternal) {
                            return <a href={item.href} key={`${item.href}-${item.label}`}>{item.label}</a>;
                        }
                        const sectionId = item.href.slice(1);
                        const isActive = isHeaderNavItemActive(item.href);
                        return (
                            <button
                                type="button"
                                className={isActive ? styles.navActive : ''}
                                aria-current={isActive ? 'page' : undefined}
                                onClick={() => navigateToSection(sectionId)}
                                key={`${item.href}-${item.label}`}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </nav>
            </header>
            {activeSectionId !== 'hero' && activeSectionId !== 'beta' && (
                <LandingExampleRail
                    examples={publishedExamples}
                    activeExampleId={selectedExample?.id}
                    onSelect={(exampleId) => handleExampleSelect(exampleId)}
                />
            )}

            <section className={`${styles.hero} ${styles.snapSection}`} id="hero" aria-labelledby="landing-title">
                <div className={styles.heroCopy}>
                    <h1 id="landing-title">{heroTitle}</h1>
                    <div className={styles.heroExamplePicker}>
                        {isExamplesLoading && !selectedExample ? (
                            <div className={styles.exampleToggle} aria-hidden="true" data-testid="example-picker-skeleton">
                                <LandingSkeleton height="120px" width="120px" radius="8px" />
                                <LandingSkeleton height="120px" width="120px" radius="8px" />
                                <LandingSkeleton height="120px" width="120px" radius="8px" />
                            </div>
                        ) : (
                            <div className={styles.exampleToggle} role="tablist" aria-label="Example goal trees">
                                {publishedExamples.map((example) => {
                                    const HeroExampleIcon = example.rootIcon?.isSmart ? AnimatedGoalIcon : GoalIcon;
                                    return (
                                        <button
                                            type="button"
                                            role="tab"
                                            aria-selected={example.id === selectedExample?.id}
                                            aria-label={example.root}
                                            className={example.id === selectedExample?.id ? styles.toggleActive : ''}
                                            onMouseEnter={() => setHoveredHeroExampleId(example.id)}
                                            onMouseLeave={() => setHoveredHeroExampleId(null)}
                                            onFocus={() => setHoveredHeroExampleId(example.id)}
                                            onBlur={() => setHoveredHeroExampleId(null)}
                                            onClick={() => handleExampleSelect(example.id, { scrollToTree: true })}
                                            key={example.id}
                                        >
                                            <span aria-hidden="true" className={styles.exampleToggleIcon}>
                                                <HeroExampleIcon
                                                    {...example.rootIcon}
                                                    size={112}
                                                    reduced
                                                />
                                            </span>
                                            <span className={styles.exampleToggleLabel}>{example.root}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div className={styles.heroBodyPanel}>
                        <p>{landingContent.hero.body}</p>
                    </div>
                </div>
            </section>

            <section className={`${styles.treeSection} ${styles.snapSection}`} id="examples" aria-labelledby="examples-title">
                <div className={styles.goalViewLayout}>
                    <aside className={styles.goalViewSidebar}>
                        <div className={`${styles.sectionHeader} ${styles.sectionHeaderCompact}`}>
                            <h2 id="examples-title">{landingContent.examples.title}</h2>
                            <p>{landingContent.examples.body}</p>
                        </div>
                        <div className={styles.goalViewCards} role="group" aria-label="Goals view highlights">
                            {goalViewCards.map((card) => (
                                <button
                                    type="button"
                                    className={`${styles.goalViewCard} ${goalViewCardActiveState[card.key] ? styles.goalViewCardActive : ''}`}
                                    aria-pressed={Boolean(goalViewCardActiveState[card.key])}
                                    onClick={() => handleGoalViewCardActivate(card.key)}
                                    key={card.key}
                                >
                                    <span className={styles.goalViewCardTitle}>{card.title}</span>
                                    <span className={styles.goalViewCardBody}>{card.body}</span>
                                </button>
                            ))}
                        </div>
                    </aside>
                    <div className={styles.goalViewMain}>
                        {!selectedExample ? (
                            <div className={styles.goalExplorer} data-testid="examples-skeleton">
                                <div className={styles.goalTreeCanvas}>
                                    <LandingSkeleton height="100%" width="100%" className={styles.flowTreeViewport} />
                                </div>
                            </div>
                        ) : (
                            <div className={styles.goalExplorer}>
                                <div
                                    className={`${styles.goalTreeCanvas} ${isGoalTreeInteractionLocked ? styles.goalTreeCanvasLocked : ''}`}
                                    aria-label={`${selectedExample.root} goal tree`}
                                    aria-describedby="examples-title"
                                    role="group"
                                    tabIndex={0}
                                    onPointerDown={() => setIsGoalTreeInteractionLocked(false)}
                                    onFocus={() => setIsGoalTreeInteractionLocked(false)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Escape') {
                                            setIsGoalTreeInteractionLocked(true);
                                            event.currentTarget.blur();
                                        }
                                    }}
                                >
                                    <div
                                        className={`${styles.flowTreeViewport} ${isGoalTreeInteractionLocked ? styles.flowTreeViewportLocked : ''}`}
                                        data-interaction-locked={isGoalTreeInteractionLocked ? 'true' : 'false'}
                                    >
                                        <FlowTreeOptionsPane
                                            isMobile={isMobile}
                                            isMinimized={isOptionsPaneMinimized}
                                            onToggleMinimized={() => setIsOptionsPaneMinimized((prev) => !prev)}
                                            goalsViewMode={goalsViewMode}
                                            onGoalsViewModeChange={setGoalsViewMode}
                                            viewSettings={viewSettings}
                                            onToggleViewSetting={handleToggleViewSetting}
                                            inactiveBranchTooltip="Dims branches with no recent completed activity evidence."
                                            hideInactiveTooltip="Hides goals with no completed activity evidence in the active window."
                                            hideCompletedTooltip="Hides completed goals from the fractal tree."
                                        />
                                        <Suspense fallback={<div className={styles.flowTreeLoading}>Loading preview...</div>}>
                                            <FlowTree
                                                ref={flowTreeRef}
                                                key={`${selectedExample.id}-${goalsViewMode}`}
                                                treeData={selectedExample.tree}
                                                onNodeClick={handleGoalSelect}
                                                onAddChild={null}
                                                viewSettings={viewSettings}
                                                evidenceGoalIds={selectedExample.evidenceGoalIds}
                                                metricsSummary={selectedExample.metricsSummary}
                                                programs={selectedExample.programs}
                                                layoutMode={goalsViewMode}
                                                selectedNodeId={selectedGoalId}
                                                zoomTargetNodeId={selectedGoalId}
                                                scopeTransitionKey={flowTreeScopeKey}
                                                sidebarOpen={Boolean(selectedGoal)}
                                                interactionLocked={isGoalTreeInteractionLocked}
                                            />
                                        </Suspense>
                                    </div>
                                    {selectedGoal && !isMobile && (
                                        <div className="details-window sidebar docked landing-goal-dock">
                                            <div className="window-content landing-goal-dock-content">
                                                <Suspense fallback={<div className={styles.flowTreeLoading}>Loading details...</div>}>
                                                    <GoalLevelsProvider seedLevels={snapshotLevels}>
                                                        <GoalDetailModal
                                                            isOpen
                                                            onClose={clearSelectedGoal}
                                                            goal={selectedGoal}
                                                            rootId={selectedExample.id}
                                                            treeData={selectedExample.tree}
                                                            displayMode="panel"
                                                            readOnly
                                                            onGoalSelect={handleGoalSelect}
                                                        />
                                                    </GoalLevelsProvider>
                                                </Suspense>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {selectedGoal && isMobile && (
                    <Suspense fallback={<div className={styles.flowTreeLoading}>Loading details...</div>}>
                        <GoalLevelsProvider seedLevels={snapshotLevels}>
                            <GoalDetailModal
                                isOpen
                                onClose={() => setSelectedGoalId(null)}
                                goal={selectedGoal}
                                rootId={selectedExample.id}
                                treeData={selectedExample.tree}
                                displayMode="modal"
                                readOnly
                                onGoalSelect={handleGoalSelect}
                            />
                        </GoalLevelsProvider>
                    </Suspense>
                )}
            </section>

            <LandingFeaturesSection
                example={selectedExample}
                seedLevels={snapshotLevels}
                isMobile={isMobile}
                isLoading={isExamplesLoading}
                onGoalSelect={handleFeatureGoalSelect}
                className={styles.snapSection}
            />

            <section className={`${styles.betaSection} ${styles.snapSection}`} id="beta" aria-labelledby="beta-title">
                <div className={styles.betaAudience}>
                    <div className={styles.sectionHeader}>
                        <h2>{landingContent.audience.title}</h2>
                    </div>
                    <div className={styles.audienceGrid}>
                        {landingContent.audience.cards.map((card) => (
                            <article className={styles.audienceCard} key={card.title}>
                                <h3>{card.title}</h3>
                                <p>{card.body}</p>
                            </article>
                        ))}
                    </div>
                </div>
                <div className={styles.betaSignup}>
                    <div className={styles.betaSignupPanel}>
                        <div className={styles.betaCopy}>
                            <h2 id="beta-title">{landingContent.beta.title}</h2>
                            <p>{landingContent.beta.body}</p>
                        </div>
                        <form className={styles.betaForm} onSubmit={handleSubmit}>
                            <label>
                                {landingContent.betaForm.emailLabel}
                                <input
                                    type="email"
                                    value={formState.email}
                                    onChange={updateField('email')}
                                    autoComplete="email"
                                    required
                                />
                            </label>
                            <button type="submit" disabled={!canSubmit}>
                                {status === 'submitting'
                                    ? landingContent.betaForm.submittingLabel
                                    : landingContent.betaForm.submitLabel}
                            </button>
                            {message && (
                                <p className={status === 'success' ? styles.successMessage : styles.errorMessage} role="status">
                                    {message}
                                </p>
                            )}
                        </form>
                    </div>
                </div>
            </section>
        </main>
    );
}

export default Landing;
