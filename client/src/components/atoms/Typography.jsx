import React from 'react';
import styles from './Typography.module.css';

export const Heading = ({
    level = 1,
    children,
    className = '',
    color = 'primary',
    ...props
}) => {
    const Tag = `h${Math.min(level, 6)}`;
    return (
        <Tag
            className={`${styles.heading} ${styles[`h${level}`]} ${styles[color]} ${className}`}
            {...props}
        >
            {children}
        </Tag>
    );
};

export const Text = ({
    children,
    size = 'md',
    color = 'primary',
    className = '',
    as = 'p',
    weight = 'normal',
    ...props
}) => {
    const Tag = as;
    return (
        <Tag
            className={`${styles.text} ${styles[size]} ${styles[color]} ${styles[weight]} ${className}`}
            {...props}
        >
            {children}
        </Tag>
    );
};
