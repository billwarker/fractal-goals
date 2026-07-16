import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AnimatedGoalIcon from '../components/atoms/AnimatedGoalIcon';
import GoalIcon from '../components/atoms/GoalIcon';
import FlowTreeOptionsPane from '../components/flowTree/FlowTreeOptionsPane';
import LandingExampleRail from '../components/landing/LandingExampleRail';
import LandingGoalCards from '../components/landing/LandingGoalCards';
import LandingSkeleton from '../components/landing/LandingSkeleton';
import { GoalLevelsProvider } from '../contexts/GoalLevelsContext';
import landingContent from '../content/landingContent';
import useActiveLandingSection from '../hooks/useActiveLandingSection';
import useDeferredSection from '../hooks/useDeferredSection';
import useIsMobile, { getIsMobileViewport } from '../hooks/useIsMobile';
import useMediaQuery from '../hooks/useMediaQuery';
import useLandingTargetManager from '../hooks/useLandingTargetManager';
import useLandingTreeViewSettings from '../hooks/useLandingTreeViewSettings';
import { queryKeys } from '../hooks/queryKeys';
import { findGoalNodeById, getGoalNodeId } from '../utils/goalNodeModel';
import { publicApi } from '../utils/api';
import { fetchLandingExamples, LANDING_EXAMPLES_STALE_TIME } from '../utils/landingPrefetch';
import { buildLandingGoalDemos } from '../utils/landingGoalDemos';
import { collectSnapshotLevels, findFirstGoalByType, getGoalIconProps } from '../utils/landingPageModel';
import { resolveNestedWheelIntent } from '../utils/landingScrollNavigation';
import { normalizeLandingTreeViewSettings } from '../utils/landingTreeViewSettings';
import styles from './Landing.module.css';
// Reuse the real goals-page styles for the view-options widget and the docked
// side-in detail panel (.flowtree-options-pane, .details-window.sidebar.docked).
import './FractalGoals.css';

const loadFlowTree = () => import('../FlowTree');
const loadLandingFeatures = () => import('../components/landing/LandingFeaturesSection');
const FlowTree = lazy(loadFlowTree);
const LandingFeaturesSection = lazy(loadLandingFeatures);
const warmFlowTree = () => loadFlowTree().catch(() => {});
const warmLandingFeatures = () => loadLandingFeatures().catch(() => {});
const GoalDetailModal = lazy(() => import('../components/ConnectedGoalDetailModal'));
const LandingTargetManagerModal = lazy(() => import('../components/landing/LandingTargetManagerModal'));
const LandingExplorerTakeover = lazy(() => import('../components/landing/LandingExplorerTakeover'));

// Above this width the landing is the horizontal snap-section experience; at
// or below it the page is a continuous vertical scroll with the compact
// (mobile/tablet) design: sticky pill nav, locked inline tree + takeover,
// framed feature previews.
const DESKTOP_LANDING_MEDIA_QUERY = '(min-width: 981px)';

const FLOWTREE_SCOPE_TRANSITION_MS = 160;
const WHEEL_SECTION_COOLDOWN_MS = 760;
const WHEEL_SECTION_DELTA_THRESHOLD = 24;
const GOAL_TREE_UNLOCK_HINT_MS = 1400;

const initialFormState = {
    email: '',
    goal: '',
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

function isDesktopLandingViewport() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia(DESKTOP_LANDING_MEDIA_QUERY).matches;
}

function scrollToSection(sectionId) {
    document.getElementById(sectionId)?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        // Vertical scroll (compact widths) aligns the section top under the
        // sticky header (sections carry scroll-margin-top for the offset).
        block: isDesktopLandingViewport() ? 'nearest' : 'start',
        inline: 'start',
    });
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

