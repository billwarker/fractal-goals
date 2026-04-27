import React from 'react';
import styles from './SidePaneHeaderButton.module.css';

function SidePaneHeaderButton({
    children,
    variant = 'secondary',
    className = '',
    type = 'button',
    ...props
}) {
    const variantClass = variant === 'reset' ? styles.reset : styles.secondary;

    return (
        <button
            type={type}
            className={`${styles.button} ${variantClass} ${className}`.trim()}
            {...props}
        >
            {children}
        </button>
    );
}

export default SidePaneHeaderButton;
