import React from 'react';
import CloseIcon from './CloseIcon';
import styles from './CloseButton.module.css';

/**
 * CloseButton — shared modal/dialog close affordance. A muted X that highlights
 * red on hover. Use wherever a modal needs a dismiss control.
 */
function CloseButton({ size = 18, className = '', type = 'button', ...props }) {
    return (
        <button
            type={type}
            className={`${styles.closeButton} ${className}`}
            aria-label="Close"
            {...props}
        >
            <CloseIcon size={size} />
        </button>
    );
}

export default CloseButton;
