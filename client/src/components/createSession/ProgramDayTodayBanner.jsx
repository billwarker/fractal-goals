import React from 'react';

import Button from '../atoms/Button';
import ProgramName from '../atoms/ProgramName';
import styles from './ProgramDayTodayBanner.module.css';

function ProgramDayTodayBanner({
    programName,
    programColor,
    blockName,
    dayName,
    dayNumber,
    blockColor,
    completedCount = 0,
    minTemplates = 0,
    totalRequired = 0,
    isDayComplete = false,
    isDayRest = false,
    onJumpToProgramDay,
}) {
    const dayLabel = dayNumber ? `Day ${dayNumber}` : (dayName || 'Program day');
    return (
        <section className={`${styles.banner} ${isDayComplete || isDayRest ? styles.complete : ''}`} style={{ '--program-day-color': blockColor }}>
            <div className={styles.content}>
                <strong>{isDayRest ? 'Today is a program rest day' : isDayComplete ? 'Today’s program day is complete' : `Today is ${dayLabel}${dayName && dayName !== dayLabel ? ` — ${dayName}` : ''}`}</strong>
                <span className={styles.context}>
                    {blockName ? <span style={{ color: blockColor || 'var(--color-brand-primary)' }}>{blockName}</span> : null}
                    {programName ? <> · <ProgramName name={programName} color={programColor} /></> : null}
                </span>
                {!isDayRest ? <span className={styles.progress}>{completedCount} / {minTemplates || totalRequired} complete</span> : null}
            </div>
            {!isDayComplete && !isDayRest ? <Button variant="secondary" size="sm" onClick={onJumpToProgramDay}>Start this day</Button> : null}
        </section>
    );
}

export default ProgramDayTodayBanner;
