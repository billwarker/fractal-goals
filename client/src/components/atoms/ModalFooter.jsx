import React from 'react';
import styles from './Modal.module.css';

/**
 * Standardized ModalFooter Component
 * Provides consistent padding and alignment for action buttons.
 */
const ModalFooter = ({ children, className = '', align = 'right' }) => {
    return (
        <div className={`${styles.footerWrapper} ${styles[`align-${align}`]} ${className}`}>
            {children}
        </div>
    );
};

export default ModalFooter;
