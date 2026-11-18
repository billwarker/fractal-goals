import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useGuardedLogout } from '../../offline/OutboxContext';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../content/legal/legalVersions';
import { authApi } from '../../utils/api';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import Checkbox from '../atoms/Checkbox';
import styles from './LegalAcceptanceModal.module.css';

/** Blocking review for accounts with missing or outdated legal acceptance. */
function LegalAcceptanceModal() {
    const { setUser } = useAuth();
    const logout = useGuardedLogout();
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
            title="Review Our Updated Terms"
            size="md"
            showCloseButton={false}
            closeOnEsc={false}
            closeOnBackdrop={false}
        >
            <form onSubmit={handleSubmit} className={styles.form}>
                <ModalBody>
                    <div className={styles.content}>
                        <p className={styles.intro}>
                            We have updated our Terms of Service and Privacy Policy. Please review
                            and accept them to keep using Fractal Goals.
                        </p>
                        <Checkbox
                            checked={accepted}
                            onChange={(event) => setAccepted(event.target.checked)}
                            className={styles.consent}
                            label={(
                                <span>
                                    I am 16 or older and I agree to the{' '}
                                    <a
                                        href="/terms"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        Terms of Service
                                    </a>
                                    {' '}and{' '}
                                    <a
                                        href="/privacy"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        Privacy Policy
                                    </a>.
                                </span>
                            )}
                        />
                        {error && <div className={styles.errorMessage} role="alert">{error}</div>}
                    </div>
                </ModalBody>
                <ModalFooter>
                    <Button type="button" variant="secondary" onClick={logout} disabled={isSubmitting}>
                        Log Out
                    </Button>
                    <Button type="submit" disabled={!accepted || isSubmitting}>
                        {isSubmitting ? 'Saving...' : 'Accept and Continue'}
                    </Button>
                </ModalFooter>
            </form>
        </Modal>
    );
}

export default LegalAcceptanceModal;
