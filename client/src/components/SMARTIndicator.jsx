import React from 'react';
import { calculateSMARTStatus, SMART_CRITERIA, getSMARTTooltip } from '../utils/smartHelpers';
import { getGoalColor } from '../utils/goalColors';

/**
 * SMARTIndicator Component
 * 
 * Displays "SMART" text with each letter highlighted if its criterion is met.
 * Letters are colored with the goal's cosmic color when met, gray when not.
 */
function SMARTIndicator({ goal, goalType }) {
    const status = calculateSMARTStatus(goal);
    const goalColor = getGoalColor(goalType);
    const inactiveColor = '#555';

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
                display: 'flex',
                alignItems: 'center',
                gap: '1px',
                fontSize: '12px',
                fontWeight: 'bold',
                letterSpacing: '0.5px'
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
                            color: isMet ? goalColor : inactiveColor,
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
