import React from 'react';
import styles from './LandingSectionNav.module.css';

// Fixed dot rail for the segmented landing page. Hidden below the desktop
// snap breakpoint via CSS; one dot per full-viewport section.
export default function LandingSectionNav({ sections, activeId, onNavigate, hasExampleRail = false }) {
    return (
        <nav
            className={`${styles.rail} ${hasExampleRail ? styles.railWithExamples : ''}`}
            aria-label="Page sections"
        >
            <ol className={styles.dotList}>
                {sections.map((section) => (
                    <li key={section.id}>
                        <button
                            type="button"
                            className={`${styles.dotButton} ${section.id === activeId ? styles.dotActive : ''}`}
                            aria-label={section.label}
                            aria-current={section.id === activeId ? 'true' : undefined}
                            onClick={() => onNavigate(section.id)}
                        >
                            <span className={styles.dot} aria-hidden="true" />
                            <span className={styles.dotLabel} aria-hidden="true">{section.label}</span>
                        </button>
                    </li>
                ))}
            </ol>
        </nav>
    );
}
