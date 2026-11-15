import { logError } from '../utils/logger';
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from '../hooks/queryKeys';
import { updateCreatedSessionCaches } from '../utils/createdSessionCache';
import { useCreateSessionPageData } from '../hooks/useCreateSessionPageData';
import notify from '../utils/notify';
import {
    ProgramSelector,
    SourceSelector,
    ProgramDayPicker,
    TemplatePicker,
    CreateSessionActions,
    QuickSessionSection,
    RecentQuickSessions,
    SessionGoalScopePanel,
    ProgramDayTodayBanner,
    ProgramName,
    SessionPlanChooser, useSessionPlanChoice,
} from '../components/createSession';
import LoadingState from '../components/common/LoadingState';
import { useAuth } from '../contexts/AuthContext';
import { useActiveSession } from '../hooks/useSessionQueries';
import useIsMobile from '../hooks/useIsMobile';
import { useQuickSessionComposer } from '../hooks/useQuickSessionComposer';
import { useRecentQuickSessions } from '../hooks/useRecentQuickSessions';
import { buildTemplateSessionPayload } from '../utils/createSessionPayload';
import { buildPreviousProgramDays, programSessionToTemplate } from '../utils/createSessionProgramDay';
import { useProgramPlanOccurrences } from '../hooks/useProgramSessionPlans';
import CreateSessionSubtitle from '../components/createSession/CreateSessionSubtitle';
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

const SESSION_SOURCES = new Set(['program', 'template', 'quick']);

