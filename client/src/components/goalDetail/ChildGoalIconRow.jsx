import React from 'react';

import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { getGoalNodeId, getGoalNodeName } from '../../utils/goalNodeModel';
import { isSMART } from '../../utils/smartHelpers';
import GoalIcon from '../atoms/GoalIcon';
import Tooltip from '../atoms/Tooltip';
import styles from './ChildGoalIconRow.module.css';

/**
 * Progress for a goal that completes through its children: one icon per child, lit in the
 * completed colors once that child is done, captioned with how the goal completes and the count.
 * Hovering an icon names the child; icons open the child when `onGoalSelect` is given.
 */
function ChildGoalIconRow({ childGoals, childType, onGoalSelect }) {
    const { getGoalColor, getGoalSecondaryColor, getGoalIcon } = useGoalLevels();
    const done = childGoals.filter((child) => Boolean(child.attributes?.completed ?? child.completed)).length;
    const total = childGoals.length;

    return (
        <div className={styles.row}>
            <ul className={styles.icons} aria-label={`Child goals: ${done} of ${total} complete`}>
                {childGoals.map((child) => {
                    const childId = getGoalNodeId(child);
                    const name = getGoalNodeName(child);
                    const completed = Boolean(child.attributes?.completed ?? child.completed);
                    const level = completed ? 'Completed' : childType;
                    const label = `${name}${completed ? ' (complete)' : ''}`;
                    const icon = (
                        <GoalIcon
                            shape={getGoalIcon(childType)}
                            color={getGoalColor(level)}
                            secondaryColor={getGoalSecondaryColor(level)}
                            isSmart={isSMART(child)}
                            size={34}
                        />
                    );
                    return (
                        <li key={childId} className={styles.item}>
                            <Tooltip label={label}>
                                {onGoalSelect ? (
                                    <button
                                        type="button"
                                        className={styles.button}
                                        aria-label={label}
                                        onClick={() => onGoalSelect(child)}
                                    >
                                        {icon}
                                    </button>
                                ) : (
                                    <span className={styles.button} aria-label={label} role="img" tabIndex={0}>{icon}</span>
                                )}
                            </Tooltip>
                        </li>
                    );
                })}
            </ul>
            <p className={styles.caption}>
                Completes when every child goal is complete <span className={styles.count}>({done} / {total} complete)</span>
            </p>
        </div>
    );
}

export default ChildGoalIconRow;
