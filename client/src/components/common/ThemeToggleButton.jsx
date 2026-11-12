import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './ThemeToggleButton.module.css';

// Flips between light and dark for this device; Settings keeps the full set of modes.
export default function ThemeToggleButton({ className = '' }) {
    const { resolvedTheme, setPreference } = useTheme();
    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    return (
        <button
            type="button"
            className={`${styles.toggle} ${className}`}
            aria-label={`Switch to ${nextTheme} theme`}
            title={`Switch to ${nextTheme} theme`}
            onClick={() => setPreference({ mode: nextTheme })}
        >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                {resolvedTheme === 'dark' ? (
                    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="12" r="4.5" />
                        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
                    </g>
                ) : (
                    <path fill="currentColor" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z" />
                )}
            </svg>
        </button>
    );
}
