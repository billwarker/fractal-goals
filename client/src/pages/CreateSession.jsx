import { logError } from '../utils/logger';
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from '../hooks/queryKeys';
import { invalidateOnboardingProgress } from '../utils/queryInvalidation';
import { useCreateSessionPageData } from '../hooks/useCreateSessionPageData';
import notify from '../utils/notify';
import {
    ProgramSelector,
    SourceSelector,
    ProgramDayPicker,
    TemplatePicker,
    CreateSessionActions,
    QuickSessionModal,
    SessionGoalScopePanel,
    ProgramDayTodayBanner,
    ProgramName,
} from '../components/createSession';
import LoadingState from '../components/common/LoadingState';
import { QueuedQuickSessionProvider } from '../contexts/ActiveSessionContext';
import { useAuth } from '../contexts/AuthContext';
import { useActiveSession } from '../hooks/useSessionQueries';
import useIsMobile from '../hooks/useIsMobile';
import { isQuickSession } from '../utils/sessionRuntime';
import { buildTemplateSessionPayload } from '../utils/createSessionPayload';
import { buildQueuedQuickSession, sanitizeMetrics, sanitizeSets } from '../utils/createSessionQuickDraft';
import { programSessionToTemplate } from '../utils/createSessionProgramDay';
import PageHeader from '../components/layout/PageHeader';
import HeaderButton from '../components/layout/HeaderButton';
import Modal from '../components/atoms/Modal';
import ModalBody from '../components/atoms/ModalBody';
import headerStyles from '../components/layout/PageHeader.module.css';
import styles from './CreateSession.module.css';
import '../App.css';
import { useTimezone } from '../contexts/TimezoneContext';
import { getISOYMDInTimezone } from '../utils/dateUtils';
import { useCreateSessionAutoSelection, useCreateSessionProgramContext } from '../hooks/useCreateSessionProgramContext';

/**
 * Create Session Page
 * Select from a program day or template, optionally define goal scope, then create.
 * 
 * Refactored to use focused sub-components for each step:
 * - ProgramSelector (Step 0a): Choose program when multiple available
 * - SourceSelector (Step 0b): Choose between program days vs templates  
 * - ProgramDayPicker (Step 1): Select program day and session
 * - TemplatePicker (Step 1): Select template directly
 * - SessionGoalScopePanel (optional): Add manual scope beside locked activity-derived goals
 * - CreateSessionActions (Step 2): Create button and summary
 */
