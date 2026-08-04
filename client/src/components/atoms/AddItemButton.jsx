import React from 'react';

import styles from './AddItemButton.module.css';


/**
 * Full-width collection action used to append an item to a session container.
 */
export default function AddItemButton({
    children,
    className = '',
    type = 'button',
    ...props
}) {
    return (
        <button
            type={type}
            className={`${styles.button} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
