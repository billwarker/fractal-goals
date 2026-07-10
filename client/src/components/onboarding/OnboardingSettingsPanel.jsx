import React from 'react';
import Button from '../atoms/Button';

export default function OnboardingSettingsPanel({ onboarding }) {
    return <section><h3>Getting Started</h3><p>Resume the guided checklist or restart its presentation hints. Your real progress remains complete.</p><div><Button variant="secondary" onClick={onboarding.resume}>Show Getting Started checklist</Button><Button variant="ghost" onClick={onboarding.restart}>Restart guidance</Button></div></section>;
}
