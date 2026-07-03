import React from 'react';

import Spinner from '../atoms/Spinner';
import styles from './LoadingState.module.css';

function LoadingState({ label = 'Loading...', className = '', showSpinner = true }) {
    return (
        <div className={`${styles.loadingState} ${className}`.trim()}>
            {showSpinner && <Spinner size="md" label={label} />}
            <span>{label}</span>
        </div>
    );
}

export default LoadingState;
