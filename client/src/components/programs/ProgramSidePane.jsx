import React, { useMemo, useState } from 'react';

import SidePaneHeader from '../common/SidePaneHeader';
import SidePaneHeaderButton from '../common/SidePaneHeaderButton';
import SidePaneNotePanel from '../common/SidePaneNotePanel';
import ViewToggleTabs from '../common/ViewToggleTabs';
import DisclosureButton from '../atoms/DisclosureButton';
import { buildProgramSidePaneData } from '../../utils/programViewModel';
import ProgramSidebar from './ProgramSidebar';
import styles from '../../pages/ProgramCalendarPage.module.css';

function ProgramSidePaneSection({
    title,
    collapsed,
    onToggle,
    children,
    className = '',
    contentClassName = '',
}) {
    return (
        <section className={`${styles.sidePaneSectionGroup} ${collapsed ? styles.sidePaneSectionGroupCollapsed : ''} ${className}`.trim()}>
            <div className={styles.sidePaneSectionTitleRow}>
                <div className={styles.sidePaneSectionTitle}>{title}</div>
                <DisclosureButton
                    expanded={!collapsed}
                    className={styles.sidePaneSectionToggle}
                    onClick={onToggle}
                    aria-expanded={!collapsed}
                    aria-label={`${collapsed ? 'Show' : 'Hide'} ${title}`}
                    title={`${collapsed ? 'Show' : 'Hide'} ${title}`}
                />
            </div>
            {!collapsed ? (
                <div className={`${styles.sidePaneSectionContent} ${contentClassName}`.trim()}>
                    {children}
                </div>
            ) : null}
        </section>
    );
}

export default function ProgramSidePane({
    program,
    goals,
    onCreate,
    onCollapse,
    view,
    onViewChange,
    programMetrics,
    activeBlock,
    blockMetrics,
    programGoalSeeds,
    onGoalClick,
    notesQuery,
    notes,
    onCreateNote,
}) {
    const fallbackSidePaneData = useMemo(() => buildProgramSidePaneData({
        program,
        goals,
    }), [goals, program]);
    const getGoalDetails = (goalId) => goals.find((goal) => goal.id === goalId) || null;
    const [collapsedSections, setCollapsedSections] = useState({
        details: false,
        metrics: false,
        notes: false,
        goals: false,
    });
    const toggleSection = (key) => {
        setCollapsedSections((current) => ({
            ...current,
            [key]: !current[key],
        }));
    };
    const sidePaneData = {
        programMetrics: programMetrics || fallbackSidePaneData.programMetrics,
        activeBlock: activeBlock || fallbackSidePaneData.activeBlock,
        blockMetrics: blockMetrics || fallbackSidePaneData.blockMetrics,
        programGoalSeeds: programGoalSeeds || fallbackSidePaneData.programGoalSeeds,
    };

    return (
        <aside className={styles.sidePane} aria-label="Program side pane">
            <SidePaneHeader
                actions={(
                    <SidePaneHeaderButton onClick={onCollapse}>
                        Collapse
                    </SidePaneHeaderButton>
                )}
            >
                <ViewToggleTabs
                    items={[
                        { value: 'details', label: 'Details' },
                        { value: 'goals', label: 'Goals' },
                    ]}
                    value={view}
                    onChange={onViewChange}
                    ariaLabel="Program side pane views"
                    style={{
                        '--view-toggle-panel-bg': 'var(--color-bg-sidebar)',
                    }}
                />
            </SidePaneHeader>

            {program && view === 'details' ? (
                <div className={styles.detailsPane}>
                    <ProgramSidePaneSection
                        title="Details"
                        collapsed={collapsedSections.details}
                        onToggle={() => toggleSection('details')}
                    >
                        {program.description ? (
                            <p className={styles.sectionDescription}>{program.description}</p>
                        ) : (
                            <p className={styles.emptySectionText}>No details yet.</p>
                        )}
                    </ProgramSidePaneSection>

                    <ProgramSidePaneSection
                        title="Metrics"
                        collapsed={collapsedSections.metrics}
                        onToggle={() => toggleSection('metrics')}
                        contentClassName={styles.metricsSectionContent}
                    >
                        <ProgramSidebar
                            program={program}
                            programMetrics={sidePaneData.programMetrics}
                            activeBlock={sidePaneData.activeBlock}
                            blockMetrics={sidePaneData.blockMetrics}
                            programGoalSeeds={sidePaneData.programGoalSeeds}
                            onGoalClick={onGoalClick || (() => {})}
                            getGoalDetails={getGoalDetails}
                            compact
                            hideGoals
                            flushMetricsPadding
                            className={styles.embeddedSidebarMetrics}
                        />
                    </ProgramSidePaneSection>

                    <ProgramSidePaneSection
                        title={notes.length > 0 ? `Program Notes (${notes.length})` : 'Program Notes'}
                        collapsed={collapsedSections.notes}
                        onToggle={() => toggleSection('notes')}
                        className={styles.notesSidePaneSection}
                        contentClassName={styles.notesSectionContent}
                    >
                        <SidePaneNotePanel
                            notes={notes}
                            isLoading={notesQuery.isLoading}
                            error={notesQuery.error}
                            onSubmit={onCreateNote}
                            onEdit={notesQuery.updateNote}
                            onDelete={notesQuery.deleteNote}
                            onPin={notesQuery.pinNote}
                            onUnpin={notesQuery.unpinNote}
                            hasMore={notesQuery.hasMore}
                            onLoadMore={notesQuery.loadNextPage}
                            placeholder="Add a program note..."
                            label="Program Notes"
                            hideHeader
                        />
                    </ProgramSidePaneSection>
                </div>
            ) : null}

            {program && view === 'goals' ? (
                <div className={styles.goalsPane}>
                    <ProgramSidePaneSection
                        title="Program Goals"
                        collapsed={collapsedSections.goals}
                        onToggle={() => toggleSection('goals')}
                        className={styles.goalsSidePaneSection}
                        contentClassName={styles.goalsSectionContent}
                    >
                        <ProgramSidebar
                            program={program}
                            programMetrics={sidePaneData.programMetrics}
                            activeBlock={sidePaneData.activeBlock}
                            blockMetrics={sidePaneData.blockMetrics}
                            programGoalSeeds={sidePaneData.programGoalSeeds}
                            onGoalClick={onGoalClick || (() => {})}
                            getGoalDetails={getGoalDetails}
                            compact
                            hideMetrics
                            hideGoalsHeader
                            className={styles.embeddedSidebar}
                        />
                    </ProgramSidePaneSection>
                </div>
            ) : null}

            {!program ? (
                <div className={styles.emptySidePane}>
                    <div className={styles.emptySidePaneCard}>
                        <p>No program is scheduled for this day.</p>
                        <button className={styles.emptySidePaneButton} onClick={onCreate}>New Program</button>
                    </div>
                </div>
            ) : null}
        </aside>
    );
}
