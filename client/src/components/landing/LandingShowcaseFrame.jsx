import React, { useMemo, useState } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import SessionCardExpanded from '../sessions/SessionCardExpanded';
import ProgramCalendarView from '../programs/ProgramCalendarView';
import { DISABLED_CHART_ANIMATION } from '../analytics/ChartJSWrapper';
import { GoalLevelsProvider, useGoalLevels } from '../../contexts/GoalLevelsContext';
import { buildProgramBlockLabels, buildProgramsCalendarEvents } from '../../utils/programViewModel';
import { flattenGoalTree } from '../../utils/goalNodeModel';
import ActivityPreviewCard from './ActivityPreviewCard';
import TemplatePreviewCard from './TemplatePreviewCard';
import styles from './LandingShowcaseFrame.module.css';

const TABS = [
    { id: 'sessions', label: 'Sessions' },
    { id: 'programs', label: 'Programs' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'build', label: 'Build' },
];

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

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

function ReadOnlySessions({ example }) {
    const { getGoalColor } = useGoalLevels();
    const sessions = example.sessions || [];

    if (!sessions.length) {
        return <div className={styles.emptyState}>Publish example sessions to preview the training log.</div>;
    }

    return (
        <div className={styles.sessionsList}>
            {sessions.slice(0, 2).map((session) => (
                <SessionCardExpanded
                    key={session.id}
                    session={session}
                    rootId={example.id}
                    activities={example.activityDefinitions || []}
                    activityGroups={example.activityGroups || []}
                    sessionActivityInstances={session.activity_instances || []}
                    getGoalColor={getGoalColor}
                    formatDate={formatDate}
                    readOnly
                    progressSettingsOverride={example.tree?.attributes?.progress_settings ?? null}
                />
            ))}
        </div>
    );
}

function ProgramsShowcase({ example }) {
    const { getGoalColor, getGoalTextColor } = useGoalLevels();
    const goals = useMemo(() => flattenGoalTree(example.tree).map(normalizeGoal).filter(Boolean), [example.tree]);
    const calendarEvents = useMemo(() => buildProgramsCalendarEvents(
        example.programs || [],
        goals,
        getGoalColor,
        getGoalTextColor,
    ), [example.programs, getGoalColor, getGoalTextColor, goals]);
    const blockLabels = useMemo(() => (
        (example.programs || []).flatMap((program, programIndex) => buildProgramBlockLabels({
            program,
            includeProgramId: true,
            programIndex,
        }))
    ), [example.programs]);
    const initialDate = calendarEvents.find((event) => event.start)?.start || new Date();

    if (!example.programs?.length) {
        return <div className={styles.emptyState}>Publish an example program to preview the calendar.</div>;
    }

    return (
        <div className={styles.calendarShell}>
            <ProgramCalendarView
                calendarEvents={calendarEvents}
                blockLabels={blockLabels}
                blockCreationMode={false}
                setBlockCreationMode={() => {}}
                isMobile={false}
                showBlockControls={false}
                showAddBlockButton={false}
                initialDate={initialDate}
                onDateSelect={() => {}}
                onDateClick={() => {}}
                onEventClick={() => {}}
                onBlockLabelClick={() => {}}
            />
        </div>
    );
}

function AnalyticsShowcase({ charts }) {
    const chart = charts?.[0];
    if (!chart) {
        return <div className={styles.emptyState}>Publish sessions with history to preview analytics.</div>;
    }

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        ...DISABLED_CHART_ANIMATION,
        ...(chart.options || {}),
    };
    const ChartComponent = chart.type === 'line' ? Line : Bar;

    return (
        <div className={styles.analyticsPanel}>
            <div className={styles.panelHeader}>
                <h3>{chart.title || 'Progress chart'}</h3>
            </div>
            <div className={styles.chartBox}>
                <ChartComponent data={chart.data} options={options} />
            </div>
        </div>
    );
}

function BuildShowcase({ example }) {
    const activity = example.activityDefinitions?.[0]
        || flattenGoalTree(example.tree).flatMap((goal) => goal.attributes?.associated_activities || [])[0]
        || null;
    const template = example.sessionTemplates?.[0] || null;

    return (
        <div className={styles.previewGrid}>
            <ActivityPreviewCard activity={activity} />
            <TemplatePreviewCard template={template} activityDefinitions={example.activityDefinitions || []} />
        </div>
    );
}

export default function LandingShowcaseFrame({ example, seedLevels = [] }) {
    const [activeTab, setActiveTab] = useState(TABS[0].id);
    if (!example) return null;

    return (
        <section className={styles.showcaseSection} id="showcase" aria-labelledby="app-showcase-title">
            <div className={styles.sectionHeader}>
                <h2 id="app-showcase-title">The same published example, rendered in the real app surfaces.</h2>
                <p>Sessions, programs, analytics, and build results are read-only snapshots from the selected fractal.</p>
            </div>
            <div className={styles.showcaseFrame}>
                <div className={styles.tabStrip} role="tablist" aria-label="Landing app showcase">
                    {TABS.map((tab) => (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            className={activeTab === tab.id ? styles.tabActive : ''}
                            onClick={() => setActiveTab(tab.id)}
                            key={tab.id}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className={styles.frameBody}>
                    <GoalLevelsProvider seedLevels={seedLevels}>
                        {activeTab === 'sessions' ? <ReadOnlySessions example={example} /> : null}
                        {activeTab === 'programs' ? <ProgramsShowcase example={example} /> : null}
                        {activeTab === 'analytics' ? <AnalyticsShowcase charts={example.analyticsCharts || []} /> : null}
                        {activeTab === 'build' ? <BuildShowcase example={example} /> : null}
                    </GoalLevelsProvider>
                </div>
            </div>
        </section>
    );
}
