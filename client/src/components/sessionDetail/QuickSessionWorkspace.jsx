import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useActiveSessionActions, useActiveSessionData } from '../../contexts/ActiveSessionContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatDateInTimezone } from '../../utils/dateUtils';
import CompletionCheckBadge from '../common/CompletionCheckBadge';
import MetaField from '../common/MetaField';
import SessionCompletionButton from '../common/SessionCompletionButton';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import SessionTemplateTypePill from '../common/SessionTemplateTypePill';
import SessionActivityItem from './SessionActivityItem';
import { isQuickSession } from '../../utils/sessionRuntime';
import styles from './QuickSessionWorkspace.module.css';

function buildOrderedInstances(activityIds, activityInstances) {
    if (!Array.isArray(activityIds) || activityIds.length === 0) return activityInstances || [];
    const instanceMap = new Map((activityInstances || []).map((instance) => [instance.id, instance]));
    return activityIds.map((id) => instanceMap.get(id)).filter(Boolean);
}

function QuickSessionWorkspace({
    embedded = false,
    onStartAnother,
    showCompletionAction = true,
}) {
    const navigate = useNavigate();
    const { timezone } = useTimezone();
    const {
        rootId,
        sessionId,
        session,
        localSessionData,
        activityInstances,
        activities,
    } = useActiveSessionData();
    const {
        toggleSessionComplete,
    } = useActiveSessionActions();

    const definitionById = useMemo(
        () => new Map((activities || []).map((definition) => [definition.id, definition])),
        [activities]
    );
    const orderedInstances = useMemo(
        () => buildOrderedInstances(localSessionData?.activity_ids, activityInstances),
        [activityInstances, localSessionData?.activity_ids]
    );
    const completed = Boolean(session?.completed || session?.attributes?.completed);
    const quickSession = isQuickSession(session);
    const programInfo = session?.program_info || null;
    const sessionStart = session?.attributes?.session_start
        || session?.session_start
        || localSessionData?.session_start
        || session?.attributes?.created_at
        || session?.created_at;
    const updatedAt = session?.attributes?.updated_at || session?.updated_at;

    const formatMetaDate = (value) => (
        formatDateInTimezone(value, timezone, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        })
    );

    if (!quickSession) {
        return null;
    }

    return (
        <div className={`${styles.workspace} ${embedded ? styles.embeddedWorkspace : styles.standaloneWorkspace}`}>
            <div className={styles.surface}>
                <div className={styles.headerSection}>
                    <div className={styles.topGrid}>
                        <div className={styles.titleGroup}>
                            <div className={styles.titleRow}>
                                <SessionTemplateNameBadge
                                    name={session?.name || localSessionData?.template_name || 'Quick Session'}
                                    entity={session}
                                    size="lg"
                                />
                                {completed && <CompletionCheckBadge className={styles.completedBadge} />}
                            </div>
                            <div className={styles.metaRow}>
                                <SessionTemplateTypePill entity={session} size="sm" />
                            </div>
                        </div>

                        <div className={styles.summaryGrid}>
                            <MetaField
                                className={styles.summaryItem}
                                label="Program"
                                muted={!programInfo}
                                valueClassName={styles.programFieldValue}
                                value={programInfo ? (
                                    <div className={styles.programValueGroup}>
                                        <Link
                                            to={`/${rootId}/programs/${programInfo.program_id}`}
                                            className={styles.programLink}
                                        >
                                            {programInfo.program_name}
                                        </Link>
                                        <span className={styles.programSubtext}>
                                            {programInfo.block_name} • {programInfo.day_name}
                                        </span>
                                    </div>
                                ) : '-'}
                            />
                            <MetaField
                                className={styles.summaryItem}
                                label="Session Start"
                                value={sessionStart ? formatMetaDate(sessionStart) : '-'}
                                muted={!sessionStart}
                            />
                            <MetaField
                                className={styles.summaryItem}
                                label="Last Modified"
                                value={updatedAt ? formatMetaDate(updatedAt) : '-'}
                                muted={!updatedAt}
                            />
                        </div>
                    </div>

                    <div className={styles.actionBar}>
                        <div className={styles.actionGroup}>
                            {embedded && (
                                <button
                                    type="button"
                                    onClick={() => navigate(`/${rootId}/session/${sessionId}`)}
                                    className={styles.secondaryButton}
                                    aria-label="Open full session detail page"
                                >
                                    Open Full Session
                                </button>
                            )}
                            {completed && embedded && onStartAnother && (
                                <button
                                    type="button"
                                    onClick={onStartAnother}
                                    className={styles.secondaryButton}
                                    aria-label="Start another quick session from this template"
                                >
                                    Start Another
                                </button>
                            )}
                            {showCompletionAction && (
                                <SessionCompletionButton
                                    onClick={toggleSessionComplete}
                                    completed={completed}
                                    className={styles.actionButton}
                                />
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.bodySection}>
                    {orderedInstances.length === 0 ? (
                        <div className={styles.emptyState}>
                            No activities available for this quick session.
                        </div>
                    ) : (
                        <div className={styles.activityList}>
                            {orderedInstances.map((instance) => (
                                <SessionActivityItem
                                    key={instance.id}
                                    exercise={instance}
                                    quickMode
                                    isSelected={false}
                                    activityDefinition={definitionById.get(instance.activity_definition_id) || null}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default QuickSessionWorkspace;
