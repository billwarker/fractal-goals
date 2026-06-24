import React from 'react';
import styles from './DeleteButton.module.css';

/**
 * DeleteButton — the shared "muted grey button that highlights red on hover"
 * delete affordance used on cards (activities, session templates) and modals.
 *
 * Defaults to the label "Delete"; pass `children` to override.
 */
function DeleteButton({ children = 'Delete', className = '', type = 'button', ...props }) {
    return (
        <button
            type={type}
            className={`${styles.deleteButton} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}

export default DeleteButton;
