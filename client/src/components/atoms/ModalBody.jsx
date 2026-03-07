import React from 'react';
import styles from './Modal.module.css';

/**
 * Standardized ModalBody Component
 * Provides consistent padding and scrolling for the main content area of a Modal.
 */
const ModalBody = ({ children, className = '', noPadding = false }) => {
    return (
        <div className={`${styles.bodyWrapper} ${noPadding ? styles.noPadding : ''} ${className}`}>
            {children}
        </div>
    );
};

export default ModalBody;
