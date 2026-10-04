import React, { useId, useState } from 'react';

import Button from '../../atoms/Button';
import SessionTemplateNameBadge from '../../common/SessionTemplateNameBadge';
import styles from './OptionalTemplateSelector.module.css';

function errorMessage(error) {
    return error?.response?.data?.error || error?.message || 'Something went wrong.';
}

function describeSections(sections) {
    const sectionCount = (sections || []).length;
    const itemCount = (sections || []).reduce((total, section) => total + (section.items || []).length, 0);
    const items = `${itemCount} ${itemCount === 1 ? 'activity' : 'activities'}`;
    return sectionCount > 1 ? `${items} across ${sectionCount} sections` : items;
}

/**
 * The program day's optional templates that are not yet on this date. Adding one stores its
 * seeded plan, which moves it into the column as an editable plan card.
 */
export default function OptionalTemplateSelector({ entries, mutations, onLoaded, headingRef }) {
    const [errors, setErrors] = useState({});
    const headingId = useId();
    if (!entries.length) return null;

    const isLoading = (templateId) => (
        mutations.load.isPending && mutations.load.variables?.templateId === templateId
    );
    const load = (templateId) => {
        setErrors((current) => ({ ...current, [templateId]: '' }));
        mutations.load.mutate({ templateId }, {
            onSuccess: () => onLoaded?.(templateId),
            onError: (error) => setErrors((current) => ({ ...current, [templateId]: errorMessage(error) })),
        });
    };

    return (
        <section className={styles.selector} data-align-key="optional-selector" aria-labelledby={headingId}>
            <header className={styles.header}>
                <h4 id={headingId} ref={headingRef} tabIndex={-1}>Optional sessions</h4>
                <span className={styles.count}>{entries.length}</span>
            </header>
            <p className={styles.hint}>Add the ones you plan to do on this day.</p>
            <ul className={styles.list}>
                {entries.map((entry) => {
                    const templateId = entry.template.id;
                    const error = errors[templateId];
                    return (
                        <li key={templateId} className={styles.row}>
                            <div className={styles.rowText}>
                                <SessionTemplateNameBadge name={entry.template.name} color={entry.template.color} wrap />
                                <span className={styles.summary}>{describeSections(entry.sections)}</span>
                                {error ? <span className={styles.error} role="alert">{error}</span> : null}
                            </div>
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => load(templateId)}
                                disabled={mutations.load.isPending}
                                aria-label={`Add ${entry.template.name} to this day`}
                            >
                                {isLoading(templateId) ? 'Adding…' : 'Add to day'}
                            </Button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
