import React, { useState } from 'react';
import { Link } from 'react-router-dom';

import { useActiveSessionActions, useActiveSessionData } from '../../contexts/ActiveSessionContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import { useLivePausedDuration, useLiveSessionDuration } from '../../hooks/useSessionDuration';
import { formatDateInTimezone, formatForInput, localToISO } from '../../utils/dateUtils';
import notify from '../../utils/notify';
import Button from '../atoms/Button';
import CheckIcon from '../atoms/CheckIcon';
import CloseIcon from '../atoms/CloseIcon';
import DisclosureButton from '../atoms/DisclosureButton';
import EditIcon from '../atoms/EditIcon';
import { Heading } from '../atoms/Typography';
import Input from '../atoms/Input';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import { formatClockDuration } from '../../utils/sessionTime';
import { getTemplateColor } from '../../utils/sessionRuntime';

import styles from './SessionInfoPanel.module.css';
import { logError } from '../../utils/logger';

function SessionInfoPanel() {
    const {
        rootId,
        session,
        localSessionData: sessionData,
        calculateTotalDuration
    } = useActiveSessionData();
    const { updateSession } = useActiveSessionActions();

    const totalDuration = calculateTotalDuration();
    const liveDuration = useLiveSessionDuration(session);
    const pausedDuration = useLivePausedDuration(session);
    const [isExpanded, setIsExpanded] = useState(false);
    const [editingField, setEditingField] = useState(null); // 'start' | 'end' | null
    const [editValue, setEditValue] = useState('');
    const [saving, setSaving] = useState(false);
    const { timezone } = useTimezone();
    const templateColor = getTemplateColor(session);
    const programInfo = session?.program_info || null;
    const programDayNumberLabel = programInfo?.day_number ? `Day ${programInfo.day_number}` : null;
    const programDayLabel = [
        programDayNumberLabel,
        programInfo?.day_name && programInfo.day_name !== programDayNumberLabel ? programInfo.day_name : null,
    ].filter(Boolean).join(' — ');

    const formatDate = (dateString) => {
        if (!dateString) return '—';
        return formatDateInTimezone(dateString, timezone, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
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

            await updateSession(payload);

            setEditingField(null);
        } catch (error) {
            logError("Failed to update session time", error);
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
                <Heading level={2}>
                    {sessionData?.template_name ? (
                        <SessionTemplateNameBadge
                            name={sessionData.template_name}
                            color={templateColor}
                            size="xl"
                            wrap
                            className={styles.templateBadge}
                        />
                    ) : session.name}
                </Heading>
                <DisclosureButton
                    expanded={isExpanded}
                    className={styles.sessionInfoToggle}
                    onClick={() => setIsExpanded(!isExpanded)}
                    title={isExpanded ? 'Collapse' : 'Expand'}
                    aria-label={isExpanded ? 'Hide session details' : 'Show session details'}
                />
            </div>

            {/* Always visible summary */}
            <div className={styles.sessionInfoSummary}>
                <div className={styles.durationSummaryRow}>
                    <span className={styles.durationSummaryItem}>
                        <span className={styles.label}>Activity</span>
                        <span className={`${styles.value} ${styles.duration}`}>{formatClockDuration(totalDuration, '—')}</span>
                    </span>
                    <span className={styles.durationSummaryItem}>
                        <span className={styles.label}>Session</span>
                        <span className={`${styles.value} ${styles.duration}`}>{liveDuration.formatted}</span>
                    </span>
                </div>
                {session?.is_paused && (
                    <div className={styles.sessionInfoRow}>
                        <span className={styles.label}>Status:</span>
                        <span className={`${styles.value} ${styles.duration} ${styles.pausedStatus}`}>
                            PAUSED {pausedDuration.formatted}
                        </span>
                    </div>
                )}
                {programInfo ? (
                    <div className={styles.sessionInfoRow}>
                        <span className={styles.label}>Program:</span>
                        <span
                            className={styles.programContextValue}
                            data-testid="program-context"
                            style={{
                                '--session-program-color': programInfo.program_color || 'var(--color-brand-primary)',
                                '--session-block-color': programInfo.block_color || 'var(--color-brand-primary)',
                            }}
                        >
                            {programInfo.program_name ? (
                                programInfo.program_id ? (
                                    <Link
                                        to={`/${rootId}/programs/${programInfo.program_id}`}
                                        className={`${styles.value} ${styles.link} ${styles.programValue}`}
                                    >
                                        {programInfo.program_name}
                                    </Link>
                                ) : <span className={styles.programValue}>{programInfo.program_name}</span>
                            ) : null}
                            {programInfo.block_name ? (
                                <>{programInfo.program_name ? <span className={styles.contextSeparator}>·</span> : null}<span className={styles.blockValue}>{programInfo.block_name}</span></>
                            ) : null}
                            {programDayLabel ? (
                                <>{programInfo.program_name || programInfo.block_name ? <span className={styles.contextSeparator}>·</span> : null}<span className={styles.blockValue}>{programDayLabel}</span></>
                            ) : null}
                        </span>
                    </div>
                ) : null}
            </div>

            {/* Expandable details */}
            {isExpanded && (
                <>
                    <div className={styles.sessionInfoDetails}>
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
                                    <div className={styles.editActions}>
                                        <Button onClick={handleSaveEdit} disabled={saving} variant="success" size="sm" className={styles.editActionButton} aria-label="Save time">
                                            <CheckIcon size={14} />
                                        </Button>
                                        <Button onClick={() => setEditingField(null)} variant="danger" size="sm" className={styles.editActionButton} aria-label="Cancel time edit">
                                            <CloseIcon size={14} />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.valueWithEdit}>
                                    <span>{formatDate(startTime)}</span>
                                    <button
                                        type="button"
                                        className={styles.iconButton}
                                        onClick={() => handleStartEdit('start', startTime)}
                                        title="Edit start time"
                                    >
                                        <EditIcon size={12} />
                                    </button>
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
                                    <div className={styles.editActions}>
                                        <Button onClick={handleSaveEdit} disabled={saving} variant="success" size="sm" className={styles.editActionButton} aria-label="Save time">
                                            <CheckIcon size={14} />
                                        </Button>
                                        <Button onClick={() => setEditingField(null)} variant="danger" size="sm" className={styles.editActionButton} aria-label="Cancel time edit">
                                            <CloseIcon size={14} />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.valueWithEdit}>
                                    <span>{formatDate(endTime)}</span>
                                    <button
                                        type="button"
                                        className={styles.iconButton}
                                        onClick={() => handleStartEdit('end', endTime)}
                                        title="Edit end time"
                                    >
                                        <EditIcon size={12} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {(session?.total_paused_seconds > 0 || session?.is_paused) && (
                            <div className={styles.sessionInfoRow}>
                                <span className={styles.label}>Paused Time:</span>
                                <span className={styles.value}>
                                    {pausedDuration.formatted}
                                </span>
                            </div>
                        )}

                        <div className={styles.sessionInfoRow}>
                            <span className={styles.label}>Created:</span>
                            <span className={styles.value}>{formatDate(session.created_at)}</span>
                        </div>
                        <div className={styles.sessionInfoRow}>
                            <span className={styles.label}>Planned:</span>
                            <span className={styles.value}>{sessionData?.total_duration_minutes || '—'} min</span>
                        </div>
                    </div>

                </>
            )}
        </div>
    );
}

export default SessionInfoPanel;
