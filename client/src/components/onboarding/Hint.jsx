import React from 'react';
import Button from '../atoms/Button';
import { useOptionalOnboarding } from '../../contexts/OnboardingContext';
import styles from './Hint.module.css';

export default function Hint({ id, children, title, description }) {
    const onboarding = useOptionalOnboarding();
    return <div className={styles.anchor}>{children}{onboarding?.isHintVisible(id) && <div className={styles.hint} role="note"><strong>{title}</strong><p>{description}</p><Button variant="ghost" size="sm" onClick={() => onboarding.dismissHint(id)}>Got it</Button></div>}</div>;
}
