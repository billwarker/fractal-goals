import React from 'react';

import { CrosshairIcon } from '../AnalyticsIcons';
import Button from '../../atoms/Button';
import styles from './Annotation.module.css';

/** Turns Set goal mode on a chart on and off. Filled so it stands out among a chart's quieter controls. */
export default function SetGoalButton({ annotating, onToggle }) {
    return (
        <Button
            onClick={(event) => {
                event.stopPropagation();
                onToggle();
            }}
            variant={annotating ? 'primary' : 'secondary'}
            size="sm"
            className={annotating ? '' : styles.setGoal}
            style={{ padding: '0 8px' }}
            aria-pressed={annotating}
            title="Set a goal from a point on the chart (A)"
        >
            <CrosshairIcon size={15} />
            <span>{annotating ? 'Done' : 'Set goal'}</span>
        </Button>
    );
}
