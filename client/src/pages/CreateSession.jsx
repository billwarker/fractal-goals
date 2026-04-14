import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from '../hooks/queryKeys';
import { getLocalISOString } from '../utils/dateUtils';
import { useCreateSessionPageData } from '../hooks/useCreateSessionPageData';
import notify from '../utils/notify';
import {
    ProgramSelector,
    SourceSelector,
    ProgramDayPicker,
    TemplatePicker,
    CreateSessionActions,
    QuickSessionCompleteStep,
} from '../components/createSession';
import LoadingState from '../components/common/LoadingState';
import StepContainer from '../components/common/StepContainer';
import { QuickSessionWorkspace } from '../components/sessionDetail';
import { ActiveSessionProvider, QueuedQuickSessionProvider } from '../contexts/ActiveSessionContext';
import { isQuickSession } from '../utils/sessionRuntime';
import PageHeader from '../components/layout/PageHeader';
import headerStyles from '../components/layout/PageHeader.module.css';
import styles from './CreateSession.module.css';
import '../App.css';

function extractActivityId(item) {
    if (typeof item === 'string') return item;
    if (!item || typeof item !== 'object') return null;
    const direct =
        item.activity_id ||
        item.activity_definition_id ||
        item.activityId ||
        item.activityDefinitionId ||
        item.definition_id ||
        item.id;
    if (direct) return direct;
    if (item.activity && typeof item.activity === 'object') {
        return item.activity.id || item.activity.activity_id || item.activity.activity_definition_id || null;
    }
    return null;
}

function buildDraftMetrics(definition, splitId = null) {
    const metrics = Array.isArray(definition?.metric_definitions) ? definition.metric_definitions : [];
    return metrics.map((metric) => ({
        metric_id: metric.id,
        ...(splitId ? { split_id: splitId } : {}),
        value: '',
    }));
}

function buildDraftSet(definition) {
    const splits = Array.isArray(definition?.split_definitions) ? definition.split_definitions : [];
    const metrics = definition?.has_splits && splits.length > 0
        ? splits.flatMap((split) => buildDraftMetrics(definition, split.id))
        : buildDraftMetrics(definition);

    return {
        instance_id: crypto.randomUUID(),
        completed: false,
        metrics,
    };
}

function buildQueuedQuickSession(template, activityDefinitions) {
    const queuedSessionId = `queued-quick-${template.id}-${crypto.randomUUID()}`;
    const templateActivities = Array.isArray(template?.template_data?.activities) ? template.template_data.activities : [];

    const activityInstances = templateActivities
        .map((item, index) => {
            const activityId = extractActivityId(item);
            if (!activityId) return null;

            const definition = (activityDefinitions || []).find((entry) => entry.id === activityId);
            const hasSets = Boolean(definition?.has_sets);
            const metrics = hasSets ? [] : buildDraftMetrics(definition);
            const sets = hasSets ? [buildDraftSet(definition)] : [];

            return {
                id: `queued-instance-${activityId}-${index}`,
                session_id: queuedSessionId,
                activity_definition_id: activityId,
                name: definition?.name || item?.name || 'Activity',
                type: 'activity',
                completed: false,
                has_sets: hasSets,
                metrics,
                sets,
                duration_seconds: null,
                time_start: null,
                time_stop: null,
                total_paused_seconds: 0,
                notes: '',
                description: definition?.description || '',
            };
        })
        .filter(Boolean);

    const localSessionData = {
        template_id: template.id,
        template_name: template.name,
        template_color: template.template_color || template.template_data?.template_color,
        session_type: 'quick',
        activity_ids: activityInstances.map((instance) => instance.id),
        program_context: null,
    };

    return {
        session: {
            id: queuedSessionId,
            name: template.name,
            template_id: template.id,
            completed: false,
            attributes: {
                completed: false,
                session_data: localSessionData,
            },
        },
        localSessionData,
        activityInstances,
    };
}

