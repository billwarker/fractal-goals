import React from 'react';
import styles from './Card.module.css';

/**
 * Standardized Card Component
 */
const Card = ({
    children,
    className = '',
    padding = 'md',
    hoverable = false,
    ...props
}) => {
    return (
        <div
            className={`
                ${styles.card} 
                ${styles[`padding-${padding}`]} 
                ${hoverable ? styles.hoverable : ''} 
                ${className}
            `}
            {...props}
        >
            {children}
        </div>
    );
};

export default Card;
