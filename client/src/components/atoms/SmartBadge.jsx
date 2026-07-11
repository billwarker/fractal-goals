import React from 'react';

import styles from './SmartBadge.module.css';

const SMART_LETTERS = [
    { key: 'specific', letter: 'S' },
    { key: 'measurable', letter: 'M' },
    { key: 'achievable', letter: 'A' },
    { key: 'relevant', letter: 'R' },
    { key: 'timeBound', letter: 'T' },
];

/**
 * SmartBadge - the canonical SMART-letters pill.
 *
 * Purely presentational: pass `status` ({ specific, measurable, achievable,
 * relevant, timeBound }) to light individual letters; omit it to light all
 * five. `color` tints met letters (and the border once fully SMART); themes
 * are handled through shared tokens. `getLetterTooltip(key, isMet)` adds
 * per-letter hover help.
 */
function SmartBadge({ status = null, color, getLetterTooltip, className = '' }) {
    const isMet = (key) => (status ? Boolean(status[key]) : true);
    const isFullySmart = SMART_LETTERS.every(({ key }) => isMet(key));

    return (
        <span
            className={`${styles.badge} ${isFullySmart ? styles.badgeComplete : ''} ${className}`.trim()}
            style={color ? { '--smart-badge-color': color } : undefined}
        >
            {SMART_LETTERS.map(({ key, letter }) => {
                const met = isMet(key);
                const tooltip = getLetterTooltip?.(key, met);
                return (
                    <span
                        key={key}
                        title={tooltip}
                        className={`${styles.letter} ${met ? styles.letterMet : ''} ${tooltip ? styles.letterHelp : ''}`.trim()}
                    >
                        {letter}
                    </span>
                );
            })}
        </span>
    );
}

export default SmartBadge;
