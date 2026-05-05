import React from 'react';

import CloseIcon from '../atoms/CloseIcon';
import styles from './CardCornerActionButton.module.css';

function CardCornerActionButton({
    label,
    title,
    onClick,
    className = '',
    children = <CloseIcon size={14} />,
}) {
    return (
        <button
            type="button"
            className={`${styles.button} ${className}`.trim()}
            onClick={onClick}
            aria-label={label}
            title={title || label}
        >
            <span className={styles.icon}>{children}</span>
        </button>
    );
}

export default CardCornerActionButton;
