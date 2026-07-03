import React from 'react';

import Button from './Button';
import styles from './DeleteButton.module.css';

/**
 * DeleteButton — the shared "muted grey button that highlights red on hover"
 * delete affordance used on cards (activities, session templates) and modals.
 *
 * Defaults to the label "Delete"; pass `children` to override.
 */
function DeleteButton({ children = 'Delete', className = '', type = 'button', ...props }) {
    return (
        <Button
            type={type}
            variant="secondary"
            size="sm"
            className={`${styles.deleteButton} ${className}`.trim()}
            {...props}
        >
            {children}
        </Button>
    );
}

export default DeleteButton;