function Landing() {
    const isMobile = useIsMobile();
    const isDesktopLanding = useMediaQuery(DESKTOP_LANDING_MEDIA_QUERY);
    const [selectedExampleId, setSelectedExampleId] = useState(null);
    const [isExplorerTakeoverOpen, setIsExplorerTakeoverOpen] = useState(false);
    const [takeoverCanvasElement, setTakeoverCanvasElement] = useState(null);
    const [selectedGoalId, setSelectedGoalId] = useState(null);
    const [goalDetailEntry, setGoalDetailEntry] = useState({ view: 'goal', key: 0 });
    const [flowTreeScopeKey, setFlowTreeScopeKey] = useState(0);
    const [goalsViewMode, setGoalsViewMode] = useState(() => (getIsMobileViewport() ? 'hierarchy' : 'tree'));
    const [isOptionsPaneMinimized, setIsOptionsPaneMinimized] = useState(true);
    const [hoveredHeroExampleId, setHoveredHeroExampleId] = useState(null);
    const [isGoalTreeInteractionLocked, setIsGoalTreeInteractionLocked] = useState(true);
    const [goalTreeUnlockHint, setGoalTreeUnlockHint] = useState('locked');
    const [goalExampleSpaceElement, setGoalExampleSpaceElement] = useState(null);
    const [formState, setFormState] = useState(initialFormState);
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');
    const flowTreeRef = useRef(null);
    const flowTreeScopeTransitionTimerRef = useRef(null);
    const goalTreeUnlockHintTimerRef = useRef(null);
    const wheelSectionCooldownTimerRef = useRef(null);
    const wheelTargetSectionRef = useRef(SECTION_IDS[0]);
    const wheelGestureRef = useRef(null);
    const mainRef = useRef(null);
    const examplesSectionRef = useRef(null);
    const featuresSectionRef = useRef(null);
    const activeSectionId = useActiveLandingSection(
        mainRef,
        SECTION_IDS,
        isDesktopLanding ? 'horizontal' : 'vertical',
    );
    const shouldRenderGoalExplorer = useDeferredSection(examplesSectionRef, mainRef);
    const shouldRenderFeatures = useDeferredSection(
        featuresSectionRef,
        mainRef,
        isDesktopLanding ? '0px 100%' : '600px 0px',
    );

    // The takeover pattern only exists on compact widths; resizing to the
    // desktop snap experience must never leave a stale full-screen overlay.
    useEffect(() => {
        if (isDesktopLanding) {
            setIsExplorerTakeoverOpen(false);
        }
    }, [isDesktopLanding]);

    // On compact widths every goal-detail entry point (demo cards, published
    // Goals copy, tree taps) presents inside the explorer takeover as a bottom
    // sheet, keeping the example space visible instead of a full-screen modal.
    useEffect(() => {
        if (!isDesktopLanding && selectedGoalId) {
            setIsExplorerTakeoverOpen(true);
        }
    }, [isDesktopLanding, selectedGoalId]);

    // The page itself is the snap-scroll container (html/body are overflow
    // hidden), so it must hold focus for Space/PageDown/arrow paging to work.
    useEffect(() => {
        mainRef.current?.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        wheelTargetSectionRef.current = activeSectionId || SECTION_IDS[0];
        wheelGestureRef.current = null;
        if (activeSectionId === 'examples') {
            // The feature section is the next panel. Warm it while visitors
            // explore the tree so advancing again is visually immediate.
            warmLandingFeatures();
        }
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
        const shouldUseFallback = landingExamplesQuery.isError
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
                activityInstantiationSummary: example.activity_instantiation_summary || {},
                analyticsViews: Array.isArray(example.analytics_views) ? example.analytics_views : [],
                analyticsActivityInstances: example.analytics_activity_instances || {},
                targetAnalytics: example.target_analytics || {},
                sessionTemplates: Array.isArray(example.session_templates) ? example.session_templates : [],
                // Admin-curated feature picks (schema v6+); null on older
                // snapshots, in which case the Features section auto-derives.
                showcase: example.showcase || null,
                treeViewSettings: normalizeLandingTreeViewSettings(example.tree_view_settings),
                landingContent: example.landing_content || example.landingContent || null,
            }))
            .filter((example) => example.id && example.tree);
    }, [
        landingExamplesQuery.data,
        landingExamplesQuery.isError,
        landingExamplesQuery.isSuccess,
    ]);

    useEffect(() => {
        if (publishedExamples.length === 0) {
            setSelectedExampleId(null);
            setSelectedGoalId(null);
            return;
        }
        if (!publishedExamples.some((example) => example.id === selectedExampleId)) {
            const firstExample = publishedExamples[0];
            setSelectedExampleId(firstExample.id);
            setSelectedGoalId(null);
        }
    }, [publishedExamples, selectedExampleId]);

    const selectedExample = useMemo(
        () => publishedExamples.find((example) => example.id === selectedExampleId) || publishedExamples[0] || null,
        [publishedExamples, selectedExampleId]
    );
    const [viewSettings, setViewSettings] = useLandingTreeViewSettings(selectedExample);
    const { activeSelection: activeTargetManagerSelection, close: closeTargetManager,
        open: openTargetManager } = useLandingTargetManager(selectedExample);
    const selectedGoal = useMemo(
        () => findGoalNodeById(selectedExample?.tree, selectedGoalId),
        [selectedExample, selectedGoalId]
    );
    const hoveredHeroExample = useMemo(
        () => publishedExamples.find((example) => example.id === hoveredHeroExampleId) || null,
        [hoveredHeroExampleId, publishedExamples]
    );
    const heroTitle = hoveredHeroExample?.root || landingContent.hero.title;
    // Optional shorter explainer for compact widths (landing.md `Mobile Body`).
    const heroBody = (!isDesktopLanding && landingContent.hero.mobileBody) || landingContent.hero.body;
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
        wheelGestureRef.current = null;
        scrollToSection(sectionId);
    }, []);

    // scrollToTree is only passed from the hero picker's click handler, so the
    // initial default selection (set directly in an effect) never auto-scrolls.
    const handleExampleSelect = (exampleId, { scrollToTree = false } = {}) => {
        if (flowTreeScopeTransitionTimerRef.current) {
            clearTimeout(flowTreeScopeTransitionTimerRef.current);
            flowTreeScopeTransitionTimerRef.current = null;
        }
        setSelectedExampleId(exampleId);
        setSelectedGoalId(null);
        setGoalDetailEntry((current) => ({ view: 'goal', key: current.key + 1 }));
        closeTargetManager();
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
        setGoalDetailEntry((current) => ({ view: 'goal', key: current.key + 1 }));
        closeTargetManager();
        // Bump the scope transition key so FlowTree re-filters to this goal's
        // lineage and re-centers smoothly, matching the authenticated goals page.
        setFlowTreeScopeKey((current) => current + 1);
    };

    const clearSelectedGoal = () => {
        setSelectedGoalId(null);
        setGoalDetailEntry((current) => ({ view: 'goal', key: current.key + 1 }));
        closeTargetManager();
        setFlowTreeScopeKey((current) => current + 1);
    };

    useEffect(() => {
        if (activeSectionId !== 'examples') {
            setIsGoalTreeInteractionLocked(true);
            setGoalTreeUnlockHint('locked');
            if (goalTreeUnlockHintTimerRef.current) {
                clearTimeout(goalTreeUnlockHintTimerRef.current);
                goalTreeUnlockHintTimerRef.current = null;
            }
        }
    }, [activeSectionId]);

    // The inline preview is permanently locked on compact widths; interaction
    // happens in the full-screen explorer takeover instead.
    const isInlineTreeLocked = !isDesktopLanding || isGoalTreeInteractionLocked;

    const unlockGoalTreeInteraction = useCallback(() => {
        if (!isGoalTreeInteractionLocked) return;
        setIsGoalTreeInteractionLocked(false);
        setGoalTreeUnlockHint('unlocked');
        if (goalTreeUnlockHintTimerRef.current) {
            clearTimeout(goalTreeUnlockHintTimerRef.current);
        }
        goalTreeUnlockHintTimerRef.current = setTimeout(() => {
            setGoalTreeUnlockHint('hidden');
            goalTreeUnlockHintTimerRef.current = null;
        }, GOAL_TREE_UNLOCK_HINT_MS);
    }, [isGoalTreeInteractionLocked]);

    const goalDemos = buildLandingGoalDemos({ clearSelectedGoal, fallbackCards: goalViewCards,
        findGoalById: findGoalNodeById, findGoalByType: findFirstGoalByType, goalsViewMode,
        handleGoalSelect, selectedExample, selectedGoal, selectedGoalId, setFlowTreeScopeKey,
        openTargetManager, setGoalDetailEntry, setGoalsViewMode, setSelectedGoalId,
        setViewSettings, viewSettings });

    const isHeaderNavItemActive = (href) => {
        if (!href?.startsWith('#')) return false;
        return activeSectionId === href.slice(1);
    };

    // Compact sticky bar surfaces the external nav item (Open app) as a CTA.
    const headerCta = landingContent.header.nav.find((item) => !item.href?.startsWith('#')) || null;

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
    }, [setViewSettings]);

    useEffect(() => () => {
        if (flowTreeScopeTransitionTimerRef.current) {
            clearTimeout(flowTreeScopeTransitionTimerRef.current);
        }
        if (goalTreeUnlockHintTimerRef.current) {
            clearTimeout(goalTreeUnlockHintTimerRef.current);
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
            const goal = formState.goal.trim();
            const payload = {
                email: formState.email.trim(),
                // The "what goal are you trying to achieve" answer is the signup's
                // use case; optional, so an empty answer is simply omitted.
                ...(goal ? { use_case: goal } : {}),
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
        if (!isDesktopLandingViewport()) return;
        const nestedIntent = resolveNestedWheelIntent({
            target: event.target,
            boundary: container,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            previousGesture: wheelGestureRef.current,
            now: Date.now(),
        });
        wheelGestureRef.current = nestedIntent.gesture;
        if (nestedIntent.action === 'nested') return;
        if (nestedIntent.action === 'hold') {
            event.preventDefault();
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
        wheelGestureRef.current = null;
        scrollToSection(nextSectionId);
        wheelSectionCooldownTimerRef.current = setTimeout(() => {
            wheelSectionCooldownTimerRef.current = null;
        }, WHEEL_SECTION_COOLDOWN_MS);
    }, [activeSectionId]);

    return (
        <main ref={mainRef} className={styles.page} data-landing-ready-surface tabIndex={-1} onWheel={handleLandingWheel}>
            <header className={styles.header}>
                {/* .headerBar is display:contents on desktop, so the fixed
                    centered desktop header keeps its exact flat flex layout. */}
                <div className={styles.headerBar}>
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
                    {!isDesktopLanding && headerCta && (
                        <a className={styles.headerCta} href={headerCta.href}>
                            {headerCta.label}
                            <span className={styles.headerCtaGlyph} aria-hidden="true">↗</span>
                        </a>
                    )}
                </div>
                <nav className={styles.nav} aria-label="Primary">
                    {landingContent.header.nav.map((item) => {
                        const isInternal = item.href?.startsWith('#');
                        if (!isInternal) {
                            // Compact widths surface this as the sticky-bar CTA
                            // instead of a nav item.
                            if (!isDesktopLanding) return null;
                            return (
                                <a
                                    href={item.href}
                                    key={`${item.href}-${item.label}`}
                                >
                                    {item.label}
                                </a>
                            );
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
                    {!isDesktopLanding && (
                        <p className={styles.heroKicker}>{landingContent.hero.kicker}</p>
                    )}
                    <h1 id="landing-title">{heroTitle}</h1>
                    {/* Compact widths have no hero picker; the fixed example
                        tray appears once the visitor scrolls past the hero. */}
                    {isDesktopLanding && (
                    <div className={styles.heroExamplePicker}>
                        {isExamplesLoading && !selectedExample ? (
                            <div
                                className={styles.heroExamplesPlaceholder}
                                aria-label="Loading example goals"
                                aria-busy="true"
                                data-testid="example-picker-skeleton"
                            >
                                <span className={styles.visuallyHidden}>Loading example goals</span>
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
                                            onMouseEnter={() => {
                                                setHoveredHeroExampleId(example.id);
                                                warmFlowTree();
                                            }}
                                            onMouseLeave={() => setHoveredHeroExampleId(null)}
                                            onFocus={() => {
                                                setHoveredHeroExampleId(example.id);
                                                warmFlowTree();
                                            }}
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
                    )}
                    <div className={styles.heroBodyPanel}>
                        <p>{heroBody}</p>
                    </div>
                    {!isDesktopLanding && (
                    <div className={styles.heroActions}>
                        {landingContent.hero.actions.map((action) => (
                            action.href?.startsWith('#') ? (
                                <button
                                    type="button"
                                    className={styles.heroActionPrimary}
                                    onClick={() => navigateToSection(action.href.slice(1))}
                                    key={`${action.href}-${action.label}`}
                                >
                                    {action.label}
                                </button>
                            ) : (
                                <a
                                    className={styles.heroActionSecondary}
                                    href={action.href}
                                    key={`${action.href}-${action.label}`}
                                >
                                    {action.label}
                                </a>
                            )
                        ))}
                    </div>
                    )}
                </div>
            </section>

            <section ref={examplesSectionRef} className={`${styles.treeSection} ${styles.snapSection}`} id="examples" aria-labelledby="examples-title">
                <div className={styles.goalViewLayout}>
                    <aside className={styles.goalViewSidebar}>
                        <div className={`${styles.sectionHeader} ${styles.sectionHeaderCompact}`}>
                            <h2 id="examples-title">{landingContent.examples.title}</h2>
                            <p>{landingContent.examples.body}</p>
                        </div>
                        {isDesktopLanding && (
                            <LandingGoalCards cards={goalDemos.cards} activeState={goalDemos.activeState}
                                onActivate={goalDemos.activate} selectedGoalId={selectedGoalId} styles={styles} />
                        )}
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
                                    ref={setGoalExampleSpaceElement}
                                    className={`${styles.goalTreeCanvas} ${isInlineTreeLocked ? styles.goalTreeCanvasLocked : ''}`}
                                    aria-label={`${selectedExample.root} goal tree`}
                                    aria-describedby="examples-title"
                                    role="group"
                                    tabIndex={isDesktopLanding ? 0 : undefined}
                                    onPointerDown={isDesktopLanding ? unlockGoalTreeInteraction : undefined}
                                    onFocus={isDesktopLanding ? unlockGoalTreeInteraction : undefined}
                                    onKeyDown={isDesktopLanding ? (event) => {
                                        if (event.key === 'Escape') {
                                            setIsGoalTreeInteractionLocked(true);
                                            setGoalTreeUnlockHint('locked');
                                            if (goalTreeUnlockHintTimerRef.current) {
                                                clearTimeout(goalTreeUnlockHintTimerRef.current);
                                                goalTreeUnlockHintTimerRef.current = null;
                                            }
                                            event.currentTarget.blur();
                                        }
                                    } : undefined}
                                >
                                    <div
                                        className={`${styles.flowTreeViewport} ${isInlineTreeLocked ? styles.flowTreeViewportLocked : ''}`}
                                        data-interaction-locked={isInlineTreeLocked ? 'true' : 'false'}
                                    >
                                        {isDesktopLanding && (
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
                                        )}
                                        {isDesktopLanding && goalTreeUnlockHint !== 'hidden' && (
                                            <div
                                                className={`${styles.goalTreeUnlockHint} ${goalTreeUnlockHint === 'unlocked' ? styles.goalTreeUnlockHintUnlocked : ''}`}
                                                aria-live="polite"
                                            >
                                                {goalTreeUnlockHint === 'unlocked'
                                                    ? 'Unlocked. Explore the tree.'
                                                    : 'Click the graph to unlock panning and zooming.'}
                                            </div>
                                        )}
                                        {shouldRenderGoalExplorer && !isExplorerTakeoverOpen ? (
                                            <Suspense fallback={<div className={styles.flowTreeLoading}>Loading preview...</div>}>
                                                <FlowTree
                                                    ref={flowTreeRef}
                                                    key={selectedExample.id}
                                                    treeData={selectedExample.tree}
                                                    onNodeClick={isInlineTreeLocked ? () => {} : handleGoalSelect}
                                                    onAddChild={null}
                                                    viewSettings={viewSettings}
                                                    evidenceGoalIds={selectedExample.evidenceGoalIds}
                                                    metricsSummary={selectedExample.metricsSummary}
                                                    programs={selectedExample.programs}
                                                    layoutMode={goalsViewMode}
                                                    selectedNodeId={selectedGoalId}
                                                    zoomTargetNodeId={selectedGoalId}
                                                    scopeTransitionKey={flowTreeScopeKey}
                                                    sidebarOpen={Boolean(selectedGoal) && isDesktopLanding}
                                                    interactionLocked={isInlineTreeLocked}
                                                />
                                            </Suspense>
                                        ) : (
                                            <LandingSkeleton height="100%" width="100%" />
                                        )}
                                    </div>
                                    {!isDesktopLanding && (
                                        <button
                                            type="button"
                                            className={styles.exploreButton}
                                            onClick={() => setIsExplorerTakeoverOpen(true)}
                                        >
                                            <span aria-hidden="true" className={styles.exploreButtonGlyph}>⛶</span>
                                            Explore full screen
                                        </button>
                                    )}
                                    {selectedGoal && isDesktopLanding && (
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
                                                            activityDefinitions={selectedExample.activityDefinitions}
                                                            activityGroups={selectedExample.activityGroups}
                                                            displayMode="panel"
                                                            readOnly
                                                            initialView={goalDetailEntry.view}
                                                            initialViewKey={goalDetailEntry.key}
                                                            onGoalSelect={handleGoalSelect}
                                                            onTargetOpen={(target) => openTargetManager(selectedGoal, target)}
                                                        />
                                                    </GoalLevelsProvider>
                                                </Suspense>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {!isDesktopLanding && (
                            <LandingGoalCards cards={goalDemos.cards} activeState={goalDemos.activeState}
                                onActivate={goalDemos.activate} selectedGoalId={selectedGoalId} styles={styles} />
                        )}
                    </div>
                </div>
                {activeTargetManagerSelection && (
                    <Suspense fallback={null}>
                        <LandingTargetManagerModal
                            exampleId={selectedExample.id}
                            goal={activeTargetManagerSelection.goal}
                            target={activeTargetManagerSelection.target}
                            activityDefinitions={selectedExample.activityDefinitions}
                            analyticsData={selectedExample.targetAnalytics?.[activeTargetManagerSelection.target.id]}
                            historicalInstances={selectedExample.analyticsActivityInstances?.[
                                activeTargetManagerSelection.target.activity_id
                            ]}
                            portalTarget={takeoverCanvasElement || goalExampleSpaceElement}
                            onClose={closeTargetManager}
                        />
                    </Suspense>
                )}
                {!isDesktopLanding && isExplorerTakeoverOpen && selectedExample && (
                    <Suspense fallback={null}>
                        <LandingExplorerTakeover
                            example={selectedExample}
                            flowTreeRef={flowTreeRef}
                            flowTreeScopeKey={flowTreeScopeKey}
                            viewSettings={viewSettings}
                            onToggleViewSetting={handleToggleViewSetting}
                            goalsViewMode={goalsViewMode}
                            onGoalsViewModeChange={setGoalsViewMode}
                            selectedGoalId={selectedGoalId}
                            selectedGoal={selectedGoal}
                            goalDetailEntry={goalDetailEntry}
                            seedLevels={snapshotLevels}
                            onNodeClick={handleGoalSelect}
                            onClearSelectedGoal={clearSelectedGoal}
                            onTargetOpen={(target) => openTargetManager(selectedGoal, target)}
                            goalDemos={goalDemos}
                            cardStyles={styles}
                            onCanvasElement={setTakeoverCanvasElement}
                            escapeDisabled={Boolean(activeTargetManagerSelection)}
                            onEscape={() => {
                                // Step back through takeover state: close the
                                // goal-detail sheet first, then the takeover.
                                if (selectedGoal) {
                                    clearSelectedGoal();
                                    return;
                                }
                                setIsExplorerTakeoverOpen(false);
                            }}
                            onClose={() => {
                                // The top-bar close always fully dismisses.
                                clearSelectedGoal();
                                setIsExplorerTakeoverOpen(false);
                            }}
                        />
                    </Suspense>
                )}
            </section>

            <section
                ref={featuresSectionRef}
                className={`${styles.featuresHost} ${styles.snapSection}`}
                id="features"
                aria-labelledby={shouldRenderFeatures ? 'features-title' : undefined}
                aria-label={shouldRenderFeatures ? undefined : 'Loading features'}
            >
                {shouldRenderFeatures ? (
                    <Suspense fallback={(
                        <div className={styles.deferredFeatureSection} aria-label="Loading features">
                            <LandingSkeleton height="100%" width="100%" />
                        </div>
                    )}>
                        <LandingFeaturesSection
                            example={selectedExample}
                            seedLevels={snapshotLevels}
                            isMobile={isMobile}
                            isLoading={isExamplesLoading}
                            embedded
                        />
                    </Suspense>
                ) : (
                    <div className={styles.deferredFeatureSection} aria-hidden="true">
                        <LandingSkeleton height="100%" width="100%" />
                    </div>
                )}
            </section>

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
                            <label>
                                {landingContent.betaForm.goalLabel}
                                <textarea
                                    className={styles.betaGoalInput}
                                    value={formState.goal}
                                    onChange={updateField('goal')}
                                    placeholder={landingContent.betaForm.goalPlaceholder}
                                    rows={2}
                                    maxLength={280}
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