function normalizeMetricValue(rawValue) {
    if (rawValue === '' || rawValue == null) return null;
    if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (trimmed === '') return null;
        if (!Number.isNaN(Number(trimmed))) return Number(trimmed);
        return rawValue;
    }
    return rawValue;
}

function sanitizeMetrics(metrics) {
    return (Array.isArray(metrics) ? metrics : [])
        .map((metric) => {
            const value = normalizeMetricValue(metric?.value);
            if (value == null) return null;
            return {
                metric_id: metric.metric_id,
                ...(metric.split_id ? { split_id: metric.split_id } : {}),
                value,
            };
        })
        .filter(Boolean);
}

function sanitizeSets(sets) {
    return (Array.isArray(sets) ? sets : []).map((set) => ({
        ...set,
        metrics: sanitizeMetrics(set.metrics),
    }));
}

/**
 * Create Session Page
 * Enhanced flow: Select from program day OR select template → Associate with goal → Create session
 * 
 * Refactored to use focused sub-components for each step:
 * - ProgramSelector (Step 0a): Choose program when multiple available
 * - SourceSelector (Step 0b): Choose between program days vs templates  
 * - ProgramDayPicker (Step 1): Select program day and session
 * - TemplatePicker (Step 1): Select template directly
 * - GoalAssociation (Step 2): Associate with STGs and IGs
 * - CreateSessionActions (Step 3): Create button and summary
 */
