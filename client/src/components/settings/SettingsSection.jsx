import React, { useId } from 'react';

import styles from './SettingsSection.module.css';

/** A titled group of settings rows. */
function SettingsSection({ title, description, tone, children }) {
    const titleId = useId();
    return (
        <section className={`${styles.section} ${tone === 'danger' ? styles.danger : ''}`} aria-labelledby={titleId}>
            <header className={styles.header}>
                <h3 id={titleId} className={styles.title}>{title}</h3>
                {description && <p className={styles.description}>{description}</p>}
            </header>
            <div className={styles.rows}>{children}</div>
        </section>
    );
}

/**
 * One setting: its label and help on the left, the control on the right (stacked on phones).
 * Give the control `id={controlId}` and `aria-describedby={rowDescriptionId(controlId)}`.
 * `stacked` puts a wide control (forms, lists) under the label at every width.
 */
export function SettingsRow({ label, description, controlId, stacked = false, children }) {
    return (
        <div className={`${styles.row} ${stacked ? styles.stacked : ''}`}>
            <div className={styles.text}>
                {controlId
                    ? <label htmlFor={controlId} className={styles.label}>{label}</label>
                    : <span className={styles.label}>{label}</span>}
                {description && (
                    <p id={controlId ? rowDescriptionId(controlId) : undefined} className={styles.help}>{description}</p>
                )}
            </div>
            <div className={styles.control}>{children}</div>
        </div>
    );
}

export const rowDescriptionId = (controlId) => `${controlId}-description`;

export default SettingsSection;
