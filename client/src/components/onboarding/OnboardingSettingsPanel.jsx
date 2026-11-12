import React from 'react';
import Button from '../atoms/Button';
import SettingsSection from '../settings/SettingsSection';
import styles from './OnboardingSettingsPanel.module.css';

export default function OnboardingSettingsPanel({ onboarding }) {
    return (
        <SettingsSection
            title="Getting started"
            description="Resume or restart the guided checklist. Steps you have already done stay complete."
        >
            <div className={styles.actions}>
                <Button variant="secondary" size="sm" onClick={onboarding.resume}>Show the checklist</Button>
                <Button variant="ghost" size="sm" onClick={onboarding.restart}>Restart guidance</Button>
            </div>
        </SettingsSection>
    );
}
