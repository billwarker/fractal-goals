import React from 'react';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../common/EmptyState';
import { useOptionalOnboarding } from '../../contexts/OnboardingContext';
import styles from '../../pages/Analytics.module.css';

export default function AnalyticsOnboardingState({ rootId }) {
    const navigate = useNavigate();
    const onboarding = useOptionalOnboarding();
    if (!onboarding?.enabled || onboarding.state?.status !== 'active' || onboarding.state?.steps?.first_session) return null;
    return <EmptyState compact className={styles.onboardingEmptyState} title="Your sessions become charts here" description="Complete a first session to create evidence. Analytics will then help you compare effort and progress over time." actionLabel="Run your first session" onAction={() => navigate(`/${rootId}/create-session`)} />;
}
