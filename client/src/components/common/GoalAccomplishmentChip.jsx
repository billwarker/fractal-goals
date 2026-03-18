import React from 'react';

import GoalIcon from '../atoms/GoalIcon';
import styles from './GoalAccomplishmentChip.module.css';

function GoalAccomplishmentChip({
    label,
    color,
    secondaryColor,
    shape,
    isSmart = false,
    className = '',
}) {
    return (
        <div
            className={`${styles.chip} ${className}`.trim()}
            style={{ '--accomplishment-color': color }}
        >
            <GoalIcon
                shape={shape}
                color={color}
                secondaryColor={secondaryColor}
                isSmart={isSmart}
                size={16}
            />
            <span className={styles.text}>{label}</span>
        </div>
    );
}

export default GoalAccomplishmentChip;
