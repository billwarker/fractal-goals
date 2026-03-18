import React from 'react';

import styles from './LoadingState.module.css';

function LoadingState({ label = 'Loading...', className = '' }) {
    return (
        <div className={`${styles.loadingState} ${className}`.trim()}>
            {label}
        </div>
    );
}

export default LoadingState;
