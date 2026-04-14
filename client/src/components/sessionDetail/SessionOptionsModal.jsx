import React, { useEffect, useState } from 'react';

import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import { Heading, Text } from '../atoms/Typography';
import styles from './SessionOptionsModal.module.css';

function SessionOptionsModal({
    isOpen,
    onClose,
    sessionName,
    onCreateTemplate,
    onDuplicateSession,
    isSavingTemplate = false,
    isDuplicatingSession = false,
}) {
    const [showTemplateInput, setShowTemplateInput] = useState(false);
    const [templateName, setTemplateName] = useState(sessionName || '');

    useEffect(() => {
        if (!isOpen) {
            setShowTemplateInput(false);
            return;
        }
        setTemplateName(sessionName || '');
    }, [isOpen, sessionName]);

    const handleTemplateSave = async () => {
        const trimmed = templateName.trim();
        if (!trimmed) return;
        await onCreateTemplate(trimmed);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Session Options" size="md">
            <ModalBody>
                <div className={styles.content}>
                    <div className={styles.optionCard}>
                        <div className={styles.optionHeader}>
                            <div className={styles.optionCopy}>
                                <Heading level={4} className={styles.optionTitle}>Save as Template</Heading>
                                <Text as="p" size="sm" className={styles.optionDescription}>
                                    Create a reusable template from this session&apos;s current activity structure.
                                </Text>
                            </div>
                            <Button
                                variant="secondary"
                                onClick={() => setShowTemplateInput((current) => !current)}
                                disabled={isSavingTemplate || isDuplicatingSession}
                            >
                                {showTemplateInput ? 'Hide' : 'Save as Template'}
                            </Button>
                        </div>

                        {showTemplateInput && (
                            <div className={styles.inlineForm}>
                                <Input
                                    label="Template Name"
                                    value={templateName}
                                    onChange={(event) => setTemplateName(event.target.value)}
                                    placeholder="Template name"
                                    fullWidth
                                    autoFocus
                                />
                                <div className={styles.inlineActions}>
                                    <Button
                                        variant="ghost"
                                        onClick={() => {
                                            setShowTemplateInput(false);
                                            setTemplateName(sessionName || '');
                                        }}
                                        disabled={isSavingTemplate}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleTemplateSave}
                                        isLoading={isSavingTemplate}
                                        disabled={!templateName.trim() || isDuplicatingSession}
                                    >
                                        Create Template
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={styles.optionCard}>
                        <div className={styles.optionHeader}>
                            <div className={styles.optionCopy}>
                                <Heading level={4} className={styles.optionTitle}>Duplicate Session</Heading>
                                <Text as="p" size="sm" className={styles.optionDescription}>
                                    Clone this session into a new active session with the same sections and activities.
                                </Text>
                            </div>
                            <Button
                                onClick={onDuplicateSession}
                                isLoading={isDuplicatingSession}
                                disabled={isSavingTemplate}
                            >
                                Duplicate Session
                            </Button>
                        </div>
                    </div>
                </div>
            </ModalBody>
        </Modal>
    );
}

export default SessionOptionsModal;
