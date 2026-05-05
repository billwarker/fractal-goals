import React from 'react';

import Linkify from './atoms/Linkify';
import SessionTemplateNameBadge from './common/SessionTemplateNameBadge';
import SessionTemplateTypePill from './common/SessionTemplateTypePill';
import styles from './TemplateCard.module.css';
import {
    isQuickSession,
} from '../utils/sessionRuntime';
import { getAverageDurationStat } from '../utils/durationStats';

function getQuickActivityCount(template) {
    return template.template_data?.activities?.length || 0;
}

function getNormalActivityCount(template) {
    return template.template_data?.sections?.reduce(
        (sum, section) => sum + (section.activities?.length || section.exercises?.length || 0),
        0
    ) || 0;
}

/**
 * Template Card - Display card for session templates in grid view
 */
function TemplateCard({ template, onEdit, onDelete, onDuplicate }) {
    const quickTemplate = isQuickSession(template);
    const sectionCount = template.template_data?.sections?.length || 0;
    const activityCount = quickTemplate ? getQuickActivityCount(template) : getNormalActivityCount(template);
    const averageDuration = getAverageDurationStat(template.stats);

    return (
        <div
            className={`${styles.card} template-card hover-glow`}
            onClick={() => onEdit(template)}
        >
            <div className={styles.header}>
                <div className={styles.nameBlock}>
                    <SessionTemplateNameBadge entity={template} size="md" />
                    <SessionTemplateTypePill entity={template} size="sm" />
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
                        <span className={styles.durationIcon}>⏱</span>
                        Avg {averageDuration.label}
                        <span className={styles.sampleHint}>({averageDuration.sampleCount})</span>
                    </span>
                )}
                {!quickTemplate && (
                    <span className={styles.stat}>
                        <span className={styles.sectionIcon}>§</span>
                        {sectionCount} section{sectionCount !== 1 ? 's' : ''}
                    </span>
                )}
                <span className={styles.stat}>
                    <span className={styles.activityIcon}>◆</span>
                    {activityCount} activit{activityCount !== 1 ? 'ies' : 'y'}
                </span>
            </div>

            {!quickTemplate && template.template_data?.sections?.length > 0 && (
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

            {quickTemplate && template.template_data?.activities?.length > 0 && (
                <div className={styles.sectionsPreview}>
                    {template.template_data.activities.slice(0, 4).map((activity) => (
                        <span
                            key={activity.id || activity.activity_id || activity.activity_definition_id || activity.name || 'activity'}
                            className={styles.sectionTag}
                        >
                            {activity.name || 'Activity'}
                        </span>
                    ))}
                    {template.template_data.activities.length > 4 && (
                        <span className={styles.moreTag}>
                            +{template.template_data.activities.length - 4} more
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
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onDelete(template);
                    }}
                    className={styles.deleteAction}
                >
                    Delete
                </button>
            </div>
        </div>
    );
}

export default TemplateCard;
