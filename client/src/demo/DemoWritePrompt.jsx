import React, { useEffect, useState } from 'react';
import Modal from '../components/atoms/Modal';
import ModalBody from '../components/atoms/ModalBody';
import { DEMO_WRITE_BLOCKED_EVENT } from './demoMode';
import styles from './DemoSignupModal.module.css';

// Shown when the visitor tries to save something. One prompt per burst: a single click
// can fire several writes, and a second prompt right after closing would feel broken.
const REPEAT_GAP_MS = 1500;

export default function DemoWritePrompt({ onSignup }) {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        let closedAt = 0;
        const handleBlocked = () => {
            setIsOpen((open) => open || Date.now() - closedAt > REPEAT_GAP_MS);
        };
        const markClosed = () => {
            closedAt = Date.now();
        };
        window.addEventListener(DEMO_WRITE_BLOCKED_EVENT, handleBlocked);
        window.addEventListener('demo:write_prompt_closed', markClosed);
        return () => {
            window.removeEventListener(DEMO_WRITE_BLOCKED_EVENT, handleBlocked);
            window.removeEventListener('demo:write_prompt_closed', markClosed);
        };
    }, []);

    const close = () => {
        setIsOpen(false);
        window.dispatchEvent(new Event('demo:write_prompt_closed'));
    };

    return (
        <Modal isOpen={isOpen} onClose={close} title="This is a live demo" size="sm" layer="top" stackLevel={1}>
            <ModalBody>
                <div className={styles.body}>
                    <p className={styles.lead}>
                        Everything here works, but changes aren’t saved. Sign up to build your own tree.
                    </p>
                    <button
                        type="button"
                        className={styles.primary}
                        onClick={() => {
                            close();
                            onSignup();
                        }}
                    >
                        Sign up
                    </button>
                    <button type="button" className={styles.switch} onClick={close}>Keep exploring</button>
                </div>
            </ModalBody>
        </Modal>
    );
}
