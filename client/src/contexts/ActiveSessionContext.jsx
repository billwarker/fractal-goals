import React, { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import useSessionAchievementNotifications from '../hooks/useSessionAchievementNotifications';
import useSessionDetailData from '../hooks/useSessionDetailData';
import useSessionDraftAutosave from '../hooks/useSessionDraftAutosave';
import useSessionDetailMutations from '../hooks/useSessionDetailMutations';
import { queryKeys } from '../hooks/queryKeys';
import { fractalApi } from '../utils/api';
import { useGoals } from './GoalsContext';

const SessionDataContext = createContext(null);
const SessionUiContext = createContext(null);
const SessionActionsContext = createContext(null);

const ActiveSessionContext = createContext(null);

export function QueuedQuickSessionProvider({
    rootId,
    draftSession,
    activityDefinitions = [],
    activityGroups = [],
    setDraftSession,
    children,
}) {
    const { setActiveRootId } = useGoals();
    const [showActivitySelector, setShowActivitySelector] = useState({});
    const [sidePaneMode, setSidePaneMode] = useState('details');
    const [draggedItem, setDraggedItem] = useState(null);

    useEffect(() => {
        if (!rootId) return;
        setActiveRootId(rootId);
        return () => setActiveRootId(null);
    }, [rootId, setActiveRootId]);

    const updateDraft = useCallback((updater) => {
        setDraftSession((previous) => {
            if (!previous) return previous;
            return typeof updater === 'function' ? updater(previous) : updater;
        });
    }, [setDraftSession]);

    const groupMap = useMemo(() => {
        if (!Array.isArray(activityGroups)) return { ungrouped: { id: 'ungrouped', name: 'Ungrouped' } };
        return activityGroups.reduce((acc, group) => {
            acc[group.id] = group;
            return acc;
        }, { ungrouped: { id: 'ungrouped', name: 'Ungrouped' } });
    }, [activityGroups]);

    const groupedActivities = useMemo(() => {
        if (!Array.isArray(activityDefinitions)) return {};
        return activityDefinitions.reduce((acc, activity) => {
            const groupId = activity.group_id || 'ungrouped';
            if (!acc[groupId]) acc[groupId] = [];
            acc[groupId].push(activity);
            return acc;
        }, {});
    }, [activityDefinitions]);

    const calculateTotalDuration = useCallback(() => (
        (draftSession?.activityInstances || []).reduce((sum, instance) => sum + (instance.duration_seconds || 0), 0)
    ), [draftSession?.activityInstances]);

    const updateInstance = useCallback((instanceId, updates) => {
        updateDraft((previous) => ({
            ...previous,
            activityInstances: (previous.activityInstances || []).map((instance) => (
                instance.id === instanceId ? { ...instance, ...updates } : instance
            )),
        }));
    }, [updateDraft]);

    const dataValue = useMemo(() => ({
        rootId,
        sessionId: draftSession?.session?.id || null,
        session: draftSession?.session || null,
        activityInstances: draftSession?.activityInstances || [],
        activities: activityDefinitions,
        activityGroups,
        parentGoals: [],
        immediateGoals: [],
        sessionGoalsView: null,
        loading: false,
        instancesLoading: false,
        activitiesLoading: false,
        sessionError: null,
        autoSaveStatus: '',
        localSessionData: draftSession?.localSessionData || null,
        groupMap,
        groupedActivities,
        targetAchievements: [],
        achievedTargetIds: [],
        goalAchievements: [],
        calculateTotalDuration,
    }), [
        activityDefinitions,
        activityGroups,
        calculateTotalDuration,
        draftSession?.activityInstances,
        draftSession?.localSessionData,
        draftSession?.session,
        groupMap,
        groupedActivities,
        rootId,
    ]);

    const uiValue = useMemo(() => ({
        sidePaneMode,
        setSidePaneMode,
        showActivitySelector,
        setShowActivitySelector,
        draggedItem,
        setDraggedItem,
    }), [draggedItem, showActivitySelector, sidePaneMode]);

    const actionsValue = useMemo(() => ({
        setLocalSessionData: (updater) => {
            updateDraft((previous) => ({
                ...previous,
                localSessionData: typeof updater === 'function'
                    ? updater(previous.localSessionData)
                    : updater,
            }));
        },
        refreshSession: async () => draftSession?.session || null,
        refreshInstances: async () => draftSession?.activityInstances || [],
        updateSession: async () => draftSession?.session || null,
        addActivity: () => {},
        removeActivity: () => {},
        updateInstance,
        updateTimer: () => {},
        createGoal: async () => null,
        updateGoal: async () => null,
        toggleGoalCompletion: async () => null,
        reorderActivity: () => {},
        moveActivity: () => {},
        deleteSession: async () => null,
        pauseSession: async () => null,
        resumeSession: async () => null,
        toggleSessionComplete: () => {},
        calculateTotalDuration,
    }), [calculateTotalDuration, draftSession?.activityInstances, draftSession?.session, updateDraft, updateInstance]);

    const value = useMemo(() => ({
        ...dataValue,
        ...uiValue,
        ...actionsValue,
    }), [actionsValue, dataValue, uiValue]);

    return (
        <SessionDataContext.Provider value={dataValue}>
            <SessionUiContext.Provider value={uiValue}>
                <SessionActionsContext.Provider value={actionsValue}>
                    <ActiveSessionContext.Provider value={value}>
                        {children}
                    </ActiveSessionContext.Provider>
                </SessionActionsContext.Provider>
            </SessionUiContext.Provider>
        </SessionDataContext.Provider>
    );
}

export function ActiveSessionProvider({ rootId, sessionId, children }) {
    const queryClient = useQueryClient();
    const { setActiveRootId } = useGoals();
    const sessionKey = queryKeys.session(rootId, sessionId);
    const sessionActivitiesKey = queryKeys.sessionActivities(rootId, sessionId);
    const sessionGoalsViewKey = queryKeys.sessionGoalsView(rootId, sessionId);
    const sessionNotesKey = queryKeys.sessionNotes(rootId, sessionId);
    const sessionsKey = queryKeys.sessions(rootId);
    const sessionsAllKey = queryKeys.sessionsAll(rootId);
    const sessionsPaginatedKey = queryKeys.sessionsPaginated(rootId);
    const fractalTreeKey = queryKeys.fractalTree(rootId);
    const activitiesKey = queryKeys.activities(rootId);

    // UI state
    const [showActivitySelector, setShowActivitySelector] = useState({});
    const [autoSaveStatus, setAutoSaveStatus] = useState('');
    const [sidePaneMode, setSidePaneMode] = useState('details');
    const [draggedItem, setDraggedItem] = useState(null);
    const [isDeletingSession, setIsDeletingSession] = useState(false);
    const statusTimeoutRef = useRef(null);
    const instanceQueuesRef = useRef(new Map());
    const instanceRollbackRef = useRef(new Map());

    const scheduleStatusClear = useCallback((delayMs) => {
        if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = setTimeout(() => {
            setAutoSaveStatus('');
            statusTimeoutRef.current = null;
        }, delayMs);
    }, []);

    const invalidateSessionListQueries = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: sessionsKey });
        queryClient.invalidateQueries({ queryKey: sessionsAllKey });
        queryClient.invalidateQueries({ queryKey: sessionsPaginatedKey });
    }, [queryClient, sessionsAllKey, sessionsKey, sessionsPaginatedKey]);

    const {
        session,
        sessionLoading,
        sessionError,
        refreshSession,
        activityInstances,
        instancesLoading,
        refreshInstances,
        activities,
        activitiesLoading,
        activityGroups,
        sessionGoalsView,
        sessionGoalsViewLoading,
        normalizedSessionData,
        groupMap,
        groupedActivities,
        parentGoals,
        immediateGoals,
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
        loading,
    } = useSessionDetailData({
        rootId,
        sessionId,
        isDeletingSession,
    });

    // 2. Mutations
    const updateSessionMutation = useMutation({
        mutationFn: (updates) => fractalApi.updateSession(rootId, sessionId, updates),
        onMutate: () => setAutoSaveStatus('saving'),
        onSuccess: (res) => {
            queryClient.setQueryData(sessionKey, res.data);
            invalidateSessionListQueries();
            setAutoSaveStatus('saved');
            scheduleStatusClear(2000);
        },
        onError: () => {
            setAutoSaveStatus('error');
            scheduleStatusClear(3000);
        }
    });

    const {
        setSessionDataDraft,
        localSessionData,
        updateSessionDataDraft,
    } = useSessionDraftAutosave({
        rootId,
        sessionId,
        normalizedSessionData,
        saveSessionData: (nextData) => updateSessionMutation.mutateAsync({ session_data: nextData }),
        setAutoSaveStatus,
        scheduleStatusClear,
        instanceQueuesRef,
        instanceRollbackRef,
        setShowActivitySelector,
        setDraggedItem,
        setSidePaneMode,
    });

    const {
        addActivity,
        removeActivity,
        updateInstance,
        updateTimer,
        createGoal,
        updateGoal,
        toggleGoalCompletion,
        reorderActivity,
        moveActivity,
        deleteSession,
        pauseSession,
        resumeSession,
        toggleSessionComplete,
        calculateTotalDuration,
    } = useSessionDetailMutations({
        rootId,
        sessionId,
        session,
        activityInstances,
        activities,
        queryClient,
        sessionKey,
        sessionActivitiesKey,
        sessionGoalsViewKey,
        sessionNotesKey,
        sessionsKey,
        sessionsAllKey,
        sessionsPaginatedKey,
        fractalTreeKey,
        activitiesKey,
        updateSession: updateSessionMutation.mutateAsync,
        updateSessionDataDraft,
        setSessionDataDraft,
        setShowActivitySelector,
        setIsDeletingSession,
        instanceQueuesRef,
        instanceRollbackRef,
    });

    // 5. Effects
    useEffect(() => {
        if (!rootId) return;
        setActiveRootId(rootId);
        return () => setActiveRootId(null);
    }, [rootId, setActiveRootId]);

    useSessionAchievementNotifications({
        rootId,
        sessionId,
        achievedTargetIds,
        targetAchievements,
        goalAchievements,
        sessionLoading,
        instancesLoading,
        sessionGoalsViewLoading,
    });

    useEffect(() => {
        return () => {
            if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
        };
    }, []);

    const dataValue = useMemo(() => ({
        rootId,
        sessionId,
        session,
        activityInstances,
        activities,
        activityGroups,
        parentGoals,
        immediateGoals,
        sessionGoalsView,
        loading,
        instancesLoading,
        activitiesLoading,
        sessionError,
        autoSaveStatus,
        localSessionData,
        groupMap,
        groupedActivities,
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
        calculateTotalDuration,
    }), [
        rootId,
        sessionId,
        session,
        activityInstances,
        activities,
        activityGroups,
        parentGoals,
        immediateGoals,
        sessionGoalsView,
        loading,
        instancesLoading,
        activitiesLoading,
        localSessionData,
        sessionError,
        autoSaveStatus,
        groupMap,
        groupedActivities,
        targetAchievements,
        achievedTargetIds,
        goalAchievements,
        calculateTotalDuration,
    ]);

    const uiValue = useMemo(() => ({
        sidePaneMode,
        setSidePaneMode,
        showActivitySelector,
        setShowActivitySelector,
        draggedItem,
        setDraggedItem
    }), [
        sidePaneMode,
        showActivitySelector,
        draggedItem
    ]);

    const actionsValue = useMemo(() => ({
        setLocalSessionData: setSessionDataDraft,
        refreshSession,
        refreshInstances,
        updateSession: updateSessionMutation.mutateAsync,
        addActivity,
        removeActivity,
        updateInstance,
        updateTimer,
        createGoal,
        updateGoal,
        toggleGoalCompletion,
        reorderActivity,
        moveActivity,
        deleteSession,
        pauseSession,
        resumeSession,
        toggleSessionComplete,
    }), [
        setSessionDataDraft,
        refreshSession,
        refreshInstances,
        updateSessionMutation.mutateAsync,
        addActivity,
        removeActivity,
        updateInstance,
        updateTimer,
        createGoal,
        updateGoal,
        toggleGoalCompletion,
        reorderActivity,
        moveActivity,
        deleteSession,
        pauseSession,
        resumeSession,
        toggleSessionComplete,
    ]);

    const value = useMemo(() => ({
        ...dataValue,
        ...uiValue,
        ...actionsValue
    }), [
        dataValue,
        uiValue,
        actionsValue
    ]);

    return (
        <SessionDataContext.Provider value={dataValue}>
            <SessionUiContext.Provider value={uiValue}>
                <SessionActionsContext.Provider value={actionsValue}>
                    <ActiveSessionContext.Provider value={value}>
                        {children}
                    </ActiveSessionContext.Provider>
                </SessionActionsContext.Provider>
            </SessionUiContext.Provider>
        </SessionDataContext.Provider>
    );
}

export function useActiveSessionData() {
    const context = useContext(SessionDataContext);
    if (!context) {
        throw new Error('useActiveSessionData must be used within an ActiveSessionProvider');
    }
    return context;
}

export function useActiveSessionUi() {
    const context = useContext(SessionUiContext);
    if (!context) {
        throw new Error('useActiveSessionUi must be used within an ActiveSessionProvider');
    }
    return context;
}

export function useActiveSessionActions() {
    const context = useContext(SessionActionsContext);
    if (!context) {
        throw new Error('useActiveSessionActions must be used within an ActiveSessionProvider');
    }
    return context;
}

export function useActiveSession() {
    const context = useContext(ActiveSessionContext);
    if (!context) {
        throw new Error('useActiveSession must be used within an ActiveSessionProvider');
    }
    return context;
}
