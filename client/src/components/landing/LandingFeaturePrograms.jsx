import React, { useMemo } from 'react';
import ProgramCalendarView from '../programs/ProgramCalendarView';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { buildProgramBlockLabels, buildProgramsCalendarEvents } from '../../utils/programViewModel';
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

// Renders the admin-featured program on the real calendar, clipped to the
// published date window so visitors see a representative slice rather than the
// whole multi-month plan.
export default function LandingFeaturePrograms({ example, program, windowStart, windowEnd, isMobile }) {
    const { getGoalColor, getGoalTextColor } = useGoalLevels();
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

    if (!program) {
        return <div className={styles.emptyState}>Publish an example program to preview the calendar.</div>;
    }

    return (
        <div className={styles.calendarShell}>
            <ProgramCalendarView
                calendarEvents={calendarEvents}
                blockLabels={blockLabels}
                blockCreationMode={false}
                setBlockCreationMode={() => {}}
                isMobile={isMobile}
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
