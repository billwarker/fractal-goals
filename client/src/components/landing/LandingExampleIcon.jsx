import React from 'react';
import AnimatedGoalIcon from '../atoms/AnimatedGoalIcon';
import GoalIcon from '../atoms/GoalIcon';
import { GoalLevelsProvider, useGoalLevels } from '../../contexts/GoalLevelsContext';

function RootIcon({ root, size }) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const Icon = root.is_smart ? AnimatedGoalIcon : GoalIcon;
    return (
        <Icon
            shape={getGoalIcon(root)}
            color={getGoalColor(root)}
            secondaryColor={getGoalSecondaryColor(root)}
            isSmart={Boolean(root.is_smart)}
            size={size}
            reduced
        />
    );
}

/**
 * A demo example's root icon, resolved from its published levels the way the app (and
 * the tree preview beside it) resolves them, so the picker and the tree always agree.
 */
export default function LandingExampleIcon({ example, size }) {
    const root = example.preview?.tree;
    if (!root) {
        const Icon = example.icon?.isSmart ? AnimatedGoalIcon : GoalIcon;
        return <Icon {...example.icon} size={size} reduced />;
    }
    return (
        <GoalLevelsProvider seedLevels={example.preview.levels} seedAppearance={example.appearance}>
            <RootIcon root={root} size={size} />
        </GoalLevelsProvider>
    );
}
