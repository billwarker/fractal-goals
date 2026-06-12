import React from 'react';
import GoalIcon from '../atoms/GoalIcon';
import styles from './LandingExampleRail.module.css';

// Fixed example-fractal switcher that sits just left of the section dot rail.
// Landing renders it only once the user scrolls past the hero, so the active
// example can be flipped in place (no scrolling) from the goals view or
// features section without returning to the hero picker.
export default function LandingExampleRail({ examples, activeExampleId, onSelect }) {
    if (examples.length < 2) return null;

    return (
        <nav className={styles.rail} aria-label="Example fractals">
            <ol className={styles.iconList}>
                {examples.map((example) => (
                    <li key={example.id}>
                        <button
                            type="button"
                            className={`${styles.iconButton} ${example.id === activeExampleId ? styles.iconActive : ''}`}
                            aria-label={example.label}
                            aria-current={example.id === activeExampleId ? 'true' : undefined}
                            onClick={() => onSelect(example.id)}
                        >
                            <span className={styles.icon} aria-hidden="true">
                                <GoalIcon {...example.rootIcon} size={24} />
                            </span>
                            <span className={styles.iconLabel} aria-hidden="true">{example.label}</span>
                        </button>
                    </li>
                ))}
            </ol>
        </nav>
    );
}
