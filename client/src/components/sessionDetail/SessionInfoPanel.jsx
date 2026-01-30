import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import { useTheme } from '../../contexts/ThemeContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import { fractalApi } from '../../utils/api';
import { formatDateInTimezone, formatForInput, localToISO } from '../../utils/dateUtils';
import styles from './SessionInfoPanel.module.css';
import notify from '../../utils/notify';
import { Heading } from '../atoms/Typography';

function SessionInfoPanel({
    session,
    sessionData,
    parentGoals,
    rootId,
    onGoalClick,
    totalDuration,
    onSessionUpdate
}) {
    const { getGoalColor } = useTheme();
    const [isExpanded, setIsExpanded] = useState(false);
    const [editingField, setEditingField] = useState(null); // 'start' | 'end' | null
    const [editValue, setEditValue] = useState('');
    const [saving, setSaving] = useState(false);
    const { timezone } = useTimezone();

    const formatDate = (dateString) => {
        if (!dateString) return '—';
        return formatDateInTimezone(dateString, timezone, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '—';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    };

    const handleStartEdit = (field, currentDate) => {
        setEditingField(field);
        // Format for datetime-local: "YYYY-MM-DDTHH:mm"
        // formatForInput returns "YYYY-MM-DD HH:MM:SS" (in local timezone)
        // We take first 16 chars and replace space with T
        const iso = currentDate || new Date().toISOString();
        const localStr = formatForInput(iso, timezone);
        const inputValue = localStr.replace(' ', 'T').substring(0, 16);
        setEditValue(inputValue);
    };

    const handleSaveEdit = async () => {
        if (!editingField || !session) return;

        setSaving(true);
        try {
            // Convert input "YYYY-MM-DDTHH:mm" to "YYYY-MM-DD HH:MM:SS"
            const localDateTime = editValue.replace('T', ' ') + ':00';

            // Convert wall time in selected timezone to UTC ISO string
            // attributes.session_start/end are stored as UTC ISO strings
            const isoString = localToISO(localDateTime, timezone);

            const field = editingField === 'start' ? 'session_start' : 'session_end';
            const payload = { [field]: isoString };

            const response = await fractalApi.updateSession(rootId, session.id, payload);

            if (onSessionUpdate) {
                onSessionUpdate(response.data);
            }

            setEditingField(null);
        } catch (error) {
            console.error("Failed to update session time", error);
            notify.error("Failed to update time");
        } finally {
            setSaving(false);
        }
    };

    // Determine values safely
    const startTime = session?.session_start || sessionData?.session_start;
    const endTime = session?.session_end || sessionData?.session_end;

    return (
        <div className={styles.sessionInfoPanel}>
            {/* Session Title */}
            <div className={styles.sessionInfoTitle}>
                <Heading level={2}>{session.name}</Heading>
                <Button
                    variant="ghost"
                    size="sm"
                    className={styles.sessionInfoToggle}
                    onClick={() => setIsExpanded(!isExpanded)}
                    title={isExpanded ? 'Collapse' : 'Expand'}
                    style={{ padding: '4px 8px', minHeight: 'auto', height: 'auto' }}
                >
                    {isExpanded ? '▲' : '▼'}
                </Button>
            </div>

            {/* Always visible summary */}
            <div className={styles.sessionInfoSummary}>
                <div className={styles.sessionInfoRow}>
                    <span className={styles.label}>Duration:</span>
                    <span className={`${styles.value} ${styles.duration}`}>{formatDuration(totalDuration)}</span>
                </div>
                {session.program_info && (
                    <div className={styles.sessionInfoRow}>
                        <span className={styles.label}>Program:</span>
                        <Link
                            to={`/${rootId}/programs/${session.program_info.program_id}`}
                            className={`${styles.value} ${styles.link}`}
                        >
                            {session.program_info.program_name}
                        </Link>
                    </div>
                )}
            </div>

            {/* Expandable details */}
            {isExpanded && (
                <>
                    <div className={styles.sessionInfoDetails}>
                        <div className={styles.sessionInfoRow}>
                            <span className={styles.label}>Template:</span>
                            <span className={styles.value}>{sessionData?.template_name || '—'}</span>
                        </div>

                        {/* Session Start */}
                        <div className={styles.sessionInfoRow}>
                            <span className={styles.label}>Started:</span>
                            {editingField === 'start' ? (
                                <div className={styles.editTimeContainer}>
                                    <Input
                                        type="datetime-local"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        className={styles.dateTimeInput}
                                        fullWidth
                                    />
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <Button onClick={handleSaveEdit} disabled={saving} variant="success" size="sm" style={{ padding: '0 8px' }}>✓</Button>
                                        <Button onClick={() => setEditingField(null)} variant="danger" size="sm" style={{ padding: '0 8px' }}>✗</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.valueWithEdit}>
                                    <span>{formatDate(startTime)}</span>
                                    <span
                                        className={styles.editIcon}
                                        onClick={() => handleStartEdit('start', startTime)}
                                        title="Edit start time"
                                    >
                                        ✏️
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Session End */}
                        <div className={styles.sessionInfoRow}>
                            <span className={styles.label}>Ended:</span>
                            {editingField === 'end' ? (
                                <div className={styles.editTimeContainer}>
                                    <Input
                                        type="datetime-local"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        className={styles.dateTimeInput}
                                        fullWidth
                                    />
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <Button onClick={handleSaveEdit} disabled={saving} variant="success" size="sm" style={{ padding: '0 8px' }}>✓</Button>
                                        <Button onClick={() => setEditingField(null)} variant="danger" size="sm" style={{ padding: '0 8px' }}>✗</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.valueWithEdit}>
                                    <span>{formatDate(endTime)}</span>
                                    <span
                                        className={styles.editIcon}
                                        onClick={() => handleStartEdit('end', endTime)}
                                        title="Edit end time"
                                    >
                                        ✏️
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className={styles.sessionInfoRow}>
                            <span className={styles.label}>Created:</span>
                            <span className={styles.value}>{formatDate(session.created_at)}</span>
                        </div>
                        <div className={styles.sessionInfoRow}>
                            <span className={styles.label}>Planned:</span>
                            <span className={styles.value}>{sessionData?.total_duration_minutes || '—'} min</span>
                        </div>
                    </div>

                    {/* Goals section */}
                    {(parentGoals?.length > 0 || session.immediate_goals?.length > 0) && (
                        <div className={styles.sessionInfoGoals}>
                            {parentGoals?.length > 0 && (
                                <div className={styles.goalsGroup}>
                                    <span className={styles.goalsLabel}>Short-Term Goals:</span>
                                    <div className={styles.goalsBadges}>
                                        {parentGoals.map(goal => {
                                            const goalColor = getGoalColor(goal.type || 'ShortTermGoal');
                                            return (
                                                <div
                                                    key={goal.id}
                                                    className={styles.goalBadge}
                                                    style={{
                                                        borderColor: goalColor,
                                                        color: goalColor
                                                    }}
                                                    onClick={() => onGoalClick?.(goal)}
                                                >
                                                    {goal.name}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {session.immediate_goals?.length > 0 && (
                                <div className={styles.goalsGroup}>
                                    <span className={styles.goalsLabel}>Immediate Goals:</span>
                                    <div className={styles.goalsBadges}>
                                        {session.immediate_goals.map(goal => {
                                            const goalColor = getGoalColor(goal.type || 'ImmediateGoal');
                                            return (
                                                <div
                                                    key={goal.id}
                                                    className={styles.goalBadge}
                                                    style={{
                                                        borderColor: goalColor,
                                                        color: goalColor
                                                    }}
                                                    onClick={() => onGoalClick?.(goal)}
                                                >
                                                    {goal.name}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default SessionInfoPanel;
