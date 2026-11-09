import React from 'react';

import { REVIEW_PROMPTS, REVIEW_STATUSES } from '../../utils/goalReview';
import styles from './ReviewNoteBody.module.css';

/** A guided goal review: its status and the answers it has, never the derived text. */
export default function ReviewNoteBody({ review }) {
    const status = REVIEW_STATUSES.find((option) => option.value === review?.status);
    const answers = REVIEW_PROMPTS.filter((prompt) => review?.[prompt.key]?.trim());
    return (
        <div className={styles.review}>
            {status ? <span className={styles.status} data-status={status.value}>{status.label}</span> : null}
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
