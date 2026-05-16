/**
 * TimelinePanel - Session detail timeline adapter
 * 
 * Shows previous activity history for the focused session activity.
 */

import React, { useMemo, useState } from 'react';
import { useActivityHistory } from '../../hooks/useActivityHistory';
import { useProgressHistory } from '../../hooks/useProgressHistory';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import { useEffectiveDeltaDisplayMode } from '../../hooks/useEffectiveDeltaDisplayMode';
import { useTimezone } from '../../contexts/TimezoneContext';
import ActivityTimelineList from '../common/ActivityTimeline';
import TimelineShell from '../common/TimelineShell';
import styles from './TimelinePanel.module.css';

const HISTORY_LIMIT = 10;

function TimelinePanel({
    rootId,
    sessionId,
    selectedActivity,
    sessionActivityDefs,
}) {
    const [manualSelectedActivityId, setManualSelectedActivityId] = useState(null);
    const availableActivityIds = useMemo(
        () => sessionActivityDefs.map((definition) => definition.id),
        [sessionActivityDefs]
    );

    const selectedActivityId = useMemo(() => {
        const focusedActivityId = selectedActivity?.activity_definition_id;
        if (focusedActivityId && availableActivityIds.includes(focusedActivityId)) {
            return focusedActivityId;
        }
        if (manualSelectedActivityId && availableActivityIds.includes(manualSelectedActivityId)) {
            return manualSelectedActivityId;
        }
        return availableActivityIds[0] || null;
    }, [availableActivityIds, manualSelectedActivityId, selectedActivity]);

    const { history, loading, error } = useActivityHistory(
        rootId,
        selectedActivityId,
        sessionId, // Exclude current session
        { limit: HISTORY_LIMIT }
    );
    const {
        progressHistory,
        isLoading: progressLoading,
        error: progressError,
    } = useProgressHistory(
        rootId,
        selectedActivityId,
        { limit: HISTORY_LIMIT, excludeSessionId: sessionId }
    );
    const progressByInstanceId = useMemo(() => new Map(
        (progressHistory || [])
            .filter((record) => record?.activity_instance_id)
            .map((record) => [record.activity_instance_id, record])
    ), [progressHistory]);

    const { timezone } = useTimezone();
    const { progressSettings } = useRootProgressSettings(rootId);

    const formatDate = (isoString) => {
        if (!isoString) return '';
        try {
            const date = new Date(isoString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: timezone
            });
        } catch {
            return '';
        }
    };

    // Get selected activity definition name
    const selectedDef = sessionActivityDefs.find(d => d.id === selectedActivityId);
    const deltaDisplayMode = useEffectiveDeltaDisplayMode(selectedDef, progressSettings);

    const activitySelector = (
        <div className={styles.timelineSelector}>
            <label>Select Activity:</label>
            <select
                value={selectedActivityId || ''}
                onChange={(e) => setManualSelectedActivityId(e.target.value || null)}
            >
                {sessionActivityDefs.length === 0 ? (
                    <option value="">No activities in session</option>
                ) : (
                    sessionActivityDefs.map(def => (
                        <option key={def.id} value={def.id}>
                            {def.name}
                        </option>
                    ))
                )}
            </select>
        </div>
    );

    return (
        <TimelineShell
            className={styles.timelinePanel}
            bodyClassName={styles.timelineBody}
            modes={[]}
            selector={activitySelector}
        >
            <section className={styles.timelineSection}>
                <div className={styles.timelineSectionHeader}>Activity Timeline</div>
                <div className={styles.timelineContent}>
                    {!selectedActivityId ? (
                        <div className={styles.timelineEmpty}>
                            Select an activity to view previous sessions
                        </div>
                    ) : (loading || progressLoading) ? (
                        <div className={styles.timelineLoading}>Loading timeline...</div>
                    ) : (error || progressError) ? (
                        <div className={styles.timelineError}>Error: {error || progressError?.message || progressError}</div>
                    ) : history.length > 0 ? (
                        <ActivityTimelineList
                            items={history}
                            activityDef={selectedDef}
                            progressByInstanceId={progressByInstanceId}
                            formatDate={formatDate}
                            timezone={timezone}
                            deltaDisplayMode={deltaDisplayMode}
                        />
                    ) : (
                        <div className={styles.timelineEmpty}>
                            No previous sessions found for {selectedDef?.name || 'this activity'}
                        </div>
                    )}
                </div>
            </section>
        </TimelineShell>
    );
}

export default TimelinePanel;
