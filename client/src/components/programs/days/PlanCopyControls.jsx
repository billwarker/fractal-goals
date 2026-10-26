import React from 'react';

import Button from '../../atoms/Button';
import { formatCopyDate } from '../../../utils/planCopy';
import styles from './ProgramDaysView.module.css';

/**
 * "Copy from <date>" for a plan card, its arrow pointing at the column copied from
 * (`fromSide`); disabled with its reason when copy isn't possible. After a copy (`copied`,
 * until it is saved or discarded) it reads "Copied from <date>", and says what it couldn't
 * copy; it still copies again.
 */
export function PlanCopyButton({
    copyState,
    date,
    reasonId,
    disabled = false,
    fromSide = 'left',
    copied = null,
    onCopy,
}) {
    if (!copyState) return null;
    const verb = copied ? 'Copied from' : 'Copy from';
    const label = fromSide === 'left' ? `← ${verb} ${formatCopyDate(date)}` : `${verb} ${formatCopyDate(date)} →`;
    const skipped = copied?.skipped || [];
    const skippedLines = skipped.map((skip) => `${skip.name} wasn't copied: ${skip.reason}.`);
    const title = copied
        ? ['Copied. Review, then Save.', ...skippedLines].join('\n')
        : copyState.reason || undefined;
    return (
        <span className={styles.planCopy}>
            <Button
                size="sm"
                variant="secondary"
                className={copied ? styles.planCopyDone : undefined}
                onClick={onCopy}
                disabled={!copyState.allowed || disabled}
                title={title}
                aria-describedby={copyState.reason ? reasonId : undefined}
            >
                {label}
                {skipped.length ? (
                    <>
                        {' · '}
                        <span className={styles.planCopySkipped}>{skipped.length} not copied</span>
                    </>
                ) : null}
            </Button>
            {copyState.reason ? <span id={reasonId} className={styles.visuallyHidden}>{copyState.reason}</span> : null}
            <span className={styles.visuallyHidden} role="status">
                {copied ? [`Copied from ${copied.fromDate}. Review, then Save.`, ...skippedLines].join(' ') : ''}
            </span>
        </span>
    );
}
