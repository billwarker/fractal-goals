import React, { useState } from 'react';
import Modal from '../components/atoms/Modal';
import ModalBody from '../components/atoms/ModalBody';
import landingContent from '../content/landingContent';
import { publicApi } from '../utils/api';
import { getAppHref } from '../utils/marketingHost';
import styles from './DemoSignupModal.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// During the private beta, signing up means joining the waitlist. An invite key skips the
// wait: the app host's invite link prefills sign-up, logs in and opens the welcome flow.
export function inviteSignupHref(inviteKey, email, appHref = getAppHref()) {
    const params = new URLSearchParams({ invite_key: inviteKey.trim() });
    if (email.trim()) params.set('email', email.trim());
    return `${appHref}?${params.toString()}`;
}

export default function DemoSignupModal({ isOpen, onClose }) {
    const copy = landingContent.betaForm;
    const [mode, setMode] = useState('waitlist');
    const [email, setEmail] = useState('');
    const [goal, setGoal] = useState('');
    const [inviteKey, setInviteKey] = useState('');
    const [status, setStatus] = useState({ state: 'idle', message: '' });

    const emailValid = EMAIL_PATTERN.test(email.trim());

    const submitWaitlist = async (event) => {
        event.preventDefault();
        if (!emailValid) {
            setStatus({ state: 'error', message: copy.validationMessage });
            return;
        }
        setStatus({ state: 'submitting', message: '' });
        try {
            const trimmedGoal = goal.trim();
            const response = await publicApi.createBetaSignup({
                email: email.trim(),
                ...(trimmedGoal ? { use_case: trimmedGoal } : {}),
            });
            setStatus({
                state: 'success',
                message: response.data?.created ? copy.successCreatedMessage : copy.successUpdatedMessage,
            });
        } catch (error) {
            setStatus({ state: 'error', message: error.response?.data?.error || copy.errorMessage });
        }
    };

    const submitInvite = (event) => {
        event.preventDefault();
        if (!inviteKey.trim()) return;
        window.location.assign(inviteSignupHref(inviteKey, email));
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Build your own tree" size="sm" layer="top">
            <ModalBody>
                {mode === 'waitlist' ? (
                    status.state === 'success' ? (
                        <div className={styles.body}>
                            <p className={styles.success} role="status">{status.message}</p>
                            <button type="button" className={styles.primary} onClick={onClose}>Keep exploring</button>
                        </div>
                    ) : (
                        <form className={styles.body} onSubmit={submitWaitlist} noValidate>
                            <p className={styles.lead}>
                                Fractal Goals is in a private beta. Join the waitlist and we’ll email you an invite when a spot opens.
                            </p>
                            <label className={styles.field}>
                                <span>{copy.emailLabel}</span>
                                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                            </label>
                            <label className={styles.field}>
                                <span>{copy.goalLabel}</span>
                                <textarea
                                    value={goal}
                                    onChange={(event) => setGoal(event.target.value)}
                                    placeholder={copy.goalPlaceholder}
                                    rows={2}
                                    maxLength={280}
                                />
                            </label>
                            {status.state === 'error' && <p className={styles.error} role="alert">{status.message}</p>}
                            <button type="submit" className={styles.primary} disabled={status.state === 'submitting'}>
                                {status.state === 'submitting' ? copy.submittingLabel : copy.submitLabel}
                            </button>
                            <button type="button" className={styles.switch} onClick={() => setMode('invite')}>
                                Have an invite key?
                            </button>
                        </form>
                    )
                ) : (
                    <form className={styles.body} onSubmit={submitInvite}>
                        <p className={styles.lead}>Enter the key from your invite email to create your account.</p>
                        <label className={styles.field}>
                            <span>Invite key</span>
                            <input value={inviteKey} onChange={(event) => setInviteKey(event.target.value)} autoComplete="off" required />
                        </label>
                        <label className={styles.field}>
                            <span>{copy.emailLabel}</span>
                            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
                        </label>
                        <button type="submit" className={styles.primary} disabled={!inviteKey.trim()}>Create my account</button>
                        <button type="button" className={styles.switch} onClick={() => setMode('waitlist')}>
                            No key? Join the waitlist
                        </button>
                    </form>
                )}
            </ModalBody>
        </Modal>
    );
}
