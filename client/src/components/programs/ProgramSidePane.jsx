import React, { useState } from 'react';

import Button from '../atoms/Button';
import SidePaneHeader from '../common/SidePaneHeader';
import SidePaneHeaderButton from '../common/SidePaneHeaderButton';
import ViewToggleTabs from '../common/ViewToggleTabs';
import DisclosureButton from '../atoms/DisclosureButton';
import { formatLiteralDate } from '../../utils/dateUtils';
import { formatProgramCalendarRange } from '../../utils/programCalendarContext';
import ProgramSidebar from './ProgramSidebar';
import ProgramDayPane from './ProgramDayPane';
import ProgramOverview from './ProgramOverview';
import styles from './ProgramSidePane.module.css';

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
    programGoalSeeds,
    onGoalClick,
    programMetricsLoading = false,
    programMetricsError = null,
    rootId,
    scope = 'program',
    contextDate,
    selectedRange,
    dayDetailQuery,
    onProgramScope,
    onPreviousDay,
    onNextDay,
    today,
    blocks,
    onScheduleDay,
    onCreateDay,
    getGoalIcon,
    getGoalColor,
    getGoalSecondaryColor,
    availablePrograms = [],
    onSelectProgramForDate,
    timezone = 'UTC',
}) {
    const getGoalDetails = (goalId) => goals.find((goal) => String(goal.id) === String(goalId)) || null;
    const [collapsedSections, setCollapsedSections] = useState({
        goals: false,
    });
    const toggleSection = (key) => {
        setCollapsedSections((current) => ({
            ...current,
            [key]: !current[key],
        }));
    };
    return (
        <aside className={styles.sidePane} aria-label="Program side pane">
            {scope === 'day' ? (
                <header className={styles.dayReviewHeader}>
                    <div className={styles.dayReviewTopline}>
                        <Button unstyled className={styles.programCrumb} onClick={onProgramScope}>
                            <span aria-hidden="true">‹</span>
                            <span>{program?.name || 'Program'}</span>
                        </Button>
                        <SidePaneHeaderButton className={styles.collapseButton} onClick={onCollapse}>Collapse</SidePaneHeaderButton>
                    </div>
                    <div className={styles.dayReviewHeading}>
                        <Button unstyled className={styles.dayNavButton} onClick={onPreviousDay} aria-label="Previous day">‹</Button>
                        <div className={styles.dayReviewTitle}>
                            <h2>{formatLiteralDate(contextDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2>
                        </div>
                        <Button unstyled className={styles.dayNavButton} onClick={onNextDay} aria-label="Next day">›</Button>
                    </div>
                </header>
            ) : <SidePaneHeader
                className={scope === 'program' ? styles.programHeader : styles.scopedHeader}
                actions={<SidePaneHeaderButton className={styles.collapseButton} onClick={onCollapse}>Collapse</SidePaneHeaderButton>}
            >
                {scope === 'program' ? <ViewToggleTabs
                    className={styles.sidePaneViewToggle}
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
                /> : (
                    <nav className={styles.scopeNav} aria-label="Program scope">
                        <Button unstyled className={styles.programCrumb} onClick={onProgramScope}>
                            <span aria-hidden="true">‹</span>
                            <span>{program?.name || 'Program'}</span>
                        </Button>
                        <span className={styles.rangeSummary}>
                            <span className={styles.rangeNavLabel}>Selected timeframe</span>
                            <span className={styles.rangeNavDate}>
                                {formatProgramCalendarRange(selectedRange?.startDate, selectedRange?.endDate)}
                            </span>
                        </span>
                    </nav>
                )}
            </SidePaneHeader>}

            {program && scope === 'day' ? (
                <ProgramDayPane
                    rootId={rootId}
                    date={contextDate}
                    today={today}
                    query={dayDetailQuery}
                    program={program}
                    blocks={blocks}
                    onScheduleDay={onScheduleDay}
                    onCreateDay={onCreateDay}
                    goals={goals}
                    onGoalClick={onGoalClick}
                    getGoalIcon={getGoalIcon}
                    getGoalColor={getGoalColor}
                    getGoalSecondaryColor={getGoalSecondaryColor}
                    timezone={timezone}
                />
            ) : null}

            {program && (scope === 'range' || (scope === 'program' && view === 'details')) ? (
                <div className={styles.detailsPane}>
                    <ProgramOverview
                        metrics={programMetrics || null}
                        loading={programMetricsLoading}
                        error={programMetricsError}
                    />
                </div>
            ) : null}

            {program && scope === 'program' && view === 'goals' ? (
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
                            programGoalSeeds={programGoalSeeds || []}
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
                        <p>{availablePrograms.length ? 'Choose a program for this day.' : 'No program is scheduled for this day.'}</p>
                        {availablePrograms.map((candidate) => (
                            <Button
                                unstyled
                                key={candidate.id}
                                className={styles.emptySidePaneButton}
                                onClick={() => onSelectProgramForDate?.(candidate)}
                            >
                                View {candidate.name}
                            </Button>
                        ))}
                        <Button unstyled className={styles.emptySidePaneButton} onClick={onCreate}>New Program</Button>
                    </div>
                </div>
            ) : null}
        </aside>
    );
}
