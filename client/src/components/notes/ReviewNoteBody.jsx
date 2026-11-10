import React from 'react';

import { REVIEW_PROMPTS, REVIEW_STATUSES } from '../../utils/goalReview';
import styles from './ReviewNoteBody.module.css';

/** A review's status ("On track"), or nothing when it has none. */
export function ReviewStatusBadge({ status: value }) {
    const status = REVIEW_STATUSES.find((option) => option.value === value);
    return status ? <span className={styles.status} data-status={status.value}>{status.label}</span> : null;
}

/** A guided goal review: its status (unless the host shows it) and the answers it has, never the derived text. */
export default function ReviewNoteBody({ review, showStatus = true }) {
    const answers = REVIEW_PROMPTS.filter((prompt) => review?.[prompt.key]?.trim());
    return (
        <div className={styles.review}>
            {showStatus ? <ReviewStatusBadge status={review?.status} /> : null}
            {answers.length ? (
                <dl className={styles.answers}>
                    {answers.map((prompt) => (
                        <div key={prompt.key}>
                            <dt>{prompt.heading}</dt>
                            <dd>{review[prompt.key]}</dd>
                        </div>
                    ))}
                </dl>
            ) : null}
        </div>
    );
}
