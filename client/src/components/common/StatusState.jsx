import React from 'react';
import Button from '../atoms/Button';
import styles from './StatusState.module.css';

function StatusState({ title, description, actionLabel, onAction }) {
    return (
        <div className={styles.statusState}>
            {title ? <h2 className={styles.title}>{title}</h2> : null}
            {description ? <p className={styles.description}>{description}</p> : null}
            {actionLabel && onAction ? (
                <Button className={styles.action} onClick={onAction} variant="primary">
                    {actionLabel}
                </Button>
            ) : null}
        </div>
    );
}

export default StatusState;
