import React from 'react';
import GoalIcon from '../atoms/GoalIcon';
import { useTheme } from '../../contexts/ThemeContext';
import styles from './LandingFeaturesSection.module.css';

const SAMPLE_ICONS = [
    { shape: 'twelvePointStar', color: '#4f9cf9', secondaryColor: '#102235' },
    { shape: 'hexagon', color: '#3bc57c', secondaryColor: '#0f271c' },
    { shape: 'diamond', color: '#f59f4d', secondaryColor: '#2c1d0f' },
    { shape: 'triangle', color: '#8b6fff', secondaryColor: '#181329' },
    { shape: 'circle', color: '#ef6a6a', secondaryColor: '#301515' },
];

function ThemeToggleDemo() {
    const { theme, toggleTheme } = useTheme();
    return (
        <button type="button" className={styles.themeToggle} onClick={toggleTheme} aria-pressed={theme === 'light'}>
            <span aria-hidden="true">{theme === 'light' ? '☀️' : '🌙'}</span>
            <span>{theme === 'light' ? 'Light mode on - tap for dark' : 'Dark mode on - tap for light'}</span>
        </button>
    );
}

function IconSamples() {
    return (
        <div className={styles.iconSampleRow} aria-hidden="true">
            {SAMPLE_ICONS.map((icon) => (
                <GoalIcon key={icon.shape} {...icon} size={30} />
            ))}
        </div>
    );
}

// "And more" card grid. Cards stay markdown-editable; interactive demos attach
// by keyword so renaming copy does not silently drop them.
export default function LandingFeatureMore({ extras }) {
    return (
        <div className={styles.extrasGrid}>
            {extras.map((extra) => {
                const title = extra.title.toLowerCase();
                const isThemeCard = title.includes('light') || title.includes('dark');
                const isIconCard = title.includes('icon');
                return (
                    <article className={styles.extraCard} key={extra.title}>
                        <h4>{extra.title}</h4>
                        <p>{extra.body}</p>
                        {isThemeCard && <ThemeToggleDemo />}
                        {isIconCard && <IconSamples />}
                    </article>
                );
            })}
        </div>
    );
}
