import { useOptionalOnboarding } from '../../contexts/OnboardingContext';
import Button from '../atoms/Button';
import styles from '../GoalDetailModal.module.css';

export default function SmartBadgeOnboardingTooltip({ visible }) {
    const onboarding = useOptionalOnboarding();
    if (!visible || !onboarding?.isHintVisible('smart_badge')) return null;

    return (
        <aside
            className={styles.smartOnboardingTooltip}
            role="note"
            aria-label="SMART goal guidance"
            onClick={(event) => event.stopPropagation()}
        >
            <strong>Build a SMART goal</strong>
            <p>The badge in the header updates as your goal becomes specific, measurable, achievable, relevant, and time-bound.</p>
            <Button variant="ghost" size="sm" onClick={() => onboarding.dismissHint('smart_badge')}>Got it</Button>
        </aside>
    );
}
