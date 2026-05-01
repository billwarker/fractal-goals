import React from 'react';
import { calculateSMARTStatus, getSMARTTooltip } from '../utils/smartHelpers';
import { useGoalLevels } from '../contexts/GoalLevelsContext';;

/**
 * SMARTIndicator Component
 * 
 * Displays "SMART" text with each letter highlighted if its criterion is met.
 * Letters are colored with the goal's cosmic color when met, gray when not.
 */
function SMARTIndicator({ goal, goalType, color, secondaryColor, textColor }) {
    const { getGoalColor, getGoalSecondaryColor, getGoalTextColor } = useGoalLevels();;
    const status = calculateSMARTStatus(goal);
    const goalColor = color || getGoalColor(goalType);
    const goalSecondaryColor = secondaryColor || getGoalSecondaryColor(goalType);
    const goalTextColor = textColor || getGoalTextColor(goalType);
    const isFullySmart = Object.values(status).every(Boolean);
    const inactiveColor = 'var(--color-text-secondary)';

    // Map status keys to SMART letter order
    const letters = [
        { key: 'specific', letter: 'S' },
        { key: 'measurable', letter: 'M' },
        { key: 'achievable', letter: 'A' },
        { key: 'relevant', letter: 'R' },
        { key: 'timeBound', letter: 'T' }
    ];

    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1px',
                minHeight: '22px',
                padding: '0 8px',
                border: isFullySmart
                    ? `1px solid color-mix(in srgb, ${goalSecondaryColor} 78%, ${goalColor})`
                    : '1px solid var(--color-border)',
                borderRadius: '999px',
                background: isFullySmart
                    ? `linear-gradient(135deg, ${goalColor} 0%, color-mix(in srgb, ${goalSecondaryColor} 72%, ${goalColor}) 100%)`
                    : 'color-mix(in srgb, var(--color-bg-card) 72%, transparent)',
                boxShadow: isFullySmart
                    ? `inset 0 0 0 1px color-mix(in srgb, ${goalSecondaryColor} 22%, transparent)`
                    : 'none',
                fontSize: '12px',
                fontWeight: 'bold',
                letterSpacing: '0.5px',
                lineHeight: 1,
            }}
        >
            {letters.map(({ key, letter }) => {
                const isMet = status[key];
                const tooltip = getSMARTTooltip(key, isMet);

                return (
                    <span
                        key={key}
                        title={tooltip}
                        style={{
                            color: isFullySmart
                                ? goalTextColor
                                : isMet
                                    ? goalColor
                                    : inactiveColor,
                            cursor: 'help',
                            transition: 'color 0.2s ease'
                        }}
                    >
                        {letter}
                    </span>
                );
            })}
        </div>
    );
}

export default SMARTIndicator;
