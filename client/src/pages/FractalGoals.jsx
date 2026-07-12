import React, { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import FractalView from '../components/FractalView';
import ErrorBoundary from '../components/ErrorBoundary';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import AlertModal from '../components/modals/AlertModal';
import FlowTreeOptionsPane from '../components/flowTree/FlowTreeOptionsPane';
import { useGoals } from '../contexts/GoalsContext';
import { useDebug } from '../contexts/DebugContext';
import { useAuth } from '../contexts/AuthContext';
import { buildTreeMaps, getLineagePath } from '../components/flowTree/flowTreeTreeUtils';
import { useActivities as useActivitiesQuery, useActivityGroups } from '../hooks/useActivityQueries';
import { useFractalTree } from '../hooks/useGoalQueries';
import { getActiveGoalWindowDaysFromSettings, getInactiveNodeIds } from '../hooks/useFlowTreeMetrics';
import { useFlowTreeEvidence, useFlowtreeSessionMetrics } from '../hooks/useSessionQueries';
import { getChildType } from '../utils/goalHelpers';
import { findGoalNodeById, getGoalNodeId } from '../utils/goalNodeModel';
import { getGoalSearchMatches, getVisibleGoalSearchCandidates } from '../utils/goalTypeToZoomSearch';
import notify from '../utils/notify';
import {
    getQueryCharacter,
    isSearchCharacter,
    renderTypeToZoomQuery,
    shouldIgnoreTypeToZoomKey,
} from '../utils/typeToZoomInput';
import { usePrograms } from '../hooks/useProgramQueries';
import { FEATURE_FLAGS, isFeatureEnabled, useFeatureFlags } from '../hooks/useFeatureFlags';
import useIsMobile, { getIsMobileViewport } from '../hooks/useIsMobile';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import PageSurface from '../components/surface/PageSurface';
import { usePageSurfaces } from '../hooks/usePageSurfaceQueries';
import {
    getDefaultSurfaceConfig,
    getSurfaceModeConfig,
    getTreePanelId,
    sanitizeSurfaceConfig,
    seedMobileFromDesktop,
    updateSurfaceModeConfig,
} from '../components/surface/surfaceState';
import '../App.css';
import './FractalGoals.css';
import '../components/surface/PageSurface.css';
const GoalDetailModal = lazyWithRetry(() => import('../components/ConnectedGoalDetailModal'), 'components/ConnectedGoalDetailModal');
const FLOWTREE_SETTINGS_STORAGE_KEY = 'flowtree-view-settings';
const FLOWTREE_SETTINGS_STORAGE_VERSION = 1;
const DEFAULT_VIEW_SETTINGS = {
    fadeInactiveBranches: false,
    hideInactiveGoals: false,
    hideCompletedGoals: false,
    showMetricsOverlay: false,
};
const EMPTY_ARRAY = [];
const TYPE_TO_ZOOM_IDLE_MS = 2000;
const TYPE_TO_ZOOM_LOCKED_IDLE_MS = 10000;
const FLOWTREE_SCOPE_TRANSITION_MS = 160;

function readLocalStorageValue(key) {
    const storage = globalThis.localStorage;
    if (typeof storage?.getItem !== 'function') return null;
    try {
        return storage.getItem(key);
    } catch {
        return null;
    }
}

function writeLocalStorageValue(key, value) {
    const storage = globalThis.localStorage;
    if (typeof storage?.setItem !== 'function') return;
    try {
        storage.setItem(key, value);
    } catch {
        // Optional preferences should not interrupt rendering in restricted storage contexts.
    }
}

function removeLocalStorageValue(key) {
    const storage = globalThis.localStorage;
    if (typeof storage?.removeItem !== 'function') return;
    try {
        storage.removeItem(key);
    } catch {
        // Optional preferences should not interrupt rendering in restricted storage contexts.
    }
}

function normalizeStoredFlowTreeSettings(rawValue) {
    if (!rawValue) return null;
    const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    const storedViewSettings = parsed?.viewSettings || parsed;
    const viewSettings = {};
    for (const key of Object.keys(DEFAULT_VIEW_SETTINGS)) {
        if (typeof storedViewSettings?.[key] === 'boolean') {
            viewSettings[key] = storedViewSettings[key];
        }
    }
    const goalsViewMode = parsed?.goalsViewMode === 'tree' || parsed?.goalsViewMode === 'hierarchy'
        ? parsed.goalsViewMode
        : null;
    return {
        goalsViewMode,
        viewSettings,
        hasSettings: goalsViewMode || Object.keys(viewSettings).length > 0,
    };
}

function FractalGoals() {
    const hideCompletedTooltip = 'Hides completed goals from the fractal tree.';
    const hideInactiveTooltip = 'Hides goals with no completed activity evidence in the active window.';
    const [isOptionsPaneMinimized, setIsOptionsPaneMinimized] = useState(true);
    const { rootId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const {
        createGoal,
        updateGoal,
        deleteGoal,
        toggleGoalCompletion,
        setActiveRootId
    } = useGoals();
    const {
        data: fractalData,
        isLoading: goalsLoading
    } = useFractalTree(rootId);
    const activeGoalWindowDays = getActiveGoalWindowDaysFromSettings(
        fractalData?.attributes?.progress_settings
    );
    const inactiveBranchTooltip = `Dims branches with no associated completed activity instances in the last ${activeGoalWindowDays} days.`;
    const { data: evidenceData, isLoading: evidenceLoading } = useFlowTreeEvidence(rootId, activeGoalWindowDays);
    const { activities = EMPTY_ARRAY, isLoading: activitiesLoading } = useActivitiesQuery(rootId);
    const { activityGroups = EMPTY_ARRAY, isLoading: activityGroupsLoading } = useActivityGroups(rootId);
    const { debugMode } = useDebug();
    const { flags } = useFeatureFlags();
    const showSurfaceConfiguration = isFeatureEnabled(flags, FEATURE_FLAGS.goalSurfaceConfiguration);
    const isMobile = useIsMobile();
    const [goalsViewMode, setGoalsViewMode] = useState(() => (getIsMobileViewport() ? 'hierarchy' : 'tree'));
    const flowTreeSettingsStorageKey = useMemo(
        () => rootId ? `${FLOWTREE_SETTINGS_STORAGE_KEY}:${user?.id || 'anonymous'}:${rootId}` : null,
        [rootId, user?.id]
    );
    const legacyFlowTreeSettingsStorageKey = useMemo(
        () => rootId ? `${FLOWTREE_SETTINGS_STORAGE_KEY}:${rootId}` : null,
        [rootId]
    );
    const { programs = EMPTY_ARRAY } = usePrograms(rootId);
    const loading = goalsLoading || activitiesLoading || activityGroupsLoading || evidenceLoading;
    const [sidebarMode, setSidebarMode] = useState(null);
    const [viewingGoal, setViewingGoal] = useState(null);

    const [showGoalModal, setShowGoalModal] = useState(false);
    const [selectedParent, setSelectedParent] = useState(null);
    const [fractalToDelete, setFractalToDelete] = useState(null);

    const [alertData, setAlertData] = useState({ isOpen: false, title: '', message: '' });
    const [viewSettings, setViewSettings] = useState(DEFAULT_VIEW_SETTINGS);

    // --- Configurable page surface state ---
    const { surfaces, createSurface, updateSurface, setDefaultSurface, deleteSurface } = usePageSurfaces(rootId, 'goals', {
        enabled: showSurfaceConfiguration,
    });
    const [activeSurfaceId, setActiveSurfaceId] = useState(null);
    const [workingConfig, setWorkingConfig] = useState(null);
    const [isConfigureMode, setIsConfigureMode] = useState(false);
    const [selectedPanelId, setSelectedPanelId] = useState(null);
    const [isSurfaceDirty, setIsSurfaceDirty] = useState(false);
    const [surfacePointerCell, setSurfacePointerCell] = useState(null);
    const [configViewportIsMobile, setConfigViewportIsMobile] = useState(isMobile);
    const [surfaceDrafts, setSurfaceDrafts] = useState({ desktop: null, mobile: null });
    const [flowTreeScopeTransitionKey, setFlowTreeScopeTransitionKey] = useState(0);
    const [typeToZoomQuery, setTypeToZoomQuery] = useState('');
    const [isTypeToZoomOpen, setIsTypeToZoomOpen] = useState(false);
    const [isTypeToZoomLocked, setIsTypeToZoomLocked] = useState(false);
    const [duplicateCycleIndex, setDuplicateCycleIndex] = useState(0);
    const [cycleZoomTargetNodeId, setCycleZoomTargetNodeId] = useState(null);
    const typeToZoomIdleTimerRef = useRef(null);
    const flowTreeRef = useRef(null);
    const flowTreeScopeTransitionTimerRef = useRef(null);
    const shouldPreserveFlowTreePreferencesRef = useRef(false);
    const [hasHydratedFlowTreeSettings, setHasHydratedFlowTreeSettings] = useState(false);
    const selectedNodeId = viewingGoal ? (viewingGoal.attributes?.id || viewingGoal.id) : null;
    const evidenceGoalIds = useMemo(() => {
        if (!evidenceData) return null;
        return new Set((evidenceData.goal_ids || []).map((goalId) => String(goalId)));
    }, [evidenceData]);
    const flowtreeMaps = useMemo(() => buildTreeMaps(fractalData), [fractalData]);
    const surfaceGoals = useMemo(
        () => Array.from(flowtreeMaps.nodeById.values()),
        [flowtreeMaps.nodeById]
    );
    const hiddenInactiveGoalIds = useMemo(() => {
        if (!viewSettings.hideInactiveGoals) return null;
        return getInactiveNodeIds(
            flowtreeMaps.nodeById,
            flowtreeMaps.childrenById,
            evidenceGoalIds || new Set()
        );
    }, [evidenceGoalIds, flowtreeMaps, viewSettings.hideInactiveGoals]);
    const visibleGoalIds = useMemo(() => {
        if (!fractalData) return [];
        const filterHiddenInactive = (ids) => (
            hiddenInactiveGoalIds ? ids.filter((id) => !hiddenInactiveGoalIds.has(id)) : ids
        );
        if (selectedNodeId) {
            return filterHiddenInactive(Array.from(getLineagePath(fractalData, selectedNodeId)));
        }
        return filterHiddenInactive(Array.from(flowtreeMaps.nodeById.keys()));
    }, [flowtreeMaps, fractalData, hiddenInactiveGoalIds, selectedNodeId]);
    const { data: flowtreeMetricsSummary } = useFlowtreeSessionMetrics(
        rootId,
        visibleGoalIds,
        { enabled: viewSettings.showMetricsOverlay, days: activeGoalWindowDays }
    );
    const typeToZoomCandidates = useMemo(() => (
        getVisibleGoalSearchCandidates(fractalData, {
            selectedNodeId,
            hideCompletedGoals: viewSettings.hideCompletedGoals,
            hiddenInactiveGoalIds,
        })
    ), [fractalData, hiddenInactiveGoalIds, selectedNodeId, viewSettings.hideCompletedGoals]);
    const typeToZoomResults = useMemo(() => (
        getGoalSearchMatches(typeToZoomCandidates, typeToZoomQuery)
    ), [typeToZoomCandidates, typeToZoomQuery]);
    const activeDuplicateGroup = typeToZoomResults.activeDuplicateGroup;
    const activeDuplicateCount = activeDuplicateGroup?.length || 0;
    const visibleMatchCount = typeToZoomResults.matches.length;
    const activeCycleGroup = isTypeToZoomLocked ? typeToZoomResults.matches : activeDuplicateGroup;
    const activeCycleCount = activeCycleGroup?.length || 0;
    const cycleZoomTargetIsCurrent = Boolean(
        cycleZoomTargetNodeId && activeCycleGroup?.some((match) => match.id === cycleZoomTargetNodeId)
    );
    const effectiveZoomTargetNodeId = isTypeToZoomOpen && typeToZoomQuery && !isTypeToZoomLocked && visibleMatchCount === 1
        ? typeToZoomResults.matches[0].id
        : (cycleZoomTargetIsCurrent ? cycleZoomTargetNodeId : null);
    const duplicateCycleDisplay = activeDuplicateCount > 1
        ? `${(duplicateCycleIndex % activeDuplicateCount) + 1}/${activeDuplicateCount}`
        : null;
    const lockedCycleDisplay = isTypeToZoomLocked && activeCycleCount > 0
        ? `${(duplicateCycleIndex % activeCycleCount) + 1}/${activeCycleCount}`
        : null;

    const clearTypeToZoomSearch = useCallback(() => {
        setTypeToZoomQuery('');
        setIsTypeToZoomOpen(false);
        setIsTypeToZoomLocked(false);
        setDuplicateCycleIndex(0);
        setCycleZoomTargetNodeId(null);
    }, []);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        setActiveRootId(rootId);
        removeLocalStorageValue('fractal_recent_root_id');
        if (user?.id) {
            writeLocalStorageValue(`fractal_recent_root_id:${user.id}`, rootId);
        }

        return () => setActiveRootId(null);
    }, [rootId, navigate, setActiveRootId, user?.id]);

    useEffect(() => {
        shouldPreserveFlowTreePreferencesRef.current = false;
        setHasHydratedFlowTreeSettings(false);
        if (!flowTreeSettingsStorageKey) {
            setHasHydratedFlowTreeSettings(true);
            return;
        }

        try {
            const raw = readLocalStorageValue(flowTreeSettingsStorageKey)
                || readLocalStorageValue(legacyFlowTreeSettingsStorageKey);
            const normalized = normalizeStoredFlowTreeSettings(raw);
            if (normalized?.hasSettings) {
                shouldPreserveFlowTreePreferencesRef.current = true;
                if (Object.keys(normalized.viewSettings).length > 0) {
                    setViewSettings((prev) => ({
                        ...prev,
                        ...normalized.viewSettings,
                    }));
                }
                if (normalized.goalsViewMode) {
                    setGoalsViewMode(normalized.goalsViewMode);
                }
            }
        } catch {
            // Ignore stale or malformed preference data.
        } finally {
            setHasHydratedFlowTreeSettings(true);
        }
    }, [flowTreeSettingsStorageKey, legacyFlowTreeSettingsStorageKey]);

    useEffect(() => {
        if (!flowTreeSettingsStorageKey || !hasHydratedFlowTreeSettings) return;
        writeLocalStorageValue(flowTreeSettingsStorageKey, JSON.stringify({
            version: FLOWTREE_SETTINGS_STORAGE_VERSION,
            goalsViewMode,
            viewSettings,
        }));
    }, [flowTreeSettingsStorageKey, goalsViewMode, hasHydratedFlowTreeSettings, viewSettings]);

    const isSidebarOpen = showGoalModal || !!sidebarMode;
    const surfaceViewMode = isSidebarOpen && !isMobile ? 'scoped' : 'overview';

    const applySurfaceTreeView = useCallback((config, mode = surfaceViewMode, mobileOverride = configViewportIsMobile, options = {}) => {
        if (options.respectStoredPreferences !== false && shouldPreserveFlowTreePreferencesRef.current) {
            return;
        }
        const activeConfig = getSurfaceModeConfig(config, mode, { mobile: mobileOverride });
        const treeId = getTreePanelId(activeConfig?.panel_contents);
        const treeView = treeId ? activeConfig.panel_contents[treeId]?.treeView : null;
        if (!treeView) return;
        setViewSettings({
            fadeInactiveBranches: !!treeView.fadeInactiveBranches,
            hideInactiveGoals: !!treeView.hideInactiveGoals,
            hideCompletedGoals: !!treeView.hideCompletedGoals,
            showMetricsOverlay: !!treeView.showMetricsOverlay,
        });
        if (treeView.mode === 'tree' || treeView.mode === 'hierarchy') {
            setGoalsViewMode(treeView.mode);
        }
    }, [configViewportIsMobile, surfaceViewMode]);

    // Load the default surface (if any) into the working config when surfaces
    // resolve, and hydrate the tree's view settings from its tree panel. On
    // mobile we load the mobile_config variant (seeding it from desktop if the
    // surface predates mobile support).
    const loadSurfaceConfig = useCallback((surface, mobileOverride = null, options = {}) => {
        const targetIsMobile = mobileOverride ?? isMobile;
        let desktopConfig = null;
        let mobileConfig = null;
        if (surface) {
            desktopConfig = sanitizeSurfaceConfig(surface.desktop_config);
            mobileConfig = sanitizeSurfaceConfig(surface.mobile_config, { mobile: true })
                || seedMobileFromDesktop(surface.desktop_config);
        }
        const effectiveDesktop = desktopConfig || getDefaultSurfaceConfig();
        const effectiveMobile = mobileConfig || getDefaultSurfaceConfig({ mobile: true });
        const effective = targetIsMobile ? effectiveMobile : effectiveDesktop;
        setSurfaceDrafts({ desktop: effectiveDesktop, mobile: effectiveMobile });
        setWorkingConfig(effective);
        setActiveSurfaceId(surface?.id || null);
        setConfigViewportIsMobile(targetIsMobile);
        setIsSurfaceDirty(false);
        applySurfaceTreeView(effective, surfaceViewMode, targetIsMobile, options);
    }, [applySurfaceTreeView, isMobile, surfaceViewMode]);

    useEffect(() => {
        if (showSurfaceConfiguration) return;
        setIsConfigureMode(false);
        setSelectedPanelId(null);
        setSurfacePointerCell(null);
        loadSurfaceConfig(null, configViewportIsMobile);
    }, [configViewportIsMobile, loadSurfaceConfig, showSurfaceConfiguration]);

    useEffect(() => {
        if (!rootId || workingConfig) return;
        const defaultSurface = surfaces.find((s) => s.is_default) || null;
        loadSurfaceConfig(defaultSurface);
    }, [rootId, surfaces, workingConfig, loadSurfaceConfig]);

    useEffect(() => {
        if (!rootId || !workingConfig || configViewportIsMobile === isMobile) return;
        const surface = surfaces.find((s) => s.id === activeSurfaceId)
            || surfaces.find((s) => s.is_default)
            || null;
        const timer = window.setTimeout(() => loadSurfaceConfig(surface, isMobile), 0);
        return () => window.clearTimeout(timer);
    }, [
        activeSurfaceId,
        configViewportIsMobile,
        isMobile,
        loadSurfaceConfig,
        rootId,
        surfaces,
        workingConfig,
    ]);

    useEffect(() => {
        if (!workingConfig) return undefined;
        const timer = window.setTimeout(
            () => applySurfaceTreeView(workingConfig, surfaceViewMode, configViewportIsMobile),
            0
        );
        return () => window.clearTimeout(timer);
    }, [applySurfaceTreeView, configViewportIsMobile, surfaceViewMode, workingConfig]);

    // The effective config injects the live tree view settings into the tree
    // panel so the FlowTree options pane keeps driving the tree directly.
    const effectiveSurfaceConfig = useMemo(() => {
        const base = workingConfig || getDefaultSurfaceConfig({ mobile: configViewportIsMobile });
        const active = getSurfaceModeConfig(base, surfaceViewMode, { mobile: configViewportIsMobile });
        const treeId = getTreePanelId(active.panel_contents);
        if (!treeId) return active;
        const nextActive = {
            ...active,
            panel_contents: {
                ...active.panel_contents,
                [treeId]: {
                    kind: 'tree',
                    treeView: {
                        mode: goalsViewMode,
                        fadeInactiveBranches: viewSettings.fadeInactiveBranches,
                        hideInactiveGoals: viewSettings.hideInactiveGoals,
                        hideCompletedGoals: viewSettings.hideCompletedGoals,
                        showMetricsOverlay: viewSettings.showMetricsOverlay,
                    },
                },
            },
        };
        return getSurfaceModeConfig(
            updateSurfaceModeConfig(base, surfaceViewMode, nextActive, { mobile: configViewportIsMobile }),
            surfaceViewMode,
            { mobile: configViewportIsMobile }
        );
    }, [workingConfig, goalsViewMode, viewSettings, configViewportIsMobile, surfaceViewMode]);


    const handleSurfaceConfigChange = useCallback((updater) => {
        setWorkingConfig((prev) => {
            const base = prev || getDefaultSurfaceConfig({ mobile: configViewportIsMobile });
            const active = getSurfaceModeConfig(base, surfaceViewMode, { mobile: configViewportIsMobile });
            const nextActive = typeof updater === 'function' ? updater(active) : updater;
            const next = updateSurfaceModeConfig(base, surfaceViewMode, nextActive, { mobile: configViewportIsMobile });
            setSurfaceDrafts((drafts) => ({
                ...drafts,
                [configViewportIsMobile ? 'mobile' : 'desktop']: next,
            }));
            return next;
        });
        setIsSurfaceDirty(true);
    }, [configViewportIsMobile, surfaceViewMode]);

    const surfaceSharedData = useMemo(() => ({
        rootId,
        goals: surfaceGoals,
        activities,
        activityGroups,
        programs,
        visibleGoalIds,
        activeGoalWindowDays,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    }), [rootId, surfaceGoals, activities, activityGroups, programs, visibleGoalIds, activeGoalWindowDays]);

    const buildSurfacePayload = useCallback(() => {
        // The working config corresponds to the selected target (desktop vs
        // mobile). Persist it to the matching field while preserving the other
        // draft or falling back to the existing surface.
        const existing = surfaces.find((s) => s.id === activeSurfaceId);
        if (configViewportIsMobile) {
            const desktop = surfaceDrafts.desktop
                || (existing?.desktop_config
                ? (sanitizeSurfaceConfig(existing.desktop_config) || getDefaultSurfaceConfig())
                : getDefaultSurfaceConfig());
            return { desktop_config: desktop, mobile_config: effectiveSurfaceConfig };
        }
        const mobile = surfaceDrafts.mobile
            || (existing?.mobile_config
                ? (sanitizeSurfaceConfig(existing.mobile_config, { mobile: true })
                    || seedMobileFromDesktop(effectiveSurfaceConfig))
                : seedMobileFromDesktop(effectiveSurfaceConfig));
        return { desktop_config: effectiveSurfaceConfig, mobile_config: mobile };
    }, [effectiveSurfaceConfig, surfaces, activeSurfaceId, configViewportIsMobile, surfaceDrafts]);

    const handleSurfaceConfigTargetChange = useCallback((target) => {
        const nextIsMobile = target === 'mobile';
        if (nextIsMobile === configViewportIsMobile) return;
        const currentKey = configViewportIsMobile ? 'mobile' : 'desktop';
        const nextKey = nextIsMobile ? 'mobile' : 'desktop';
        const nextDrafts = {
            ...surfaceDrafts,
            [currentKey]: effectiveSurfaceConfig,
        };
        let nextConfig = nextDrafts[nextKey];
        if (!nextConfig) {
            nextConfig = nextIsMobile
                ? seedMobileFromDesktop(nextDrafts.desktop || effectiveSurfaceConfig)
                : getDefaultSurfaceConfig();
            nextDrafts[nextKey] = nextConfig;
        }
        setSurfaceDrafts(nextDrafts);
        setWorkingConfig(nextConfig);
        setConfigViewportIsMobile(nextIsMobile);
        applySurfaceTreeView(nextConfig);
    }, [applySurfaceTreeView, configViewportIsMobile, effectiveSurfaceConfig, surfaceDrafts]);

    const handleEnterConfigureMode = useCallback(() => {
        setIsConfigureMode(true);
        setSelectedPanelId(null);
        setSurfacePointerCell(null);
    }, []);

    const handleCancelConfigureMode = useCallback(() => {
        const surface = surfaces.find((s) => s.id === activeSurfaceId)
            || surfaces.find((s) => s.is_default)
            || null;
        loadSurfaceConfig(surface, configViewportIsMobile);
        setIsConfigureMode(false);
        setSelectedPanelId(null);
        setSurfacePointerCell(null);
    }, [activeSurfaceId, configViewportIsMobile, loadSurfaceConfig, surfaces]);

    const handleSaveSurface = useCallback(async () => {
        const payload = buildSurfacePayload();
        try {
            if (activeSurfaceId) {
                await updateSurface({ layoutId: activeSurfaceId, ...payload });
            } else {
                const created = await createSurface({ name: 'My Surface', is_default: true, ...payload });
                if (created?.id) setActiveSurfaceId(created.id);
            }
            setIsSurfaceDirty(false);
            setIsConfigureMode(false);
            setSelectedPanelId(null);
            setSurfacePointerCell(null);
            notify.success('Surface saved');
        } catch {
            // usePageSurfaces owns the error toast.
        }
    }, [activeSurfaceId, buildSurfacePayload, updateSurface, createSurface]);

    const handleSaveSurfaceAs = useCallback(async (name) => {
        const trimmed = (name || '').trim();
        if (!trimmed) return;
        const payload = buildSurfacePayload();
        try {
            const created = await createSurface({ name: trimmed, ...payload });
            if (created?.id) {
                setActiveSurfaceId(created.id);
            }
            setIsSurfaceDirty(false);
            setIsConfigureMode(false);
            setSelectedPanelId(null);
            setSurfacePointerCell(null);
            notify.success('Surface saved');
        } catch {
            // usePageSurfaces owns the error toast.
        }
    }, [buildSurfacePayload, createSurface]);

    const handleSetDefaultSurface = useCallback(async () => {
        if (!activeSurfaceId) return;
        await setDefaultSurface(activeSurfaceId);
    }, [activeSurfaceId, setDefaultSurface]);

    const handleDeleteSurface = useCallback(async () => {
        if (!activeSurfaceId) return;
        await deleteSurface(activeSurfaceId);
        loadSurfaceConfig(null, configViewportIsMobile);
        setIsConfigureMode(false);
        setSelectedPanelId(null);
        setSurfacePointerCell(null);
    }, [activeSurfaceId, configViewportIsMobile, deleteSurface, loadSurfaceConfig]);

    const handleGoalsViewModeChange = useCallback((mode) => {
        shouldPreserveFlowTreePreferencesRef.current = true;
        setGoalsViewMode(mode);
        if (isConfigureMode) setIsSurfaceDirty(true);
    }, [isConfigureMode]);

    useEffect(() => {
        if (!isTypeToZoomOpen || !typeToZoomQuery) return undefined;

        if (typeToZoomIdleTimerRef.current) {
            clearTimeout(typeToZoomIdleTimerRef.current);
        }

        const idleDuration = isTypeToZoomLocked ? TYPE_TO_ZOOM_LOCKED_IDLE_MS : TYPE_TO_ZOOM_IDLE_MS;
        typeToZoomIdleTimerRef.current = setTimeout(() => {
            clearTypeToZoomSearch();
        }, idleDuration);

        return () => {
            if (typeToZoomIdleTimerRef.current) {
                clearTimeout(typeToZoomIdleTimerRef.current);
                typeToZoomIdleTimerRef.current = null;
            }
        };
    }, [
        clearTypeToZoomSearch,
        cycleZoomTargetNodeId,
        duplicateCycleIndex,
        isTypeToZoomLocked,
        isTypeToZoomOpen,
        typeToZoomQuery,
    ]);

    useEffect(() => () => {
        if (flowTreeScopeTransitionTimerRef.current) {
            clearTimeout(flowTreeScopeTransitionTimerRef.current);
        }
    }, []);

    useEffect(() => {
        if (!isTypeToZoomOpen) return undefined;

        const handleTypeToZoomKeyDown = (event) => {
            if (event.defaultPrevented) return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (showGoalModal || fractalToDelete || alertData.isOpen) return;
            if (shouldIgnoreTypeToZoomKey(event)) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                clearTypeToZoomSearch();
                return;
            }

            if (event.key === 'Backspace') {
                event.preventDefault();
                setTypeToZoomQuery((current) => current.slice(0, -1));
                setIsTypeToZoomOpen((current) => current && typeToZoomQuery.length > 1);
                setIsTypeToZoomLocked(false);
                setDuplicateCycleIndex(0);
                setCycleZoomTargetNodeId(null);
                return;
            }

            if (event.key === 'Enter' && typeToZoomQuery && visibleMatchCount > 0) {
                event.preventDefault();
                setIsTypeToZoomLocked(true);
                setDuplicateCycleIndex(0);
                setCycleZoomTargetNodeId(typeToZoomResults.matches[0].id);
                return;
            }

            if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && activeCycleCount > 1) {
                event.preventDefault();
                setDuplicateCycleIndex((current) => {
                    const direction = event.key === 'ArrowDown' ? 1 : -1;
                    const nextIndex = (current + direction + activeCycleCount) % activeCycleCount;
                    const nextTarget = activeCycleGroup[nextIndex];
                    if (nextTarget) setCycleZoomTargetNodeId(nextTarget.id);
                    return nextIndex;
                });
                return;
            }

            const queryCharacter = getQueryCharacter(event);
            if (queryCharacter) {
                event.preventDefault();
                setIsTypeToZoomOpen(true);
                setIsTypeToZoomLocked(false);
                setDuplicateCycleIndex(0);
                setCycleZoomTargetNodeId(null);
                setTypeToZoomQuery((current) => `${current}${queryCharacter}`);
            }
        };

        window.addEventListener('keydown', handleTypeToZoomKeyDown, true);
        return () => window.removeEventListener('keydown', handleTypeToZoomKeyDown, true);
    }, [
        activeCycleCount,
        activeCycleGroup,
        alertData.isOpen,
        clearTypeToZoomSearch,
        fractalToDelete,
        isTypeToZoomOpen,
        showGoalModal,
        typeToZoomQuery.length,
        typeToZoomQuery,
        typeToZoomResults.matches,
        visibleMatchCount,
    ]);

    useEffect(() => {
        const handleTypeToZoomStartKeyDown = (event) => {
            if (isTypeToZoomOpen) return;
            if (event.defaultPrevented) return;
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (showGoalModal || fractalToDelete || alertData.isOpen) return;
            if (shouldIgnoreTypeToZoomKey(event)) return;
            if (!isSearchCharacter(event.key)) return;

            event.preventDefault();
            setIsTypeToZoomOpen(true);
            setIsTypeToZoomLocked(false);
            setDuplicateCycleIndex(0);
            setCycleZoomTargetNodeId(null);
            setTypeToZoomQuery(event.key);
        };

        window.addEventListener('keydown', handleTypeToZoomStartKeyDown, true);
        return () => window.removeEventListener('keydown', handleTypeToZoomStartKeyDown, true);
    }, [alertData.isOpen, fractalToDelete, isTypeToZoomOpen, showGoalModal]);

    useEffect(() => {
        if (!fractalData || !viewingGoal) return;
        const viewingId = getGoalNodeId(viewingGoal);
        const updatedGoal = findGoalNodeById(fractalData, viewingId);

        if (updatedGoal && updatedGoal !== viewingGoal) {
            setViewingGoal(updatedGoal);
        }
    }, [fractalData, viewingGoal]);

    const showAlert = useCallback((title, message) => {
        setAlertData({ isOpen: true, title, message });
    }, []);

    const handleGoalNameClick = useCallback((nodeDatum) => {
        setViewingGoal(nodeDatum);
        setSidebarMode('goal-details');
    }, []);

    const handleAddChildClick = useCallback((nodeDatum) => {
        const parentType = nodeDatum.attributes?.type || nodeDatum.type;
        const childType = getChildType(parentType);

        if (!childType) {
            showAlert('Notice', 'This goal type cannot have children.');
            return;
        }

        setSelectedParent(nodeDatum);
        setShowGoalModal(true);
    }, [showAlert]);

    const handleCreateGoal = async (goalData) => {
        try {
            const newGoal = await createGoal(rootId, goalData);
            setShowGoalModal(false);
            return newGoal;
        } catch (err) {
            showAlert('Creation Failed', 'Error creating goal: ' + err.message);
            return null;
        }
    };

    const handleUpdateNode = async (goalIdOrPayload, maybePayload) => {
        try {
            const payload = maybePayload || goalIdOrPayload;
            const nodeId = maybePayload
                ? goalIdOrPayload
                : (viewingGoal.id || viewingGoal.attributes?.id);
            const updated = await updateGoal(rootId, String(nodeId), payload);
            setViewingGoal(updated);
        } catch (err) {
            showAlert('Update Failed', 'Failed to update: ' + err.message);
        }
    };

    const handleToggleCompletion = async (goalId, currentStatus) => {
        try {
            await toggleGoalCompletion(rootId, goalId, !currentStatus);
        } catch (err) {
            showAlert('Update Failed', 'Error updating completion: ' + err.message);
        }
    };

    const handleDelete = async () => {
        if (!fractalToDelete) return;

        try {
            await deleteGoal(rootId, fractalToDelete.id);

            setFractalToDelete(null);
            setSidebarMode(null);
            setViewingGoal(null);
        } catch (err) {
            showAlert('Deletion Failed', 'Failed to delete: ' + err.message);
        }
    };

    const handleCloseGoalDetails = useCallback(() => {
        setShowGoalModal(false);
        setSidebarMode(null);
        setViewingGoal(null);
    }, []);

    if (rootId && location.pathname !== `/${rootId}/goals`) {
        return null;
    }

    if (loading || !fractalData) {
        return (
            <div className="loading-container">
                <p className="loading-text">Loading fractal data...</p>
            </div>
        );
    }

    const shouldShowMobileGoalModal = isMobile && isSidebarOpen;
    const handleToggleViewSetting = (settingKey) => (event) => {
        const nextChecked = event.target.checked;
        const shouldTransitionScope = settingKey === 'hideInactiveGoals' || settingKey === 'hideCompletedGoals';
        shouldPreserveFlowTreePreferencesRef.current = true;
        if (isConfigureMode) setIsSurfaceDirty(true);

        if (!shouldTransitionScope) {
            setViewSettings((prev) => ({
                ...prev,
                [settingKey]: nextChecked
            }));
            return;
        }

        flowTreeRef.current?.startFadeOut?.();
        if (flowTreeScopeTransitionTimerRef.current) {
            clearTimeout(flowTreeScopeTransitionTimerRef.current);
        }
        flowTreeScopeTransitionTimerRef.current = setTimeout(() => {
            setViewSettings((prev) => ({
                ...prev,
                [settingKey]: nextChecked
            }));
            setFlowTreeScopeTransitionKey((prev) => prev + 1);
            flowTreeScopeTransitionTimerRef.current = null;
        }, FLOWTREE_SCOPE_TRANSITION_MS);
    };
    return (
        <div className="fractal-page-container" style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
        }}>
            <div className="fractal-main-layout" style={{
                display: 'flex',
                flex: 1,
                width: '100%',
                minHeight: 0,
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div
                    className="fractal-view-wrapper"
                    style={{
                        flex: 1,
                        minWidth: 0,
                        height: '100%',
                        border: debugMode ? '2px solid var(--color-brand-danger)' : 'none',
                        boxSizing: 'border-box',
                        position: 'relative'
                    }}
                >
                    <FlowTreeOptionsPane
                        isMobile={isMobile}
                        isMinimized={isOptionsPaneMinimized}
                        onToggleMinimized={() => setIsOptionsPaneMinimized((prev) => !prev)}
                        goalsViewMode={goalsViewMode}
                        onGoalsViewModeChange={handleGoalsViewModeChange}
                        viewSettings={viewSettings}
                        onToggleViewSetting={handleToggleViewSetting}
                        inactiveBranchTooltip={inactiveBranchTooltip}
                        hideInactiveTooltip={hideInactiveTooltip}
                        hideCompletedTooltip={hideCompletedTooltip}
                        isConfigureMode={showSurfaceConfiguration && isConfigureMode}
                        onToggleConfigureMode={showSurfaceConfiguration ? handleEnterConfigureMode : null}
                        onCancelConfigureMode={handleCancelConfigureMode}
                        surfaces={showSurfaceConfiguration ? surfaces : EMPTY_ARRAY}
                        activeSurfaceId={activeSurfaceId}
                        isSurfaceDirty={isSurfaceDirty}
                        onSelectSurface={showSurfaceConfiguration ? ((id) => loadSurfaceConfig(
                            surfaces.find((s) => s.id === id) || null,
                            configViewportIsMobile,
                            { respectStoredPreferences: false }
                        )) : null}
                        onSaveSurface={handleSaveSurface}
                        onSaveSurfaceAs={handleSaveSurfaceAs}
                        onSetDefaultSurface={handleSetDefaultSurface}
                        onDeleteSurface={handleDeleteSurface}
                        surfacePointerCell={surfacePointerCell}
                        surfaceConfigTarget={configViewportIsMobile ? 'mobile' : 'desktop'}
                        onSurfaceConfigTargetChange={handleSurfaceConfigTargetChange}
                        surfaceViewMode={surfaceViewMode}
                    />
                    {isTypeToZoomOpen && typeToZoomQuery && (
                        <div className="type-to-zoom-palette" role="status" aria-live="polite">
                            <div className="type-to-zoom-label">Find goal</div>
                            <div className="type-to-zoom-query">{renderTypeToZoomQuery(typeToZoomQuery)}</div>
                            <div className="type-to-zoom-meta">
                                {visibleMatchCount === 1
                                    ? '1 match'
                                    : `${visibleMatchCount} matches`}
                                {lockedCycleDisplay && (
                                    <span className="type-to-zoom-duplicate">Locked {lockedCycleDisplay}</span>
                                )}
                                {!lockedCycleDisplay && duplicateCycleDisplay && (
                                    <span className="type-to-zoom-duplicate">Duplicate {duplicateCycleDisplay}</span>
                                )}
                            </div>
                        </div>
                    )}
                    <PageSurface
                        activeConfig={effectiveSurfaceConfig}
                        onConfigChange={handleSurfaceConfigChange}
                        configureMode={showSurfaceConfiguration && isConfigureMode}
                        viewMode={surfaceViewMode}
                        selectedPanelId={selectedPanelId}
                        onSelectedPanelIdChange={setSelectedPanelId}
                        onPointerCellChange={setSurfacePointerCell}
                        sharedWidgetData={surfaceSharedData}
                        renderTree={() => (
                            <FractalView
                                ref={flowTreeRef}
                                treeData={fractalData}
                                evidenceGoalIds={evidenceGoalIds}
                                metricsSummary={flowtreeMetricsSummary}
                                activeGoalWindowDays={activeGoalWindowDays}
                                activities={activities}
                                activityGroups={activityGroups}
                                programs={programs}
                                viewSettings={viewSettings}
                                scopeTransitionKey={flowTreeScopeTransitionKey}
                                onNodeClick={handleGoalNameClick}
                                selectedNodeId={selectedNodeId}
                                zoomTargetNodeId={effectiveZoomTargetNodeId}
                                onAddChild={handleAddChildClick}
                                sidebarOpen={isSidebarOpen}
                                layoutMode={goalsViewMode}
                                key={`${rootId}-${goalsViewMode}`}
                            />
                        )}
                        renderDetail={() => (
                            <div className="surface-detail-window">
                                <div className="surface-detail-window-content">
                                    {showGoalModal ? (
                                        <Suspense fallback={<div style={{ padding: '20px' }}>Loading Goal Details...</div>}>
                                            <GoalDetailModal
                                                isOpen={true}
                                                onClose={() => setShowGoalModal(false)}
                                                mode="create"
                                                onCreate={handleCreateGoal}
                                                parentGoal={selectedParent}
                                                activityDefinitions={activities}
                                                activityGroups={activityGroups}
                                                rootId={rootId}
                                                displayMode="panel"
                                                onGoalSelect={(goal) => {
                                                    setShowGoalModal(false);
                                                    handleGoalNameClick(goal);
                                                }}
                                            />
                                        </Suspense>
                                    ) : (
                                        <ErrorBoundary>
                                            <GoalDetailModal
                                                isOpen={true}
                                                onClose={() => {
                                                    setSidebarMode(null);
                                                    setViewingGoal(null);
                                                }}
                                                goal={viewingGoal}
                                                onUpdate={handleUpdateNode}
                                                onDelete={(node) => setFractalToDelete(node)}
                                                onAddChild={handleAddChildClick}
                                                onToggleCompletion={handleToggleCompletion}
                                                evidenceGoalIds={evidenceGoalIds}
                                                activityDefinitions={activities}
                                                rootId={rootId}
                                                treeData={fractalData}
                                                displayMode="panel"
                                                programs={programs}
                                                activityGroups={activityGroups}
                                                onGoalSelect={handleGoalNameClick}
                                            />
                                        </ErrorBoundary>
                                    )}
                                </div>
                            </div>
                        )}
                    />
                </div>
            </div>

            {shouldShowMobileGoalModal && (
                <Suspense fallback={<div className="loading-spinner">Loading Goal Details...</div>}>
                    {showGoalModal ? (
                        <GoalDetailModal
                            isOpen={true}
                            onClose={handleCloseGoalDetails}
                            mode="create"
                            onCreate={handleCreateGoal}
                            parentGoal={selectedParent}
                            activityDefinitions={activities}
                            activityGroups={activityGroups}
                            rootId={rootId}
                            displayMode="modal"
                            onGoalSelect={(goal) => {
                                setShowGoalModal(false);
                                handleGoalNameClick(goal);
                            }}
                        />
                    ) : (
                        <GoalDetailModal
                            isOpen={true}
                            onClose={handleCloseGoalDetails}
                            goal={viewingGoal}
                            onUpdate={handleUpdateNode}
                            activityDefinitions={activities}
                            onToggleCompletion={handleToggleCompletion}
                            onAddChild={handleAddChildClick}
                            onDelete={(node) => setFractalToDelete(node)}
                            evidenceGoalIds={evidenceGoalIds}
                            rootId={rootId}
                            treeData={fractalData}
                            displayMode="modal"
                            programs={programs}
                            activityGroups={activityGroups}
                            onGoalSelect={handleGoalNameClick}
                        />
                    )}
                </Suspense>
            )}

            <DeleteConfirmModal
                isOpen={!!fractalToDelete}
                onClose={() => setFractalToDelete(null)}
                onConfirm={handleDelete}
                title="Delete Goal?"
                message={`Are you sure you want to delete "${fractalToDelete?.name}" and all its children?`}
                requireMatchingText="delete"
            />

            <AlertModal
                isOpen={alertData.isOpen}
                onClose={() => setAlertData({ ...alertData, isOpen: false })}
                title={alertData.title}
                message={alertData.message}
            />
        </div>
    );
}

export default FractalGoals;
