import React from 'react';
import { createPortal } from 'react-dom';
import HeaderButton from './HeaderButton';
import styles from './MobilePageFooter.module.css';

function MobilePageFooter({ ariaLabel, label, expanded, onToggle }) {
    return createPortal(
        <footer className={styles.footer} aria-label={ariaLabel}>
            <HeaderButton
                variant="secondary"
                className={styles.button}
                aria-expanded={expanded}
                onClick={onToggle}
            >
                {label}
            </HeaderButton>
        </footer>,
        document.body,
    );
}

export default MobilePageFooter;