function CreateSession() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    // Selection state
    const [selectedProgram, setSelectedProgram] = useState(null);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [selectedProgramDay, setSelectedProgramDay] = useState(null);
    const [selectedProgramSession, setSelectedProgramSession] = useState(null);
    const [sessionSource, setSessionSource] = useState(null); // 'program' or 'template'
    const [activeQuickSessionId, setActiveQuickSessionId] = useState(null);
    const [queuedQuickSession, setQueuedQuickSession] = useState(null);

    // UI state
    const [creating, setCreating] = useState(false);
    const {
        templates,
        programDays,
        programsByName,
        activityDefinitions,
        activityGroups,
        loading,
    } = useCreateSessionPageData(rootId);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
        }
    }, [rootId, navigate]);

    const programNames = Object.keys(programsByName);
    const defaultProgram = programNames.length === 1 ? programNames[0] : null;
    const defaultSessionSource = (() => {
        if (programNames.length === 1 && templates.length === 0) {
            return 'program';
        }
        if (programNames.length === 0 && templates.length > 0) {
            return 'template';
        }
        return null;
    })();
    const effectiveSelectedProgram = selectedProgram ?? defaultProgram;
    const effectiveSessionSource = sessionSource ?? defaultSessionSource;

    // Handler functions
    const handleSelectProgramDay = (programDay) => {
        setActiveQuickSessionId(null);
        setQueuedQuickSession(null);
        setSelectedProgramDay(programDay);
        setSelectedProgramSession(null);
        setSelectedTemplate(null);

        // Auto-select if single session
        if (programDay.sessions?.length === 1) {
            const session = programDay.sessions[0];
            setSelectedProgramSession(session);
            setSelectedTemplate({
                id: session.template_id,
                name: session.template_name,
                description: session.template_description,
                template_data: session.template_data
            });
        }
    };

    const handleSelectProgramSession = (session) => {
        setActiveQuickSessionId(null);
        setQueuedQuickSession(null);
        setSelectedProgramSession(session);
        setSelectedTemplate({
            id: session.template_id,
            name: session.template_name,
            description: session.template_description,
            template_data: session.template_data
        });
    };

    const handleSelectSource = (source) => {
        setActiveQuickSessionId(null);
        setQueuedQuickSession(null);
        setSelectedTemplate(null);
        setSelectedProgramDay(null);
        setSelectedProgramSession(null);
        setSessionSource(source);
    };

    const handleSelectProgram = (programName) => {
        setActiveQuickSessionId(null);
        setQueuedQuickSession(null);
        setSelectedProgramDay(null);
        setSelectedProgramSession(null);
        setSelectedTemplate(null);
        setSelectedProgram(programName);
        setSessionSource('program');
    };

    const updateCreatedSessionCaches = (createdSession) => {
        const createdSessionId = createdSession.id;

        queryClient.setQueryData(queryKeys.sessionsPaginated(rootId), (prev) => {
            if (!prev || !Array.isArray(prev.pages) || prev.pages.length === 0) return prev;
            const [firstPage, ...restPages] = prev.pages;
            const existing = (firstPage.sessions || []).some((session) => session.id === createdSession.id);
            if (existing) return prev;

            const updatedFirstPage = {
                ...firstPage,
                sessions: [createdSession, ...(firstPage.sessions || [])],
                pagination: firstPage.pagination
                    ? {
                        ...firstPage.pagination,
                        total: typeof firstPage.pagination.total === 'number'
                            ? firstPage.pagination.total + 1
                            : firstPage.pagination.total
                    }
                    : firstPage.pagination
            };

            return {
                ...prev,
                pages: [updatedFirstPage, ...restPages]
            };
        });

        queryClient.setQueryData(queryKeys.sessions(rootId), (prev) => {
            if (!Array.isArray(prev)) return prev;
            if (prev.some((session) => session.id === createdSession.id)) return prev;
            return [createdSession, ...prev];
        });

        queryClient.setQueryData(queryKeys.sessionsAll(rootId), (prev) => {
            if (!Array.isArray(prev)) return prev;
            if (prev.some((session) => session.id === createdSession.id)) return prev;
            return [createdSession, ...prev];
        });

        queryClient.setQueryData(queryKeys.session(rootId, createdSessionId), createdSession);

        queryClient.invalidateQueries({ queryKey: queryKeys.sessions(rootId), refetchType: 'inactive' });
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll(rootId), refetchType: 'inactive' });
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionsPaginated(rootId), refetchType: 'inactive' });
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionsSearch(rootId), refetchType: 'inactive' });
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionsHeatmap(rootId), refetchType: 'inactive' });
    };

    const createSessionFromTemplate = async (template) => {
        if (!template) {
            notify.error('Please select a template or program day');
            return null;
        }

        if (selectedProgramDay && isQuickSession(template)) {
            notify.error('Quick session templates cannot be used from a program day');
            return null;
        }

        setCreating(true);

        try {
            const sessionStart = getLocalISOString();
            const quickTemplate = isQuickSession(template);
            const sessionDataPayload = quickTemplate
                ? {
                    template_id: template.id,
                    template_name: template.name,
                    template_color: template.template_color || template.template_data?.template_color,
                    session_type: 'quick',
                    program_context: null,
                }
                : {
                    template_id: template.id,
                    template_name: template.name,
                    template_color: template.template_color || template.template_data?.template_color,
                    session_type: 'normal',
                    program_context: selectedProgramDay ? {
                        program_id: selectedProgramDay.program_id,
                        program_name: selectedProgramDay.program_name,
                        block_id: selectedProgramDay.block_id,
                        block_name: selectedProgramDay.block_name,
                        day_id: selectedProgramDay.day_id,
                        day_name: selectedProgramDay.day_name
                    } : null,
                    sections: (template.template_data?.sections || []).map((section) => {
                        const templateItems = section.activities || section.exercises || [];
                        const exercises = templateItems
                            .map((activity) => {
                                const activityId = extractActivityId(activity);
                                if (!activityId) return null;
                                const name = typeof activity === 'object' ? activity.name : null;
                                return {
                                    type: 'activity',
                                    name: name || 'Activity',
                                    activity_id: activityId,
                                    instance_id: crypto.randomUUID(),
                                    completed: false,
                                    notes: ''
                                };
                            })
                            .filter(Boolean);

                        return {
                            ...section,
                            exercises,
                            estimated_duration_minutes: section.estimated_duration_minutes || section.duration_minutes
                        };
                    }),
                    total_duration_minutes: template.template_data?.total_duration_minutes || 0
                };

            const sessionData = {
                name: template.name,
                description: template.description || '',
                template_id: template.id,
                duration_minutes: quickTemplate ? 0 : (template.template_data?.total_duration_minutes || 0),
                session_start: sessionStart,
                session_data: sessionDataPayload,
            };

            const response = await fractalApi.createSession(rootId, sessionData);
            const createdSession = response.data;

            updateCreatedSessionCaches(createdSession);

            if (quickTemplate) return createdSession;

            navigate(`/${rootId}/session/${createdSession.id}`);
            return createdSession;
        } catch (err) {
            console.error('Error creating session:', err);
            const errorMessage = err.response?.data?.error || err.message;
            notify.error('Error creating session: ' + errorMessage);
            return null;
        } finally {
            setCreating(false);
        }
    };

    const completeQueuedQuickSession = async () => {
        if (!selectedTemplate || !queuedQuickSession) {
            notify.error('Select a quick session template first.');
            return;
        }

        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        await Promise.resolve();

        const createdSession = await createSessionFromTemplate(selectedTemplate);
        if (!createdSession?.id) {
            return;
        }

        try {
            const response = await fractalApi.getSessionActivities(rootId, createdSession.id);
            const persistedInstances = Array.isArray(response.data) ? response.data : [];
            const persistedByDefinitionId = new Map(
                persistedInstances.map((instance) => [instance.activity_definition_id, instance])
            );

            for (const draftInstance of queuedQuickSession.activityInstances || []) {
                const persistedInstance = persistedByDefinitionId.get(draftInstance.activity_definition_id);
                if (!persistedInstance) continue;

                if (draftInstance.has_sets) {
                    await fractalApi.updateActivityInstance(rootId, persistedInstance.id, {
                        session_id: createdSession.id,
                        activity_definition_id: persistedInstance.activity_definition_id,
                        completed: Boolean(draftInstance.completed),
                        sets: sanitizeSets(draftInstance.sets),
                    });
                } else {
                    const metricsPayload = sanitizeMetrics(draftInstance.metrics);
                    if (metricsPayload.length > 0) {
                        await fractalApi.updateActivityMetrics(rootId, createdSession.id, persistedInstance.id, {
                            metrics: metricsPayload,
                        });
                    }
                    await fractalApi.updateActivityInstance(rootId, persistedInstance.id, {
                        session_id: createdSession.id,
                        activity_definition_id: persistedInstance.activity_definition_id,
                        completed: Boolean(draftInstance.completed),
                    });
                }
            }

            await fractalApi.updateSession(rootId, createdSession.id, { completed: true });
            const completedSessionResponse = await fractalApi.getSession(rootId, createdSession.id);
            const completedSession = completedSessionResponse.data;

            updateCreatedSessionCaches(completedSession);
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionActivities(rootId, createdSession.id) });

            setQueuedQuickSession(null);
            setActiveQuickSessionId(createdSession.id);
            notify.success('Quick session completed.');
        } catch (err) {
            console.error('Error completing queued quick session:', err);
            notify.error('Error completing quick session: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleSelectTemplate = (template) => {
        setActiveQuickSessionId(null);
        setSelectedTemplate(template);
        setSelectedProgramDay(null);
        setSelectedProgramSession(null);
        if (isQuickSession(template)) {
            setQueuedQuickSession(buildQueuedQuickSession(template, activityDefinitions));
            notify.success('Quick session queued. Enter your values, then click "Complete Quick Session" to save it.');
            return;
        }

        setQueuedQuickSession(null);
    };

    const handleCreateSession = async () => {
        await createSessionFromTemplate(selectedTemplate);
    };

    // Loading state
    if (loading) {
        return (
            <div className="page-container">
                <LoadingState />
            </div>
        );
    }

    // Derived state for conditional rendering
    const hasProgramDays = programDays.length > 0;
    const hasTemplates = templates.length > 0;
    const hasMultiplePrograms = programNames.length > 1;
    const hasSingleProgram = programNames.length === 1;
    const showSourceChoice = hasSingleProgram && hasTemplates;
    const showProgramChoice = hasMultiplePrograms;
    const currentProgramDays = effectiveSelectedProgram ? (programsByName[effectiveSelectedProgram]?.days || []) : [];
    const quickTemplateSelected = Boolean(selectedTemplate && isQuickSession(selectedTemplate) && !selectedProgramDay);

    return (
        <div className={headerStyles.pageShell}>
            <PageHeader
                title="Create Session"
                subtitle="Select a template or program day to begin your session."
            />

            <div className={`${headerStyles.scrollContent} ${headerStyles.gridContent} ${styles.content}`}>
            <div className={styles.inner}>
                {/* Step 0a: Choose Program (if multiple programs available) */}
                {showProgramChoice && (
                    <ProgramSelector
                        programsByName={programsByName}
                        selectedProgram={effectiveSelectedProgram}
                        onSelectProgram={handleSelectProgram}
                        hasTemplates={hasTemplates}
                        sessionSource={effectiveSessionSource}
                        onSelectTemplateSource={() => handleSelectSource('template')}
                    />
                )}

                {/* Step 0b: Choose Session Source (if single program AND templates available) */}
                {showSourceChoice && (
                    <SourceSelector
                        sessionSource={effectiveSessionSource}
                        onSelectSource={handleSelectSource}
                        programName={effectiveSelectedProgram}
                    />
                )}

                {/* Step 1: Select Program Day */}
                {(effectiveSessionSource === 'program' || (hasProgramDays && !hasTemplates)) && (
                    <ProgramDayPicker
                        programDays={currentProgramDays}
                        selectedProgramDay={selectedProgramDay}
                        selectedProgramSession={selectedProgramSession}
                        hasTemplates={hasTemplates}
                        onSelectProgramDay={handleSelectProgramDay}
                        onSelectProgramSession={handleSelectProgramSession}
                        onSwitchToTemplate={() => setSessionSource('template')}
                    />
                )}

                {/* Step 1: Select Template */}
                {(effectiveSessionSource === 'template' || (!hasProgramDays && hasTemplates)) && (
                    <TemplatePicker
                        templates={templates}
                        selectedTemplate={selectedTemplate}
                        rootId={rootId}
                        onSelectTemplate={handleSelectTemplate}
                    />
                )}

                {quickTemplateSelected && creating && !activeQuickSessionId && !queuedQuickSession && (
                    <StepContainer>
                        <LoadingState label="Loading quick session..." />
                    </StepContainer>
                )}

                {quickTemplateSelected && queuedQuickSession && !activeQuickSessionId && (
                    <QueuedQuickSessionProvider
                        rootId={rootId}
                        draftSession={queuedQuickSession}
                        activityDefinitions={activityDefinitions}
                        activityGroups={activityGroups}
                        setDraftSession={setQueuedQuickSession}
                    >
                        <QuickSessionWorkspace
                            embedded
                            showCompletionAction={false}
                        />
                        <QuickSessionCompleteStep
                            onComplete={completeQueuedQuickSession}
                            isLoading={creating}
                        />
                    </QueuedQuickSessionProvider>
                )}

                {quickTemplateSelected && activeQuickSessionId && (
                    <ActiveSessionProvider rootId={rootId} sessionId={activeQuickSessionId}>
                        <QuickSessionWorkspace
                            embedded
                            showCompletionAction={false}
                            onStartAnother={() => {
                                setActiveQuickSessionId(null);
                                setQueuedQuickSession(buildQueuedQuickSession(selectedTemplate, activityDefinitions));
                            }}
                        />
                    </ActiveSessionProvider>
                )}

                {!quickTemplateSelected && (
                    <CreateSessionActions
                        selectedTemplate={selectedTemplate}
                        selectedProgramDay={selectedProgramDay}
                        creating={creating}
                        quickMode={isQuickSession(selectedTemplate)}
                        onCreateSession={handleCreateSession}
                    />
                )}
            </div>
            </div>
        </div>
    );
}

export default CreateSession;
