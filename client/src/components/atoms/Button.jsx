import React from 'react';
import styles from './Button.module.css';

/**
 * Standardized Button Component
 * 
 * variants: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
 * sizes: 'sm' | 'md' | 'lg'
 */
const Button = ({
    children,
    variant = 'primary',
    size = 'md',
    className = '',
    disabled = false,
    isLoading = false,
    leftIcon,
    rightIcon,
    ...props
}) => {
    const variantClass = styles[variant] || styles.primary;
    const sizeClass = styles[size] || styles.md;

    return (
        <button
            className={`${styles.button} ${variantClass} ${sizeClass} ${className}`}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && <span className={styles.loader}></span>}
            {!isLoading && leftIcon && <span className={styles.iconLeft}>{leftIcon}</span>}
            {children}
            {!isLoading && rightIcon && <span className={styles.iconRight}>{rightIcon}</span>}
        </button>
    );
};

export default Button;
