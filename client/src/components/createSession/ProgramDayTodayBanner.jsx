import React from 'react';

import Button from '../atoms/Button';
import ProgramName from './ProgramName';
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
    onJumpToProgramDay,
}) {
    const dayLabel = dayNumber ? `Day ${dayNumber}` : (dayName || 'Program day');
    return (
        <section className={`${styles.banner} ${isDayComplete ? styles.complete : ''}`} style={{ '--program-day-color': blockColor }}>
            <div className={styles.content}>
                <strong>{isDayComplete ? 'Today’s program day is complete' : `Today is ${dayLabel}${dayName && dayName !== dayLabel ? ` — ${dayName}` : ''}`}</strong>
                <span className={styles.context}>
                    {blockName ? <span style={{ color: blockColor || 'var(--color-brand-primary)' }}>{blockName}</span> : null}
                    {programName ? <> · <ProgramName name={programName} color={programColor} /></> : null}
                </span>
                <span className={styles.progress}>{completedCount} / {minTemplates || totalRequired} complete</span>
            </div>
            {!isDayComplete ? <Button variant="secondary" size="sm" onClick={onJumpToProgramDay}>Start this day</Button> : null}
        </section>
    );
}

export default ProgramDayTodayBanner;
