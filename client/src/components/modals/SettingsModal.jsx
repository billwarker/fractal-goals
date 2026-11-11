import React, { useRef, useState } from 'react';

import { useGoals } from '../../contexts/GoalsContext';
import { useOptionalOnboarding } from '../../contexts/OnboardingContext';
import { FEATURE_FLAGS, isFeatureEnabled, useFeatureFlags } from '../../hooks/useFeatureFlags';
import useIsMobile from '../../hooks/useIsMobile';
import AgentConnectionsPanel from '../agent/AgentConnectionsPanel';
import ChevronIcon from '../atoms/ChevronIcon';
import Modal from '../atoms/Modal';
import GoalCharacteristicsSettings from '../GoalCharacteristicsSettings';
import OnboardingSettingsPanel from '../onboarding/OnboardingSettingsPanel';
import AccountSettings from '../settings/AccountSettings';
import GeneralSettings from '../settings/GeneralSettings';
import SettingsSection from '../settings/SettingsSection';
import { useVisibleSettingsSections } from '../settings/settingsSections';
import StorageConnectionsPanel from '../settings/StorageConnectionsPanel';
import styles from './SettingsModal.module.css';

const PANEL_ID = 'settings-panel';
const tabId = (id) => `settings-tab-${id}`;

function SectionContent({ id }) {
    const { activeRootId } = useGoals();
    const onboarding = useOptionalOnboarding();
    const { flags } = useFeatureFlags();

    switch (id) {
        case 'styling':
            return (
                <SettingsSection
                    title={activeRootId ? 'Goal characteristics for this fractal' : 'Default goal characteristics'}
                    description="Shape, colours and rules for each level. Changes here are saved for your account only."
                >
                    <GoalCharacteristicsSettings scope={activeRootId || 'default'} />
                </SettingsSection>
            );
        case 'account':
            return <AccountSettings />;
        case 'ai-connections':
            return <AgentConnectionsPanel enabled={isFeatureEnabled(flags, FEATURE_FLAGS.aiAgentConnectors)} />;
        case 'storage':
            return <StorageConnectionsPanel />;
        case 'getting-started':
            return onboarding ? <OnboardingSettingsPanel onboarding={onboarding} /> : null;
        default:
            return <GeneralSettings />;
    }
}

function LegalLinks() {
    return (
        <div className={styles.legal}>
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
        </div>
    );
}

/** Desktop: a vertical tablist (arrow keys move and select) beside the open section. */
function SettingsTabs({ sections, activeId, onSelect }) {
    const tabRefs = useRef(new Map());

    const handleKeyDown = (event) => {
        const index = sections.findIndex(({ id }) => id === activeId);
        const moves = {
            ArrowDown: index + 1,
            ArrowRight: index + 1,
            ArrowUp: index - 1,
            ArrowLeft: index - 1,
            Home: 0,
            End: sections.length - 1,
        };
        if (!(event.key in moves)) return;
        event.preventDefault();
        const next = sections[(moves[event.key] + sections.length) % sections.length];
        onSelect(next.id);
        tabRefs.current.get(next.id)?.focus();
    };

    return (
        <div className={styles.sidebar}>
            <div
                role="tablist"
                aria-label="Settings sections"
                aria-orientation="vertical"
                className={styles.tabs}
                onKeyDown={handleKeyDown}
            >
                {sections.map(({ id, label }) => (
                    <button
                        key={id}
                        ref={(element) => {
                            if (element) tabRefs.current.set(id, element);
                            else tabRefs.current.delete(id);
                        }}
                        type="button"
                        role="tab"
                        id={tabId(id)}
                        aria-selected={id === activeId}
                        aria-controls={PANEL_ID}
                        tabIndex={id === activeId ? 0 : -1}
                        className={styles.tab}
                        onClick={() => onSelect(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <LegalLinks />
        </div>
    );
}

/** Phones: a list of sections; opening one replaces the list, with a way back. */
function MobileSettings({ sections, openId, onOpen }) {
    const open = sections.find(({ id }) => id === openId);
    if (!open) {
        return (
            <nav aria-label="Settings sections" className={styles.mobileList}>
                <ul>
                    {sections.map(({ id, label, summary }) => (
                        <li key={id}>
                            <button type="button" className={styles.mobileItem} onClick={() => onOpen(id)}>
                                <span>
                                    <span className={styles.mobileItemLabel}>{label}</span>
                                    <span className={styles.mobileItemSummary}>{summary}</span>
                                </span>
                                <ChevronIcon direction="right" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
                <LegalLinks />
            </nav>
        );
    }
    return (
        <div className={styles.mobileSection}>
            <div className={styles.mobileSectionHeader}>
                <button type="button" className={styles.back} onClick={() => onOpen(null)}>
                    <ChevronIcon direction="left" aria-hidden="true" />
                    All settings
                </button>
                <h3 className={styles.mobileSectionTitle}>{open.label}</h3>
            </div>
            <div className={styles.content}>
                <SectionContent id={open.id} />
            </div>
        </div>
    );
}

const SettingsModalInner = ({ onClose, initialTab }) => {
    const isMobile = useIsMobile();
    const sections = useVisibleSettingsSections();
    // The requested section is kept even while hidden, so a deep link to a section behind a
    // feature flag opens once the flags arrive.
    const [requested, setRequested] = useState(initialTab || null);
    const visible = sections.some(({ id }) => id === requested);
    const activeId = visible ? requested : 'general';

    return (
        <Modal isOpen onClose={onClose} title="Settings" size="lg" className={styles.modalShell}>
            {isMobile ? (
                <MobileSettings sections={sections} openId={visible ? requested : null} onOpen={setRequested} />
            ) : (
                <div className={styles.body}>
                    <SettingsTabs sections={sections} activeId={activeId} onSelect={setRequested} />
                    <div
                        role="tabpanel"
                        id={PANEL_ID}
                        aria-labelledby={tabId(activeId)}
                        tabIndex={0}
                        className={styles.content}
                    >
                        <SectionContent id={activeId} />
                    </div>
                </div>
            )}
        </Modal>
    );
};

const SettingsModal = ({ isOpen, onClose, initialTab = null }) => {
    if (!isOpen) {
        return null;
    }

    return <SettingsModalInner onClose={onClose} initialTab={initialTab} />;
};

export default SettingsModal;
