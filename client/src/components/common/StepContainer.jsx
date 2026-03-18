import React from 'react';

import styles from './StepContainer.module.css';

function StepContainer({ children, className = '' }) {
    return (
        <section className={`${styles.container} ${className}`.trim()}>
            {children}
        </section>
    );
}

export default StepContainer;
