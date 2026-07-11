import React from 'react';
import { calculateSMARTStatus, getSMARTTooltip } from '../utils/smartHelpers';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import SmartBadge from './atoms/SmartBadge';

/**
 * SMARTIndicator Component
 *
 * Goal-aware wrapper around the SmartBadge atom: computes which SMART
 * criteria the goal meets and lights those letters in the goal's color.
 */
function SMARTIndicator({ goal, goalType, color }) {
    const { getGoalColor } = useGoalLevels();

    return (
        <SmartBadge
            status={calculateSMARTStatus(goal)}
            color={color || getGoalColor(goalType)}
            getLetterTooltip={getSMARTTooltip}
        />
    );
}

export default SMARTIndicator;