function CreateSession() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const isMobile = useIsMobile();
    const { timezone } = useTimezone();
    const todayISO = useMemo(
        () => getISOYMDInTimezone(new Date(), timezone || 'UTC'),
        [timezone],
    );
    const { data: existingActiveSession, isFetched: activeSessionFetched } = useActiveSession(user?.id, rootId);
    // Selection state
    const [selectedProgramId, setSelectedProgramId] = useState(null);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [selectedProgramDay, setSelectedProgramDay] = useState(null);
    const [selectedProgramSession, setSelectedProgramSession] = useState(null);
    const [sessionSource, setSessionSource] = useState(null); // 'program' or 'template'
    const [queuedQuickSession, setQueuedQuickSession] = useState(null);
    const [quickSessionModalOpen, setQuickSessionModalOpen] = useState(false);
    const [manualGoalIds, setManualGoalIds] = useState([]);
    const [mobileGoalsOpen, setMobileGoalsOpen] = useState(false);

    // UI state
    const [creating, setCreating] = useState(false);
    const {
        templates,
        programDays,
        programsById,
        activeProgram,
        activityDefinitions,
        activityGroups,
        allGoals,
        goalTree,
        loading,
    } = useCreateSessionPageData(rootId, todayISO);

    const selectedTemplateIsNormal = Boolean(selectedTemplate && !isQuickSession(selectedTemplate));

    useEffect(() => {
        if (!rootId) {
            navigate('/');
        }
    }, [rootId, navigate]);

    useEffect(() => {
        if (
            activeSessionFetched
            && existingActiveSession?.id
            && existingActiveSession?.root_id
        ) {
            navigate(
                `/${existingActiveSession.root_id}/session/${existingActiveSession.id}`,
                { replace: true },
            );
        }
    }, [activeSessionFetched, existingActiveSession, navigate]);

    const programIds = Object.keys(programsById);
    const defaultProgramId = programIds.length === 1 ? programIds[0] : null;
    const defaultSessionSource = (() => {
        if (programIds.length === 1 && templates.length === 0) {
            return 'program';
        }
        if (programIds.length === 0 && templates.length > 0) {
            return 'template';
        }
        return null;
    })();
    const effectiveSelectedProgramId = selectedProgramId ?? defaultProgramId;
    const effectiveSessionSource = sessionSource ?? defaultSessionSource;
    const selectedProgram = effectiveSelectedProgramId ? programsById[effectiveSelectedProgramId] : null;

    const resetSelectionState = ({ keepProgramDay = false, keepManualGoals = false } = {}) => {
        if (!keepManualGoals) setManualGoalIds([]);
        setQueuedQuickSession(null);
        setQuickSessionModalOpen(false);
        setSelectedTemplate(null);
        setSelectedProgramSession(null);
        if (!keepProgramDay) setSelectedProgramDay(null);
    };

    // Handler functions
    const handleSelectProgramDay = (programDay) => {
        resetSelectionState({ keepProgramDay: true });
        setSelectedProgramDay(programDay);

        // Auto-select if single session
        if (programDay.sessions?.length === 1) {
            const session = programDay.sessions[0];
            setSelectedProgramSession(session);
            setSelectedTemplate(programSessionToTemplate(session));
        }
    };

    const handleSelectProgramSession = (session) => {
        resetSelectionState({ keepProgramDay: true });
        setSelectedProgramSession(session);
        setSelectedTemplate(programSessionToTemplate(session));
    };

    const handleSelectSource = (source) => {
        resetSelectionState();
        setSessionSource(source);
    };

    const handleSelectProgram = (programId) => {
        resetSelectionState();
        setSelectedProgramId(String(programId));
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
        queryClient.invalidateQueries({ queryKey: queryKeys.sessionTemplates(rootId), refetchType: 'inactive' });
        queryClient.invalidateQueries({ queryKey: queryKeys.activeSessionRoot() });
        // Advances the onboarding "Create your first session" step.
        invalidateOnboardingProgress(queryClient, queryKeys);
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
            const quickTemplate = isQuickSession(template);
            const sessionData = buildTemplateSessionPayload(
                template,
                programContext ? { ...programContext, goal_scope_enabled: programScopeEnabled } : null,
                manualGoalIds,
            );
            const response = await fractalApi.createSession(rootId, sessionData);
            const createdSession = response.data;

            updateCreatedSessionCaches(createdSession);

            if (quickTemplate) return createdSession;

            navigate(`/${rootId}/session/${createdSession.id}`);
            return createdSession;
        } catch (err) {
            logError('Error creating session:', err);
            const errorMessage = err.response?.data?.error || err.message;
            notify.error('Error creating session: ' + errorMessage);
            const existingSession = err.response?.data?.active_session;
            if (err.response?.status === 409 && existingSession?.id && existingSession?.root_id) {
                navigate(`/${existingSession.root_id}/session/${existingSession.id}`, { replace: true });
            }
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
        setCreating(true);

        try {
            const quickSessionPayload = {
                ...buildTemplateSessionPayload(selectedTemplate, null),
                activity_instances: (queuedQuickSession.activityInstances || []).map((draftInstance) => ({
                    activity_definition_id: draftInstance.activity_definition_id,
                    completed: Boolean(draftInstance.completed),
                    has_sets: Boolean(draftInstance.has_sets),
                    notes: draftInstance.notes || '',
                    metrics: sanitizeMetrics(draftInstance.metrics),
                    sets: sanitizeSets(draftInstance.sets),
                })),
            };

            const completedSessionResponse = await fractalApi.completeQuickSession(rootId, quickSessionPayload);
            const completedSession = completedSessionResponse.data;

            updateCreatedSessionCaches(completedSession);
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionActivities(rootId, completedSession.id) });

            setQueuedQuickSession(null);
            setQuickSessionModalOpen(false);
            setSelectedTemplate(null);
            notify.success('Quick session completed.');
        } catch (err) {
            logError('Error completing queued quick session:', err);
            notify.error('Error completing quick session: ' + (err.response?.data?.error || err.message));
        } finally {
            setCreating(false);
        }
    };

    const handleSelectTemplate = (template) => {
        resetSelectionState();
        setSelectedTemplate(template);
        if (isQuickSession(template)) {
            setQueuedQuickSession(buildQueuedQuickSession(template, activityDefinitions));
            setQuickSessionModalOpen(true);
            return;
        }

        setQueuedQuickSession(null);
        setQuickSessionModalOpen(false);
    };

    const quickTemplateSelected = Boolean(selectedTemplate && isQuickSession(selectedTemplate) && !selectedProgramDay);
    const {
        todayProgramView, primaryTodayProgramDay, programContext, programScopeAvailable,
        programScopeEnabled, scopedGoals, offScopeManualGoalIds, setScopeEnabled,
    } = useCreateSessionProgramContext({
        rootId, userId: user?.id, todayISO, programDays, selectedProgramDay, activeProgram,
        goalTree, allGoals, manualGoalIds, quickTemplateSelected,
    });
    const scopePreviewQuery = useQuery({
        queryKey: queryKeys.sessionGoalScopePreview(
            rootId,
            selectedTemplate?.id || null,
            programScopeEnabled ? programContext?.day_id || null : null,
        ),
        queryFn: async () => (await fractalApi.previewSessionGoalScope(rootId, {
            template_id: selectedTemplate.id,
            ...(programScopeEnabled && programContext?.day_id
                ? { program_day_id: programContext.day_id }
                : {}),
        })).data,
        enabled: Boolean(rootId && selectedTemplate),
        retry: false,
    });
    const { deepLinkNotice, setDeepLinkNotice } = useCreateSessionAutoSelection({
        loading, programDays, searchParams, setSearchParams, sessionSource,
        setSelectedProgramId, setSessionSource, setSelectedProgramDay,
        setSelectedProgramSession, setSelectedTemplate,
    });
    const visibleGoalIds = useMemo(
        () => new Set(scopedGoals.map((goal) => String(goal.id ?? goal.attributes?.id))),
        [scopedGoals],
    );
    const visibleAutomaticGoalIds = useMemo(
        () => (scopePreviewQuery.data?.automatic_goal_ids || []).filter(
            (goalId) => !programScopeEnabled || visibleGoalIds.has(String(goalId)),
        ),
        [programScopeEnabled, scopePreviewQuery.data?.automatic_goal_ids, visibleGoalIds],
    );

    const handleJumpToProgramDay = () => {
        if (!primaryTodayProgramDay) return;
        setSelectedProgramId(String(primaryTodayProgramDay.program_id));
        setSessionSource('program');
        handleSelectProgramDay(primaryTodayProgramDay);
    };

    const handleCloseQuickSessionModal = () => {
        if (creating) return;
        setQuickSessionModalOpen(false);
        setQueuedQuickSession(null);
        setSelectedTemplate(null);
    };

    const handleCreateSession = async () => {
        await createSessionFromTemplate(selectedTemplate);
    };

    const handleToggleMobileGoals = () => {
        setMobileGoalsOpen((wasOpen) => !wasOpen);
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
    const hasMultiplePrograms = programIds.length > 1;
    const hasSingleProgram = programIds.length === 1;
    const showSourceChoice = hasSingleProgram && hasTemplates;
    const showProgramChoice = hasMultiplePrograms;
    const currentProgramDays = effectiveSelectedProgramId ? (programsById[effectiveSelectedProgramId]?.days || []) : [];
    const showCreationAction = !quickTemplateSelected;
    const renderCreationAction = (placement) => {
        const placementProps = placement === 'header'
            ? { headerMode: true }
            : { footerMode: true };

        return (
            <CreateSessionActions
                selectedTemplate={selectedTemplate}
                selectedProgramDay={selectedProgramDay}
                creating={creating}
                onCreateSession={handleCreateSession}
                scopeReady={!selectedTemplateIsNormal || scopePreviewQuery.isSuccess}
                {...placementProps}
            />
        );
    };
    const sessionGoalScopePanel = (
        <SessionGoalScopePanel
            goals={scopedGoals}
            manualGoalIds={manualGoalIds}
            automaticGoalIds={visibleAutomaticGoalIds}
            onChange={setManualGoalIds}
            isLoading={Boolean(selectedTemplate) && scopePreviewQuery.isLoading}
            error={selectedTemplate ? scopePreviewQuery.error : null}
            onRetry={() => scopePreviewQuery.refetch()}
            selectionDisabled={!selectedTemplateIsNormal}
            readOnly={Boolean(selectedTemplate && isQuickSession(selectedTemplate))}
            awaitingTemplate={!selectedTemplate}
            embedded={isMobile}
            hideHeading={isMobile}
            programScopeAvailable={programScopeAvailable}
            programScopeEnabled={programScopeEnabled}
            onProgramScopeChange={setScopeEnabled}
            programName={programContext?.program_name}
            programColor={programContext?.program_color}
            offScopeGoalCount={offScopeManualGoalIds.length}
            onClearOffScopeGoals={() => setManualGoalIds((current) => (
                current.filter((goalId) => !offScopeManualGoalIds.includes(goalId))
            ))}
        />
    );

    return (
        <div className={headerStyles.pageShell}>
            <PageHeader
                title="Create Session"
                subtitle={selectedProgramDay
                    ? <>Day {selectedProgramDay.day_number || selectedProgramDay.day_name} of{' '}
                        <strong
                            className={styles.selectedBlockName}
                            style={{ color: selectedProgramDay.block_color || 'var(--color-brand-primary)' }}
                        >{selectedProgramDay.block_name}</strong>
                        {' '}· <ProgramName
                            name={selectedProgramDay.program_name}
                            color={selectedProgramDay.program_color}
                        /></>
                    : programContext
                        ? <>In {programContext.block_name ? <><strong
                            className={styles.selectedBlockName}
                            style={{ color: programContext.block_color || programContext.program_color }}
                        >{programContext.block_name}</strong>{' '}· </> : null}<ProgramName
                            name={programContext.program_name}
                            color={programContext.program_color}
                        /></>
                        : 'Select a template or program day to begin your session.'}
                actions={isMobile ? (
                    <HeaderButton
                        variant="secondary"
                        onClick={handleToggleMobileGoals}
                        aria-expanded={mobileGoalsOpen}
                        aria-controls="create-session-goals"
                        aria-label={`${mobileGoalsOpen ? 'Hide' : 'Show'} Session Goals`}
                    >
                        {programScopeEnabled ? <>Session Goals · <ProgramName
                            name={programContext?.program_name}
                            color={programContext?.program_color}
                        /></> : 'Session Goals'}
                    </HeaderButton>
                ) : showCreationAction ? (
                    <div className={styles.desktopHeaderAction}>
                        {renderCreationAction('header')}
                    </div>
                ) : null}
                className={styles.createSessionHeader}
            />

            <div className={`${headerStyles.scrollContent} ${headerStyles.gridContent} ${styles.content}`}>
            <div className={styles.inner}>
                {deepLinkNotice ? (
                    <div className={styles.notice} role="status">
                        <span>{deepLinkNotice}</span>
                        <button type="button" onClick={() => setDeepLinkNotice(null)}>Dismiss</button>
                    </div>
                ) : null}
                <div className={styles.sessionWorkspaceLayout}>
                    <div className={styles.requiredSessionFlow}>
                        {todayProgramView.hasProgramDayToday && primaryTodayProgramDay ? (
                            <ProgramDayTodayBanner
                                programName={primaryTodayProgramDay.program_name}
                                programColor={primaryTodayProgramDay.program_color}
                                blockName={primaryTodayProgramDay.block_name}
                                dayName={primaryTodayProgramDay.day_name}
                                dayNumber={primaryTodayProgramDay.day_number}
                                blockColor={primaryTodayProgramDay.block_color}
                                completedCount={todayProgramView.completedCount}
                                minTemplates={todayProgramView.minTemplates}
                                totalRequired={todayProgramView.totalRequired}
                                isDayComplete={todayProgramView.isDayComplete}
                                onJumpToProgramDay={handleJumpToProgramDay}
                            />
                        ) : null}

                        {showProgramChoice && (
                            <ProgramSelector
                                programsById={programsById}
                                selectedProgramId={effectiveSelectedProgramId}
                                onSelectProgram={handleSelectProgram}
                                hasTemplates={hasTemplates}
                                sessionSource={effectiveSessionSource}
                                onSelectTemplateSource={() => handleSelectSource('template')}
                            />
                        )}

                        {showSourceChoice && (
                            <SourceSelector
                                sessionSource={effectiveSessionSource}
                                onSelectSource={handleSelectSource}
                                programName={selectedProgram?.program_name}
                                programColor={selectedProgram?.program_color}
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
                                programTemplateIds={todayProgramView.allTemplateIds}
                                requiredTemplateIds={todayProgramView.requiredTemplateIds}
                                completedTemplateIds={todayProgramView.completedTemplateIds}
                                programName={primaryTodayProgramDay?.program_name}
                                programColor={primaryTodayProgramDay?.program_color}
                            />
                        )}

                    </div>

                    {!isMobile && (
                        <div className={styles.goalScopeColumn}>
                            {sessionGoalScopePanel}
                        </div>
                    )}
                </div>

            </div>
            </div>

            {isMobile && showCreationAction && (
                <footer className={styles.stickyActionFooter}>
                    <div className={styles.stickyActionFooterInner}>
                        {renderCreationAction('footer')}
                    </div>
                </footer>
            )}

            {queuedQuickSession && (
                <QueuedQuickSessionProvider
                    rootId={rootId}
                    draftSession={queuedQuickSession}
                    activityDefinitions={activityDefinitions}
                    activityGroups={activityGroups}
                    setDraftSession={setQueuedQuickSession}
                >
                    <QuickSessionModal
                        isOpen={quickSessionModalOpen}
                        templateName={selectedTemplate?.name}
                        onClose={handleCloseQuickSessionModal}
                        onComplete={completeQueuedQuickSession}
                        isSubmitting={creating}
                    />
                </QueuedQuickSessionProvider>
            )}

            {isMobile && (
                <Modal
                    isOpen={mobileGoalsOpen}
                    onClose={() => setMobileGoalsOpen(false)}
                    title="Session Goals"
                    size="xl"
                    overlayClassName={styles.mobileGoalsOverlay}
                    className={styles.mobileGoalsSheet}
                    bodyClassName={styles.mobileGoalsModalBody}
                >
                    <ModalBody
                        id="create-session-goals"
                        noPadding
                        className={styles.mobileGoalsBody}
                    >
                        {sessionGoalScopePanel}
                    </ModalBody>
                </Modal>
            )}
        </div>
    );
}

export default CreateSession;
