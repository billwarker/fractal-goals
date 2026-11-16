import React from 'react';

import styles from './PlanItem.module.css';

/** A titled section of plan item rows (`PlanItemRow`). */
export default function PlanSection({ title, alignKey, children }) {
    return (
        <section className={styles.planSection} data-align-key={alignKey}>
            {title ? <h4 className={styles.planSectionTitle}>{title}</h4> : null}
            {children}
        </section>
    );
}
