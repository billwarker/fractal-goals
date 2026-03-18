import React from 'react';

import styles from './SelectableCard.module.css';

function SelectableCard({
    children,
    isSelected = false,
    onClick,
    className = '',
    centered = false,
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                styles.card,
                isSelected ? styles.selected : '',
                centered ? styles.centered : '',
                className,
            ].filter(Boolean).join(' ')}
        >
            {children}
        </button>
    );
}

export default SelectableCard;
