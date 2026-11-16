import React from 'react';

import { getAverageDurationStat } from '../utils/durationStats';
import Linkify from './atoms/Linkify';
import { ClockIcon } from './atoms/AppIcons';
import DeleteButton from './atoms/DeleteButton';
import SessionTemplateNameBadge from './common/SessionTemplateNameBadge';
import styles from './TemplateCard.module.css';

function getActivityCount(template) {
    return template.template_data?.sections?.reduce(
        (sum, section) => sum + (
            section.items?.filter((item) => item?.type === 'activity' || item?.type === 'circuit').length
            || section.activities?.length
            || section.exercises?.length
            || 0
        ),
        0
    ) || 0;
}

/**
 * Template Card - Display card for session templates in grid view
 */
function TemplateCard({ template, onEdit, onDelete, onDuplicate, onArchiveToggle }) {
    const sectionCount = template.template_data?.sections?.length || 0;
    const activityCount = getActivityCount(template);
    const averageDuration = getAverageDurationStat(template.stats);
    const isArchived = Boolean(template.is_archived);
    const isUsedInActiveProgram = Boolean(template.is_used_in_active_program);

    return (
        <div
            className={`${styles.card} template-card hover-glow`}
            onClick={() => onEdit(template)}
        >
            <div className={styles.header}>
                <div className={styles.nameBlock}>
                    <SessionTemplateNameBadge entity={template} size="md" />
                    <div className={styles.pillRow}>
                        {isArchived && (
                            <span className={styles.statusPill}>
                                Archived
                            </span>
                        )}
                        {isUsedInActiveProgram && (
                            <span className={styles.activeProgramPill}>
                                Active Program
                            </span>
                        )}
                    </div>
                </div>

                {template.description && (
                    <p className={styles.description}>
                        <Linkify>{template.description}</Linkify>
                    </p>
                )}
            </div>

            <div className={styles.statsRow}>
                {averageDuration && (
                    <span
                        className={styles.stat}
                        title={`Based on ${averageDuration.sampleCount} completed sessions`}
                    >
                        <ClockIcon size={14} className={styles.durationIcon} />
                        Avg {averageDuration.label}
                        <span className={styles.sampleHint}>({averageDuration.sampleCount})</span>
                    </span>
                )}
                <span className={styles.stat}>
                    <span className={styles.sectionIcon}>§</span>
                    {sectionCount} section{sectionCount !== 1 ? 's' : ''}
                </span>
                <span className={styles.stat}>
                    <span className={styles.activityIcon}>◆</span>
                    {activityCount} activit{activityCount !== 1 ? 'ies' : 'y'}
                </span>
            </div>

            {template.template_data?.sections?.length > 0 && (
                <div className={styles.sectionsPreview}>
                    {template.template_data.sections.slice(0, 4).map((section) => (
                        <span key={section.id || section.name || 'section'} className={styles.sectionTag}>
                            {section.name}
                        </span>
                    ))}
                    {template.template_data.sections.length > 4 && (
                        <span className={styles.moreTag}>
                            +{template.template_data.sections.length - 4} more
                        </span>
                    )}
                </div>
            )}

            <div className={styles.actions}>
                {onDuplicate && (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onDuplicate(template);
                        }}
                        className={styles.ghostAction}
                    >
                        Duplicate
                    </button>
                )}
                {onArchiveToggle && (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onArchiveToggle(template);
                        }}
                        className={styles.ghostAction}
                    >
                        {isArchived ? 'Reactivate' : 'Archive'}
                    </button>
                )}
                <DeleteButton
                    onClick={(event) => {
                        event.stopPropagation();
                        onDelete(template);
                    }}
                />
            </div>
        </div>
    );
}

export default TemplateCard;
