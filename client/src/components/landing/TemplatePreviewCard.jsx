import React from 'react';
import styles from './LandingShowcaseFrame.module.css';

function getSections(template) {
    const data = template?.template_data || {};
    return Array.isArray(data.sections) ? data.sections : [];
}

function getActivityName(item, activityById) {
    if (!item) return 'Activity';
    if (typeof item === 'string') {
        return activityById.get(item)?.name || 'Activity';
    }
    const id = item.activity_id || item.activity_definition_id || item.id;
    return item.name || item.activity_name || activityById.get(id)?.name || 'Activity';
}

export default function TemplatePreviewCard({ template, activityDefinitions = [] }) {
    const activityById = new Map(activityDefinitions.map((activity) => [activity.id, activity]));
    const sections = getSections(template);

    if (!template) {
        return (
            <article className={styles.previewCard}>
                <h4>No template snapshot</h4>
                <p>Publish an example with session templates to fill this card.</p>
            </article>
        );
    }

    return (
        <article className={styles.previewCard}>
            <h4>{template.name}</h4>
            {template.description ? <p>{template.description}</p> : null}
            <div className={styles.templateSections}>
                {sections.length > 0 ? sections.slice(0, 3).map((section, index) => {
                    const activities = section.activities || section.exercises || [];
                    return (
                        <div className={styles.templateSection} key={`${section.name || 'Section'}-${index}`}>
                            <strong>{section.name || `Section ${index + 1}`}</strong>
                            <span>
                                {activities.length
                                    ? activities.slice(0, 3).map((item) => getActivityName(item, activityById)).join(', ')
                                    : 'Planned work'}
                            </span>
                        </div>
                    );
                }) : (
                    <div className={styles.templateSection}>
                        <strong>{template.session_type || 'Session'}</strong>
                        <span>Ready to run from the saved template.</span>
                    </div>
                )}
            </div>
        </article>
    );
}