/**
 * Create Session Page
 * Start a session from a program day or a template, or log a quick session.
 *
 * - ProgramSelector / SourceSelector (Step 1): choose a program, a template, or a quick session
 * - ProgramDayPicker / TemplatePicker (Step 2): pick what to start
 * - SessionPlanChooser (Step 3): which dated plan to run, when there are any
 * - SessionGoalScopePanel (beside): add manual scope beside locked activity-derived goals
 * - Quick session: QuickSessionSection (Step 2, beside) with RecentQuickSessions as a
 *   shortcut into it, completed from the header action instead of created
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
    // 'program', 'template' or 'quick'; ?source= deep-links one.
    const [sessionSource, setSessionSource] = useState(() => {
        const requested = searchParams.get('source');
        return SESSION_SOURCES.has(requested) ? requested : null;
    });
    const [manualGoalIds, setManualGoalIds] = useState([]);
    const [mobileGoalsOpen, setMobileGoalsOpen] = useState(false);

    // UI state
    const [creating, setCreating] = useState(false);
    const {
        templates,
        programDays,
        programsById,
        activeProgram,
        activePrograms = [],
        activityDefinitions,
        activityGroups,
        allGoals,
        goalTree,
        loading,
    } = useCreateSessionPageData(rootId, todayISO, timezone || 'UTC');
    const quick = useQuickSessionComposer({ rootId, activityDefinitions });

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
        // With nothing scheduled today, templates stay first; the program's previous days are a choice away.
        if (templates.length > 0 && (programIds.length === 0 || (programIds.length === 1 && programDays.length === 0))) {
            return 'template';
        }
        // Nothing to start from yet: a quick session needs no setup.
        if (programIds.length === 0 && templates.length === 0) {
            return 'quick';
        }
        return null;
    })();
    const effectiveSelectedProgramId = selectedProgramId ?? defaultProgramId;
    const effectiveSessionSource = sessionSource ?? defaultSessionSource;
    const quickSelected = effectiveSessionSource === 'quick';
    const selectedProgram = effectiveSelectedProgramId ? programsById[effectiveSelectedProgramId] : null;
    const recentQuickSessions = useRecentQuickSessions(rootId, { enabled: quickSelected });

    // Chosen session goals stay: they can be picked before, and kept across, a template or day.
    const resetSelectionState = ({ keepProgramDay = false } = {}) => {
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

    const createSessionFromTemplate = async (template) => {
        if (!template) {
            notify.error('Please select a template or program day');
            return null;
        }

        setCreating(true);

        try {
            const sessionData = buildTemplateSessionPayload(
                template,
                programContext ? { ...programContext, goal_scope_enabled: programScopeEnabled } : null,
                manualGoalIds,
                planChoice.payload,
            );
            const response = await fractalApi.createSession(rootId, sessionData);
            const createdSession = response.data;

            updateCreatedSessionCaches(queryClient, rootId, createdSession);
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

    const handleCompleteQuickSession = async () => {
        // Let a focused field commit its value, and React render it into the draft, first.
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        await new Promise((resolve) => { setTimeout(resolve, 0); });
        try {
            const result = await quick.complete();
            if (result?.outcome === 'synced') notify.success('Quick session completed.');
            if (result?.outcome === 'queued') notify.success("Quick session saved on this device. It will sync when you're back online.");
        } catch (err) {
            logError('Error completing quick session:', err);
            notify.error('Error completing quick session: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleRepeatQuickSession = (session) => {
        const missing = quick.repeat(session);
        if (missing > 0) {
            notify.error(`${missing} ${missing === 1 ? 'activity no longer exists and was' : 'activities no longer exist and were'} left out.`);
        }
    };

    const handleSelectTemplate = (template) => {
        resetSelectionState();
        setSelectedTemplate(template);
    };

    const {
        todayProgramView, primaryTodayProgramDay, programContext, programScopeAvailable,
        programScopeEnabled, scopedGoals, offScopeManualGoalIds, setScopeEnabled,
    } = useCreateSessionProgramContext({
        rootId, userId: user?.id, todayISO, programDays, selectedProgramDay, activeProgram,
        goalTree, allGoals, manualGoalIds, quickSessionSelected: quickSelected,
    });
    const planChoice = useSessionPlanChoice(
        rootId, selectedTemplate, todayISO, programContext?.day_id || null, Boolean(selectedProgramDay?.is_previous),
    );
    const programForPreviousDays = effectiveSessionSource === 'program'
        ? activePrograms.find((program) => String(program.id) === String(effectiveSelectedProgramId)) || null
        : null;
    const previousDaysQuery = useProgramPlanOccurrences(rootId, programForPreviousDays?.id, timezone || 'UTC');
    const previousProgramDays = useMemo(() => buildPreviousProgramDays({
        program: programForPreviousDays,
        occurrencesByDay: previousDaysQuery.data,
        templates,
        todayISO, scheduledToday: programDays,
    }), [previousDaysQuery.data, programDays, programForPreviousDays, templates, todayISO]);
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
        todayISO,
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
    const showProgramChoice = hasMultiplePrograms;
    const showSourceChoice = !hasMultiplePrograms;
    const currentProgramDays = effectiveSelectedProgramId ? (programsById[effectiveSelectedProgramId]?.days || []) : [];
    const quickActivityCount = quick.draft.items.length;
    const renderCreationAction = (placement) => {
        const placementProps = placement === 'header'
            ? { headerMode: true }
            : { footerMode: true };

        return quickSelected ? (
            <CreateSessionActions
                creating={quick.completing}
                onCreateSession={handleCompleteQuickSession}
                quickActivityCount={quickActivityCount}
                {...placementProps}
            />
        ) : (
            <CreateSessionActions
                selectedTemplate={selectedTemplate}
                selectedProgramDay={selectedProgramDay}
                creating={creating}
                onCreateSession={handleCreateSession}
                scopeReady={!selectedTemplate || scopePreviewQuery.isSuccess}
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
            fill={!isMobile}
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
    const quickSessionSection = (
        <QuickSessionSection
            rootId={rootId}
            draft={quick.draft}
            activityDefinitions={activityDefinitions}
            activityGroups={activityGroups}
            onAddActivity={quick.addActivity}
            onRemoveActivity={quick.removeActivity}
            onMoveActivity={quick.moveActivity}
            onChangeValue={quick.setActivityValue}
        />
    );
    let headerActions = null;
    if (!isMobile) {
        headerActions = <div className={styles.desktopHeaderAction}>{renderCreationAction('header')}</div>;
    } else if (!quickSelected) {
        headerActions = (
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
        );
    }

    return (
        <div className={headerStyles.pageShell}>
            <PageHeader
                title="Create Session"
                subtitle={<CreateSessionSubtitle selectedProgramDay={selectedProgramDay} programContext={programContext} />}
                actions={headerActions}
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
                                isDayRest={todayProgramView.isDayRest}
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
                                onSelectQuickSource={() => handleSelectSource('quick')}
                            />
                        )}

                        {showSourceChoice && (
                            <SourceSelector
                                sessionSource={effectiveSessionSource}
                                onSelectSource={handleSelectSource}
                                programName={selectedProgram?.program_name}
                                programColor={selectedProgram?.program_color}
                                showProgram={hasSingleProgram}
                            />
                        )}

                        {quickSelected ? (
                            <>
                                {isMobile && quickSessionSection}
                                <RecentQuickSessions
                                    sessions={recentQuickSessions.data || []}
                                    isLoading={recentQuickSessions.isLoading}
                                    error={recentQuickSessions.error}
                                    onRetry={() => recentQuickSessions.refetch()}
                                    activityDefinitions={activityDefinitions}
                                    timezone={timezone}
                                    onRepeat={handleRepeatQuickSession}
                                />
                            </>
                        ) : null}

                        {/* Step 2: Select Program Day */}
                        {!quickSelected && (effectiveSessionSource === 'program' || (hasProgramDays && !hasTemplates)) && (
                            <ProgramDayPicker
                                programDays={currentProgramDays}
                                previousDays={previousProgramDays}
                                previousDaysLoading={Boolean(programForPreviousDays) && previousDaysQuery.isLoading}
                                selectedProgramDay={selectedProgramDay}
                                selectedProgramSession={selectedProgramSession}
                                hasTemplates={hasTemplates}
                                onSelectProgramDay={handleSelectProgramDay}
                                onSelectProgramSession={handleSelectProgramSession}
                                onSwitchToTemplate={() => setSessionSource('template')}
                            />
                        )}

                        {/* Step 2: Select Template */}
                        {(effectiveSessionSource === 'template' || (!effectiveSessionSource && !hasProgramDays && hasTemplates)) && (
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

                        {/* Step 3: Select a Plan */}
                        {selectedTemplate ? <SessionPlanChooser {...planChoice} emptyMessage={selectedProgramDay?.is_previous ? 'No saved plans for this day. This session will use the template.' : null} /> : null}
                    </div>

                    {!isMobile && (
                        <div className={styles.goalScopeColumn}>
                            {quickSelected ? quickSessionSection : sessionGoalScopePanel}
                        </div>
                    )}
                </div>

            </div>
            </div>

            {isMobile && (
                <footer className={styles.stickyActionFooter}>
                    <div className={styles.stickyActionFooterInner}>
                        {renderCreationAction('footer')}
                    </div>
                </footer>
            )}

            {isMobile && !quickSelected && (
                <Modal
                    isOpen={mobileGoalsOpen}
                    onClose={() => setMobileGoalsOpen(false)}
                    title="Session Goals"
                    size="xl"
                    sheetHandle
                    overlayClassName={`${styles.mobileGoalsOverlay} mobile-sheet-backdrop-enter`}
                    className={`${styles.mobileGoalsSheet} mobile-sheet-enter`}
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
