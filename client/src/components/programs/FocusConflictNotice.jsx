import React from 'react';
import PropTypes from 'prop-types';

import Button from '../atoms/Button';
import { describeFocusConflicts } from '../../utils/programFocus';
import styles from './FocusConflictNotice.module.css';

/**
 * Lists the block or day goals a narrower focus would strand (a 409 from the server)
 * and saves again with pruning only when the user confirms.
 */
export default function FocusConflictNotice({ conflict, onConfirm, isSaving = false }) {
    if (!conflict) return null;
    const hidden = conflict.conflictCount - conflict.conflicts.length;
    return (
        <div className={styles.notice} role="alert">
            <p>{conflict.message}</p>
            <ul>
                {describeFocusConflicts(conflict.conflicts).map((line) => <li key={line}>{line}</li>)}
            </ul>
            {hidden > 0 ? <p>and {hidden} more</p> : null}
            <Button variant="danger" size="sm" onClick={onConfirm} isLoading={isSaving}>
                Remove these goals and save
            </Button>
        </div>
    );
}

FocusConflictNotice.propTypes = {
    conflict: PropTypes.shape({
        message: PropTypes.string,
        conflicts: PropTypes.array,
        conflictCount: PropTypes.number,
    }),
    onConfirm: PropTypes.func.isRequired,
    isSaving: PropTypes.bool,
};
