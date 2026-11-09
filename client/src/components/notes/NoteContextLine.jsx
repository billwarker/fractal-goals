import React from 'react';
import { Link } from 'react-router-dom';

import { formatSetMetrics, noteContextLink } from '../../utils/noteContext';
import styles from './NoteContextLine.module.css';

/** The values recorded on the note's activity instance, the noted set marked, and the plan's note. */
function ActivityValues({ note }) {
    const sets = note.instance_sets || [];
    return (
        <div className={styles.instance}>
            {sets.length ? (
                <ol className={styles.sets} aria-label={`${note.activity_definition_name || 'Activity'} sets`}>
                    {sets.map((set, index) => (
                        <li key={set.id} aria-current={set.id === note.activity_set_id ? 'true' : undefined}>
                            <span className={styles.setLabel}>Set {index + 1}</span>
                            <span>{formatSetMetrics(set.metrics) || '—'}</span>
                        </li>
                    ))}
                </ol>
            ) : (
                <p className={styles.values}>{formatSetMetrics(note.instance_metrics)}</p>
            )}
            {note.instance_plan_note ? <p className={styles.muted}>Plan: {note.instance_plan_note}</p> : null}
        </div>
    );
}

/**
 * Feed context under a note: the activity's recorded values whenever there are any, a goal note's path,
 * and a link to where it was written. In an activity group (`grouped`) the header shows the activity, so a
 * note keeps only its set's values; inside a session group (`hideLink`) the header carries the session link.
 */
export default function NoteContextLine({ note, grouped = false, hideLink = false }) {
    const rootId = note.root_id;
    const link = rootId && !grouped && !hideLink ? noteContextLink(note, rootId) : null;
    const hasValues = Boolean(note.instance_sets?.length || note.instance_metrics?.length);
    const showActivity = hasValues && !grouped;
    const setValues = grouped ? formatSetMetrics(note.set_metrics) : '';
    const goalPath = note.context_type === 'goal' && note.goal_path?.length ? note.goal_path.join(' › ') : '';
    if (!link && !setValues && !goalPath && !showActivity) return null;
    return (
        <div className={styles.context} onClick={(event) => event.stopPropagation()}>
            {link || setValues || goalPath ? (
                <div className={styles.line}>
                    {goalPath ? <span className={styles.muted}>{goalPath}</span> : null}
                    {setValues ? <span className={styles.values}>{setValues}</span> : null}
                    {link ? <Link className={styles.action} to={link.to}>{link.label}</Link> : null}
                </div>
            ) : null}
            {showActivity ? <ActivityValues note={note} /> : null}
        </div>
    );
}
