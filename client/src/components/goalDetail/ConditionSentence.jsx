import React from 'react';

import { describeConditionParts, describeTagMatch } from '../../utils/goalConditionText';
import ActivityTagBadges from '../common/ActivityTagBadges';
import styles from './ConditionSentence.module.css';

/**
 * A threshold in words ("Front Lever: at least 1 set of Hold Time ≥ 5 Seconds within one session"),
 * with its required tags as badges. `preview` is the threshold builder's accent box; `inline` is
 * plain text for reading a goal.
 */
export default function ConditionSentence({ condition, activity = null, variant = 'inline', ...rest }) {
    if (!condition) return null;
    const [before, after] = describeConditionParts(condition, activity);
    const tags = Array.isArray(condition.tags) ? condition.tags : [];
    return (
        <p className={variant === 'preview' ? styles.preview : styles.inline} {...rest}>
            {before}
            {tags.length ? (
                <>
                    {` ${describeTagMatch(condition)} `}
                    <ActivityTagBadges tags={tags} className={styles.tags} ariaLabel="Required tags" />
                </>
            ) : null}
            {after}
        </p>
    );
}
