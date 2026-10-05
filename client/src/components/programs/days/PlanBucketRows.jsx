import React, { useEffect, useRef } from 'react';

import { formatLiteralDate } from '../../../utils/dateUtils';
import { pickBucketDate } from '../../../utils/programDayBuckets';
import styles from './ProgramDaysView.module.css';

const shortDate = (value) => formatLiteralDate(value, { year: undefined });

function rangeText(start, end) {
    return start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`;
}

function countText(dates, completed) {
    if (!dates.length) return 'no dates for this day';
    const noun = dates.length === 1 ? 'date' : 'dates';
    return `${dates.length} ${noun}, ${completed} done`;
}

/**
 * One bucket: sized by its length in days, dimmed (but still focusable) when empty. Block
 * names are written in the block's colour.
 */
function Bucket({ label, title, ariaLabel, grow, color, selected, current, bucket, blockedDate, onSelect }) {
    const ref = useRef(null);
    const empty = !bucket.dates.length;
    useEffect(() => {
        if (selected) ref.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [selected]);
    return (
        <li style={{ flexGrow: grow }}>
            <button
                ref={ref}
                type="button"
                className={[styles.bucket, color ? styles.bucketColored : '', empty ? styles.bucketEmpty : '']
                    .filter(Boolean).join(' ')}
                style={color ? { '--bucket-color': color } : undefined}
                aria-pressed={selected}
                aria-disabled={empty || undefined}
                aria-label={ariaLabel}
                title={title}
                onClick={() => {
                    if (empty) return;
                    onSelect(pickBucketDate(bucket.dates, blockedDate));
                }}
            >
                <span className={styles.bucketLabel}>{label}</span>
                {current ? <span className={styles.bucketToday} aria-hidden="true" /> : null}
                {bucket.dates.length ? (
                    <span
                        className={styles.bucketProgress}
                        style={{ '--bucket-done': `${(bucket.completed / bucket.dates.length) * 100}%` }}
                        aria-hidden="true"
                    />
                ) : null}
            </button>
        </li>
    );
}

/**
 * Block and week buckets above a column's date rail. The scope follows the selected date;
 * picking a bucket jumps to the first date in its period, and the rail scrolls to it.
 */
export default function PlanBucketRows({ buckets, scope, dayName, today, blockedDate = null, label, onSelect }) {
    if (!buckets.blocks.length) return null;
    const contains = (start, end) => start <= today && today <= end;
    const shared = { blockedDate, onSelect };
    const { block } = scope;
    // One ruler: the block row sits directly on the week row, which takes the selected
    // block's colour as its edge.
    return (
        <div className={styles.buckets} style={block?.color ? { '--bucket-block': block.color } : undefined}>
            <div className={styles.bucketTrack}>
                <ul className={`${styles.bucketList} ${styles.blockList}`} role="group" aria-label={`${label}: blocks`}>
                    {buckets.blocks.map((item) => (
                        <Bucket
                            key={item.id}
                            {...shared}
                            bucket={item}
                            label={item.name}
                            grow={item.length}
                            color={item.color}
                            selected={block?.id === item.id}
                            current={contains(item.start, item.end)}
                            ariaLabel={`${item.name}, ${rangeText(item.start, item.end)}, ${countText(item.dates, item.completed)}`}
                            title={item.dates.length
                                ? `${item.name} · ${rangeText(item.start, item.end)} · ${item.completed} of ${item.dates.length} done`
                                : `No ${dayName} dates in ${item.name}`}
                        />
                    ))}
                    {buckets.outside ? (
                        <Bucket
                            {...shared}
                            bucket={buckets.outside}
                            label="Outside blocks"
                            grow={0}
                            selected={scope.outside}
                            current={false}
                            ariaLabel={`Outside blocks, ${countText(buckets.outside.dates, buckets.outside.completed)}`}
                            title={`${dayName} dates no block covers`}
                        />
                    ) : null}
                </ul>
                {block ? (
                    <ul className={`${styles.bucketList} ${styles.weekList}`} role="group" aria-label={`${label}: weeks of ${block.name}`}>
                        {block.weeks.map((week) => (
                            <Bucket
                                key={week.index}
                                {...shared}
                                bucket={week}
                                label={`W${week.index}`}
                                grow={week.length}
                                selected={scope.week?.index === week.index}
                                current={contains(week.start, week.end)}
                                ariaLabel={`Week ${week.index}, ${rangeText(week.start, week.end)}, ${countText(week.dates, week.completed)}`}
                                title={week.dates.length
                                    ? `Week ${week.index} · ${rangeText(week.start, week.end)} · ${week.completed} of ${week.dates.length} done`
                                    : `No ${dayName} dates in Week ${week.index}`}
                            />
                        ))}
                    </ul>
                ) : null}
            </div>
        </div>
    );
}
