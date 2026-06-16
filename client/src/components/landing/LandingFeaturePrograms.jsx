import React, { useCallback, useMemo, useState } from 'react';
import ProgramBlockView from '../programs/ProgramBlockView';
import ProgramCalendarView from '../programs/ProgramCalendarView';
import ProgramSidebar from '../programs/ProgramSidebar';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import {
    buildBlockGoalsByBlockId,
    buildProgramBlockLabels,
    buildProgramSidePaneData,
    buildProgramsCalendarEvents,
    flattenProgramSessions,
    getProgramColor,
    sortProgramBlocks,
} from '../../utils/programViewModel';
import { flattenGoalTree } from '../../utils/goalNodeModel';
import { overlapsDateWindow } from './landingFeatureModel';
import styles from './LandingFeaturesSection.module.css';

function normalizeGoal(goal) {
    if (!goal) return null;
    return {
        ...goal,
        id: goal.id || goal.attributes?.id,
        type: goal.type || goal.attributes?.type,
        completed: goal.completed ?? goal.attributes?.completed,
        completed_at: goal.completed_at || goal.attributes?.completed_at,
    };
}

const getDatePart = (value) => (typeof value === 'string' ? value.slice(0, 10) : null);

function formatDate(value) {
    const datePart = getDatePart(value);
    if (!datePart) return 'Undated';
    const date = new Date(`${datePart}T00:00:00`);
    if (Number.isNaN(date.getTime())) return datePart;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function getProgramStatus(program) {
    const today = new Date().toISOString().slice(0, 10);
    const start = getDatePart(program?.start_date);
    const end = getDatePart(program?.end_date);
    if (start && today < start) return 'Upcoming';
    if (end && today > end) return 'Completed';
    return 'Active';
}

function findBlockForDate(program, dateValue) {
    const datePart = getDatePart(dateValue);
    if (!datePart) return null;
    return (program?.blocks || []).find((block) => {
        const start = getDatePart(block.start_date);
        const end = getDatePart(block.end_date);
        return start && end && datePart >= start && datePart <= end;
    }) || null;
}

// Renders the admin-featured program on the real calendar, clipped to the
// published date window so visitors see a representative slice rather than the
// whole multi-month plan.
export default function LandingFeaturePrograms({ example, program, windowStart, windowEnd, isMobile }) {
    const { getGoalColor, getGoalTextColor } = useGoalLevels();
    const [viewMode, setViewMode] = useState('calendar');
    const [isSidePaneVisible, setIsSidePaneVisible] = useState(true);
    const [sidePaneView, setSidePaneView] = useState('details');
    const goals = useMemo(
        () => flattenGoalTree(example.tree).map(normalizeGoal).filter(Boolean),
        [example.tree]
    );
    const calendarEvents = useMemo(() => (
        buildProgramsCalendarEvents(program ? [program] : [], goals, getGoalColor, getGoalTextColor)
            .filter((event) => overlapsDateWindow(event.start, event.end, windowStart, windowEnd))
    ), [program, goals, getGoalColor, getGoalTextColor, windowStart, windowEnd]);
    const blockLabels = useMemo(() => (
        buildProgramBlockLabels({ program, includeProgramId: true })
            .filter((label) => overlapsDateWindow(label.startDate, label.endDate, windowStart, windowEnd))
    ), [program, windowStart, windowEnd]);
    const initialDate = windowStart
        || calendarEvents.find((event) => event.start)?.start
        || new Date();
    const getGoalDetails = useCallback(
        (goalId) => goals.find((goal) => String(goal.id) === String(goalId)) || null,
        [goals]
    );
    const sidePaneData = useMemo(() => (
        buildProgramSidePaneData({ program, goals, getGoalDetails })
    ), [getGoalDetails, goals, program]);
    const focusedBlock = findBlockForDate(program, initialDate) || sidePaneData.activeBlock;
    const programColor = getProgramColor(program);
    const sortedBlocks = useMemo(() => sortProgramBlocks(program?.blocks || []), [program?.blocks]);
    const programSessions = useMemo(() => flattenProgramSessions(program), [program]);
    const blockGoalsByBlockId = useMemo(() => (
        buildBlockGoalsByBlockId({
            sortedBlocks,
            associatedGoals: goals,
        })
    ), [goals, sortedBlocks]);

    if (!program) {
        return <div className={styles.emptyState}>Publish an example program to preview the calendar.</div>;
    }

    return (
        <div className={styles.programPagePreview}>
            <div className={`${styles.programPreviewWorkspace} ${!isSidePaneVisible ? styles.programPreviewWorkspaceNoSidePane : ''}`}>
                <div className={styles.programPreviewMain}>
                    <div className={styles.programPreviewHeader}>
                        <div className={styles.programPreviewTitleBlock}>
                            <h3>
                                <span style={{ color: programColor }}>{program.name}</span>
                                {focusedBlock ? (
                                    <>
                                        <span className={styles.programTitleSeparator}>•</span>
                                        <span style={{ color: focusedBlock.color || programColor }}>{focusedBlock.name}</span>
                                    </>
                                ) : null}
                                <span className={styles.programTitleSeparator}>•</span>
                                <span>{formatDate(initialDate)}</span>
                            </h3>
                            <div className={styles.programPreviewMeta}>
                                <span>{formatDate(program.start_date)} - {formatDate(program.end_date)}</span>
                                <span className={styles.programStatusBadge}>{getProgramStatus(program)}</span>
                                {focusedBlock ? (
                                    <span
                                        className={styles.programBlockBadge}
                                        style={{
                                            borderColor: focusedBlock.color || programColor,
                                            color: focusedBlock.color || programColor,
                                        }}
                                    >
                                        {focusedBlock.name}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                        <div className={styles.programPreviewActions} aria-label="Program view controls">
                            <div className={styles.programViewToggle} aria-label="Program view">
                                <button
                                    type="button"
                                    className={viewMode === 'calendar' ? styles.programViewToggleActive : ''}
                                    onClick={() => setViewMode('calendar')}
                                    aria-pressed={viewMode === 'calendar'}
                                >
                                    Calendar
                                </button>
                                <button
                                    type="button"
                                    className={viewMode === 'blocks' ? styles.programViewToggleActive : ''}
                                    onClick={() => setViewMode('blocks')}
                                    aria-pressed={viewMode === 'blocks'}
                                >
                                    Blocks
                                </button>
                            </div>
                            <button type="button">Program Options</button>
                            <button
                                type="button"
                                onClick={() => setIsSidePaneVisible((visible) => !visible)}
                                aria-pressed={!isSidePaneVisible}
                            >
                                {isSidePaneVisible ? 'Hide Sidebar' : 'Show Sidebar'}
                            </button>
                        </div>
                    </div>

                    <div className={`${styles.programPreviewCalendarPanel} ${viewMode === 'blocks' ? styles.programPreviewBlocksPanel : ''}`}>
                        {viewMode === 'calendar' ? (
                            <ProgramCalendarView
                                calendarEvents={calendarEvents}
                                blockLabels={blockLabels}
                                blockCreationMode={false}
                                setBlockCreationMode={() => {}}
                                isMobile={isMobile}
                                showBlockControls
                                showAddBlockButton={false}
                                initialDate={initialDate}
                                onDateSelect={() => {}}
                                onDateClick={() => {}}
                                onEventClick={() => {}}
                                onBlockLabelClick={() => {}}
                            />
                        ) : (
                            <div className={styles.programPreviewBlocksScroll}>
                                <ProgramBlockView
                                    blocks={sortedBlocks}
                                    blockGoalsByBlockId={blockGoalsByBlockId}
                                    sessions={programSessions}
                                    onEditDay={() => {}}
                                    onAttachGoal={() => {}}
                                    onEditBlock={() => {}}
                                    onDeleteBlock={() => {}}
                                    onAddDay={() => {}}
                                    onGoalClick={() => {}}
                                    onAddBlock={() => {}}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {isSidePaneVisible ? (
                    <aside className={styles.programPreviewSidePane} aria-label="Program side pane preview">
                        <div className={styles.programSidePaneTabs} role="tablist" aria-label="Program side pane views">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={sidePaneView === 'details'}
                                className={sidePaneView === 'details' ? styles.programSidePaneTabActive : ''}
                                onClick={() => setSidePaneView('details')}
                            >
                                Details
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={sidePaneView === 'goals'}
                                className={sidePaneView === 'goals' ? styles.programSidePaneTabActive : ''}
                                onClick={() => setSidePaneView('goals')}
                            >
                                Goals
                            </button>
                        </div>

                        {sidePaneView === 'details' ? (
                            <div className={styles.programSidePaneScroll}>
                                <section className={styles.programSidePaneSection}>
                                    <div className={styles.programSidePaneSectionTitle}>Details</div>
                                    <p>{program.description || 'No details yet.'}</p>
                                </section>
                                <section className={styles.programSidePaneSection}>
                                    <div className={styles.programSidePaneSectionTitle}>Metrics</div>
                                    <ProgramSidebar
                                        program={program}
                                        programMetrics={sidePaneData.programMetrics}
                                        activeBlock={focusedBlock || sidePaneData.activeBlock}
                                        blockMetrics={sidePaneData.blockMetrics}
                                        programGoalSeeds={sidePaneData.programGoalSeeds}
                                        onGoalClick={() => {}}
                                        getGoalDetails={getGoalDetails}
                                        compact
                                        hideGoals
                                        hideMetricsHeader
                                        flushMetricsPadding
                                    />
                                </section>
                                <section className={styles.programSidePaneSection}>
                                    <div className={styles.programSidePaneSectionTitle}>Program Notes</div>
                                    <p className={styles.programSidePaneMuted}>No notes yet.</p>
                                </section>
                            </div>
                        ) : (
                            <div className={styles.programSidePaneScroll}>
                                <section className={styles.programSidePaneSection}>
                                    <div className={styles.programSidePaneSectionTitle}>Program Goals</div>
                                    <ProgramSidebar
                                        program={program}
                                        programMetrics={sidePaneData.programMetrics}
                                        activeBlock={focusedBlock || sidePaneData.activeBlock}
                                        blockMetrics={sidePaneData.blockMetrics}
                                        programGoalSeeds={sidePaneData.programGoalSeeds}
                                        onGoalClick={() => {}}
                                        getGoalDetails={getGoalDetails}
                                        compact
                                        hideMetrics
                                        hideGoalsHeader
                                    />
                                </section>
                            </div>
                        )}
                    </aside>
                ) : null}
            </div>
        </div>
    );
}
