import React from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../atoms/Modal';
import Button from '../atoms/Button';
import { useOptionalOnboarding } from '../../contexts/OnboardingContext';
import styles from './FirstSessionCelebration.module.css';

export default function FirstSessionCelebration() {
    const navigate = useNavigate();
    const onboarding = useOptionalOnboarding();
    const show = onboarding?.enabled && onboarding.state?.status === 'active'
        && onboarding.state?.steps?.first_session
        && !onboarding.state?.celebrated_first_session;
    if (!onboarding) return null;
    const acknowledge = async () => {
        await onboarding.update?.({ celebrated_first_session: true });
    };
    if (!show) return null;
    const handleClose = async () => {
        await acknowledge();
    };
    return <Modal isOpen onClose={handleClose} title="Evidence recorded" size="sm"><div className={styles.content}><p>Your first completed session now contributes evidence to your goal tree.</p><Button onClick={async () => { await handleClose(); navigate(`/${onboarding.rootId}/goals`, { state: { onboardingJustLit: true } }); }}>See your goal tree</Button><Button variant="ghost" onClick={handleClose}>Stay here</Button></div></Modal>;
}
