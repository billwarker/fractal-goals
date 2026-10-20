import React, { useMemo, useState } from 'react';

import Modal from '../atoms/Modal';
import ViewToggleTabs from '../common/ViewToggleTabs';
import { ActivityTimelineCard } from '../common/ActivityTimeline';
import { useGoalConditionEvidence } from '../../hooks/useGoalConditionQueries';
import { describeCondition, describeProgress, progressFraction } from '../../utils/goalConditions';
import ConditionProgressChart from './ConditionProgressChart';
import ConditionProgressBar from './ConditionProgressBar';
import styles from './ConditionEvidenceModal.module.css';

const RECENT_LIMIT = 12;

/**
 * The evidence behind a goal's activity threshold: progress, a chart against the threshold, and the
 * most recent contributing sessions. `snapshot` renders published landing data without any fetch.
 */
function ConditionEvidenceModal({
    isOpen, onClose, rootId, goalId, goalName, accentColor, snapshot = null, portalContainer = null, overlayClassName = '',
}) {
    const [since, setSince] = useState('active');
    const query = useGoalConditionEvidence(rootId, goalId, { since, enabled: isOpen && !snapshot });
    const payload = snapshot || query.data;
    const condition = payload?.condition || null;
    const activity = payload?.activity_definition || null;
    const instances = useMemo(() => payload?.instances || [], [payload?.instances]);
    const progress = payload?.progress || null;
    const recent = [...instances].reverse().slice(0, RECENT_LIMIT);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={goalName || 'Completion'}
            size="lg"
            layer="top"
            portalContainer={portalContainer}
            overlayClassName={overlayClassName}
        >
            <div className={styles.body} style={{ '--condition-accent': accentColor || 'var(--color-brand-primary)' }}>
                {condition ? <p className={styles.sentence}>{describeCondition(condition, activity)}</p> : null}
                {progress ? (
                    <ConditionProgressBar
                        fraction={progressFraction(progress)}
                        label={describeProgress(progress, condition)}
                        met={Boolean(progress.met || progress.completed)}
                        accentColor={accentColor}
                    />
                ) : null}
                {!snapshot ? (
                    <ViewToggleTabs
                        items={[{ value: 'active', label: 'Active period' }, { value: 'all', label: 'All history' }]}
                        value={since}
                        onChange={setSince}
                        ariaLabel="Evidence range"
                        className={styles.rangeTabs}
                    />
                ) : null}
                {query.isLoading && !snapshot ? <p className={styles.empty} role="status">Loading evidence…</p> : null}
                {query.error && !snapshot ? <p className={styles.empty} role="alert">Couldn’t load evidence. Try again.</p> : null}
                {condition ? <ConditionProgressChart condition={condition} instances={instances} activity={activity} /> : null}
                {recent.length > 0 ? (
                    <div className={styles.recent}>
                        <h3 className={styles.recentTitle}>Recent sessions</h3>
                        {recent.map((instance) => (
                            <ActivityTimelineCard
                                key={instance.id}
                                instance={instance}
                                activityDef={activity}
                                progressRecord={instance.progress_comparison || null}
                                formatDate={(iso) => (iso ? new Date(iso).toLocaleString() : '')}
                            />
                        ))}
                    </div>
                ) : null}
            </div>
        </Modal>
    );
}

export default ConditionEvidenceModal;
