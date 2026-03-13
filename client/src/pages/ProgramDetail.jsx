import React, { Suspense, lazy } from 'react';
import Linkify from '../components/atoms/Linkify';
import { useParams, useNavigate } from 'react-router-dom';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { formatLiteralDate } from '../utils/dateUtils';
import { useTimezone } from '../contexts/TimezoneContext';
import ProgramSidebar from '../components/programs/ProgramSidebar';
import ProgramCalendarView from '../components/programs/ProgramCalendarView';
import ProgramBlockView from '../components/programs/ProgramBlockView';
import ConfirmationModal from '../components/ConfirmationModal';
import { useProgramData } from '../hooks/useProgramData';
import { useProgramGoalSets } from '../hooks/useProgramGoalSets';
import { useProgramDetailController } from '../hooks/useProgramDetailController';
import { useProgramDetailMutations } from '../hooks/useProgramDetailMutations';
import { useProgramDetailViewModel } from '../hooks/useProgramDetailViewModel';
import useIsMobile from '../hooks/useIsMobile';
import styles from './ProgramDetail.module.css';

const ProgramBuilder = lazy(() => import('../components/modals/ProgramBuilder'));
const ProgramBlockModal = lazy(() => import('../components/modals/ProgramBlockModal'));
const ProgramDayModal = lazy(() => import('../components/modals/ProgramDayModal'));
const AttachGoalModal = lazy(() => import('../components/modals/AttachGoalModal'));
const DayViewModal = lazy(() => import('../components/modals/DayViewModal'));
const GoalDetailModal = lazy(() => import('../components/GoalDetailModal'));

