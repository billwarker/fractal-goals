import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../content/legal/legalVersions';
import { authApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import { Text } from '../atoms/Typography';
import styles from './AuthModal.module.css';

/** Blocking review for accounts with missing or outdated legal acceptance. */
function LegalAcceptanceModal() {
    const { logout, setUser } = useAuth();
    const [accepted, setAccepted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!accepted || isSubmitting) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const response = await authApi.acceptLegalDocuments({
                accepted_terms: true,
                terms_version: TERMS_VERSION,
                privacy_version: PRIVACY_VERSION,
            });
            setUser(response.data);
            notify.success('Legal documents accepted.');
        } catch (err) {
            setError(formatError(err));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen
            onClose={() => {}}
            title="REVIEW REQUIRED"
            size="md"
            showCloseButton={false}
            closeOnEsc={false}
            closeOnBackdrop={false}
        >
            <form onSubmit={handleSubmit} className={styles.form}>
                <ModalBody>
                    <Text size="sm" color="muted" style={{ marginBottom: '12px' }}>
                        Review the current legal documents before continuing to use Fractal Goals.
                    </Text>
                    <label className={styles.consent}>
                        <span>
                            <input
                                type="checkbox"
                                checked={accepted}
                                onChange={(event) => setAccepted(event.target.checked)}
                            />
                            {' '}I am at least 16 and accept the{' '}
                            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
                            {' '}and{' '}
                            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                        </span>
                    </label>
                    {error && <div className={styles.errorMessage}>{error}</div>}
                </ModalBody>
                <ModalFooter>
                    <div className={styles.actions}>
                        <Button type="button" variant="secondary" onClick={logout} disabled={isSubmitting}>
                            Log Out
                        </Button>
                        <Button type="submit" disabled={!accepted || isSubmitting}>
                            {isSubmitting ? 'Saving...' : 'Accept and Continue'}
                        </Button>
                    </div>
                </ModalFooter>
            </form>
        </Modal>
    );
}

export default LegalAcceptanceModal;