const ProgramDetail = () => {
    const { getGoalColor, getGoalTextColor } = useGoalLevels();
    const { rootId, programId } = useParams();
    const navigate = useNavigate();
    const { timezone } = useTimezone();
    const isMobile = useIsMobile();

    // Data hook manages program, goals, sessions, and supporting query state.
    const {
        program,
        loading,
        goals,
        activities,
        activityGroups,
        sessions,
        treeData,
        refreshData,
        refreshers,
        getGoalDetails
    } = useProgramData(rootId, programId);

    const {
        attachedGoalIds,
        attachedGoals,
        attachableBlockGoals,
        hierarchyGoalSeeds,
    } = useProgramGoalSets({
        program,
        goals,
        getGoalDetails,
    });
    const {
        showEditBuilder,
        setShowEditBuilder,
        viewMode,
        setViewMode,
        isSidebarOpen,
        setIsSidebarOpen,
        showBlockModal,
        blockModalData,
        showDayModal,
        selectedBlockId,
        dayModalInitialData,
        showAttachModal,
        attachBlockId,
        blockCreationMode,
        setBlockCreationMode,
        showDayViewModal,
        selectedDate,
        unscheduleConfirmOpen,
        itemToUnschedule,
        showGoalModal,
        selectedGoal,
        modalMode,
        selectedParent,
        openGoalModal,
        closeGoalModal,
        handleDateSelect,
        handleDateClick,
        handleAddBlockClick,
        handleEditBlockClick,
        closeBlockModal,
        handleBlockSaveSuccess,
        handleAddDayClick,
        handleCreateDayForDate,
        handleEditDay,
        closeDayModal,
        handleDaySaveSuccess,
        handleAttachGoalClick,
        closeAttachModal,
        handleAttachGoalSaveSuccess,
        closeDayViewModal,
        handleScheduleDaySuccess,
        handleUnscheduleDay,
        closeUnscheduleConfirm,
        handleUnscheduleSuccess,
        handleEventClick,
        handleAddChildGoal,
    } = useProgramDetailController({ goals });

    const formatDate = (dateString) => {
        if (!dateString) return '';
        // Use literal formatting for header/program ranges to avoid timezone shifts
        return formatLiteralDate(dateString);
    };
    const {
        sortedBlocks,
        calendarEvents,
        programMetrics,
        activeBlock,
        blockMetrics,
        attachBlock,
        blockGoalsByBlockId,
    } = useProgramDetailViewModel({
        program,
        goals,
        sessions,
        timezone,
        getGoalColor,
        getGoalTextColor,
        getGoalDetails,
        attachBlockId,
        attachedGoalIds,
        hierarchyGoalSeeds,
    });

    const {
        saveProgram,
        saveBlock,
        deleteBlock,
        saveDay,
        copyDay,
        deleteDay,
        unscheduleDay,
        scheduleDay,
        saveAttachedGoal,
        setGoalDeadline,
        updateGoal,
        toggleGoalCompletion,
        deleteGoal,
        createGoal,
    } = useProgramDetailMutations({
        rootId,
        program,
        refreshData,
        refreshers,
        timezone,
        sessions,
        selectedBlockId,
        dayModalInitialData,
        attachBlockId,
        selectedDate,
        itemToUnschedule,
        onProgramSaved: () => setShowEditBuilder(false),
        onBlockSaved: handleBlockSaveSuccess,
        onDaySaved: handleDaySaveSuccess,
        onAttachGoalSaved: handleAttachGoalSaveSuccess,
        onScheduleDaySaved: handleScheduleDaySuccess,
        onUnscheduleFinished: handleUnscheduleSuccess,
        onGoalEditorClosed: closeGoalModal,
    });

    if (loading) return <div style={{ padding: '40px', color: 'white' }}>Loading...</div>;
    if (!program) return <div style={{ padding: '40px', color: 'white' }}>Program not found</div>;

    const sidebarPanel = (
        <ProgramSidebar
            programMetrics={programMetrics}
            activeBlock={activeBlock}
            blockMetrics={blockMetrics}
            programGoalSeeds={hierarchyGoalSeeds}
            onGoalClick={openGoalModal}
            getGoalDetails={getGoalDetails}
            compact={isMobile}
        />
    );

    const contentPanel = (
        <div className={`${styles.rightPanel} ${styles.calendarWrapper}`}>
            {viewMode === 'calendar' ? (
                <ProgramCalendarView
                    calendarEvents={calendarEvents}
                    blockCreationMode={blockCreationMode}
                    setBlockCreationMode={setBlockCreationMode}
                    onAddBlockClick={handleAddBlockClick}
                    onDateSelect={handleDateSelect}
                    onDateClick={handleDateClick}
                    onEventClick={handleEventClick}
                    isMobile={isMobile}
                />
            ) : (
                <ProgramBlockView
                    blocks={sortedBlocks}
                    blockGoalsByBlockId={blockGoalsByBlockId}
                    sessions={sessions}
                    onEditDay={handleEditDay}
                    onAttachGoal={handleAttachGoalClick}
                    onEditBlock={handleEditBlockClick}
                    onDeleteBlock={deleteBlock}
                    onAddDay={handleAddDayClick}
                    onGoalClick={openGoalModal}
                />
            )}
        </div>
    );

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <button
                        onClick={() => navigate(`/${rootId}/programs?show_all=true`)}
                        className={styles.backBtn}
                    >
                        ← Back
                    </button>
                    <div>
                        <h1 className={styles.programTitle}>{program.name}</h1>
                        <div className={styles.programMeta}>
                            <span>{formatDate(program.start_date)} - {formatDate(program.end_date)}</span>
                            {program.description && (
                                <>
                                    <span>•</span>
                                    <span className={styles.description}><Linkify>{program.description}</Linkify></span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className={styles.headerActions}>
                    <div className={styles.viewToggle}>
                        <button
                            onClick={() => setViewMode('calendar')}
                            className={`${styles.toggleBtn} ${viewMode === 'calendar' ? styles.toggleBtnActive : ''}`}
                        >
                            Calendar
                        </button>
                        <button
                            onClick={() => setViewMode('blocks')}
                            className={`${styles.toggleBtn} ${viewMode === 'blocks' ? styles.toggleBtnActive : ''}`}
                        >
                            Blocks
                        </button>
                    </div>
                    <button
                        onClick={() => setIsSidebarOpen((prev) => !prev)}
                        className={styles.sidebarToggleBtn}
                    >
                        {isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
                    </button>
                    <button
                        onClick={() => setShowEditBuilder(true)}
                        className={styles.editBtn}
                    >
                        Edit Program
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className={styles.mainLayout}>
                {isMobile ? (
                    <>
                        {contentPanel}
                        {isSidebarOpen && sidebarPanel}
                    </>
                ) : (
                    <>
                        {isSidebarOpen && sidebarPanel}
                        {contentPanel}
                    </>
                )}
            </div>

            {showEditBuilder && (
                <Suspense fallback={null}>
                    <ProgramBuilder
                        isOpen={showEditBuilder}
                        onClose={() => setShowEditBuilder(false)}
                        onSave={saveProgram}
                        initialData={program}
                    />
                </Suspense>
            )}
            {showBlockModal && (
                <Suspense fallback={null}>
                    <ProgramBlockModal
                        isOpen={showBlockModal}
                        onClose={closeBlockModal}
                        onSave={saveBlock}
                        initialData={blockModalData}
                        programDates={{ start: program.start_date, end: program.end_date }}
                    />
                </Suspense>
            )}
            {showDayModal && (
                <Suspense fallback={null}>
                    <ProgramDayModal
                        isOpen={showDayModal}
                        onClose={closeDayModal}
                        onSave={saveDay}
                        onCopy={copyDay}
                        onDelete={deleteDay}
                        rootId={rootId}
                        blockId={selectedBlockId}
                        initialData={dayModalInitialData}
                    />
                </Suspense>
            )}
            {showAttachModal && (
                <Suspense fallback={null}>
                    <AttachGoalModal
                        isOpen={showAttachModal}
                        onClose={closeAttachModal}
                        onSave={saveAttachedGoal}
                        goals={attachableBlockGoals}
                        block={attachBlock}
                        associatedGoalIds={(blockGoalsByBlockId.get(attachBlock?.id) || []).map((goal) => goal.id)}
                    />
                </Suspense>
            )}
            {showDayViewModal && (
                <Suspense fallback={null}>
                    <DayViewModal
                        isOpen={showDayViewModal}
                        onClose={closeDayViewModal}
                        date={selectedDate}
                        program={program}
                        goals={attachedGoals}
                        onSetGoalDeadline={setGoalDeadline}
                        blocks={sortedBlocks}
                        onScheduleDay={scheduleDay}
                        onCreateDayForDate={handleCreateDayForDate}
                        onUnscheduleDay={handleUnscheduleDay}
                        sessions={sessions}
                    />
                </Suspense>
            )}

            <ConfirmationModal
                isOpen={unscheduleConfirmOpen}
                onClose={closeUnscheduleConfirm}
                onConfirm={unscheduleDay}
                title="Unschedule Day"
                message={
                    itemToUnschedule?.isRecurringTemplate
                        ? `Remove scheduled sessions for "${itemToUnschedule?.name || 'this day'}" on ${selectedDate || 'this date'}?`
                        : `Are you sure you want to unschedule ${itemToUnschedule?.name || 'this day'}?`
                }
                confirmText="Unschedule"
            />

            <Suspense fallback={null}>
                {showGoalModal && (
                    <GoalDetailModal
                        isOpen={showGoalModal}
                        onClose={closeGoalModal}
                        goal={selectedGoal}
                        onUpdate={updateGoal}
                        onToggleCompletion={toggleGoalCompletion}
                        onDelete={deleteGoal}
                        onAddChild={handleAddChildGoal}
                        rootId={rootId}
                        treeData={treeData}
                        sessions={sessions}
                        programs={[program]}
                        activityDefinitions={activities}
                        activityGroups={activityGroups}
                        displayMode="modal"
                        mode={modalMode}
                        onCreate={createGoal}
                        parentGoal={selectedParent}
                    />
                )}
            </Suspense>
        </div >
    );
};

export default ProgramDetail;
