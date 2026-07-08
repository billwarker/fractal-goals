import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Input from '../atoms/Input';
import Button from '../atoms/Button';
import Checkbox from '../atoms/Checkbox';
import { Heading, Text } from '../atoms/Typography';
import { useForm } from '../../hooks/useForm';
import { authApi } from '../../utils/api';
import styles from './AuthModal.module.css';
import '../../App.css';
import notify from '../../utils/notify';
import { logError } from '../../utils/logger';

/**
 * AuthModal - Refactored to match exactly the application modal standards
 * (Reference: GoalDetailModal style)
 */
function AuthModalInner({ onClose }) {
    const { login, signup, isAuthenticated } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [generalError, setGeneralError] = useState(null);
    const [isForgotSubmitting, setForgotSubmitting] = useState(false);

    // Theme color (For consistent highlighting)
    const themeColor = 'var(--color-text-primary)';

    const validate = (values) => {
        const errors = {};
        if (isLogin) {
            if (!values.usernameOrEmail) errors.usernameOrEmail = "Required";
        } else {
            if (!values.username) errors.username = "Required";
            if (!values.email) errors.email = "Required";
            if (!values.inviteKey) errors.inviteKey = "Required";
            if (!values.password) errors.password = "Required";
            else if (values.password.length < 8) errors.password = "Must be at least 8 characters";
        }
        if (isLogin && !values.password) errors.password = "Required";
        return errors;
    };

    const {
        values,
        errors,
        touched,
        handleChange,
        handleBlur,
        handleSubmit,
        isSubmitting,
        resetForm,
        setFieldValue,
    } = useForm({
        username: '',
        email: '',
        password: '',
        inviteKey: '',
        usernameOrEmail: '',
        rememberMe: false
    }, validate);

    useEffect(() => {
        if (isAuthenticated) {
            onClose();
        }
    }, [isAuthenticated, onClose]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const inviteKey = params.get('invite_key');
        const inviteEmail = params.get('email');
        if (inviteKey) {
            setIsLogin(false);
            setFieldValue('inviteKey', inviteKey);
            if (inviteEmail) {
                setFieldValue('email', inviteEmail);
            }
        }
        // Run only when the modal opens so invite links can prefill signup once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onSubmit = async (formValues) => {
        setGeneralError(null);
        try {
            if (isLogin) {
                await login(formValues.usernameOrEmail, formValues.password, { rememberMe: formValues.rememberMe });
                onClose();
            } else {
                await signup(formValues.username, formValues.email, formValues.password, formValues.inviteKey);
                setIsLogin(true);
                setGeneralError(null);
                notify.success("Account created! Please log in.");
                resetForm();
                setFieldValue('usernameOrEmail', formValues.username);
            }
        } catch (err) {
            logError("Auth error:", err);
            let errorMessage = "An error occurred";

            // Check for network errors (no response from server)
            if (err.code === 'ECONNABORTED') {
                errorMessage = "The server took too long to respond. Please try again in a moment.";
            } else if (!err.response) {
                errorMessage = "Network Error: Unable to reach the server. Please check your connection.";
            }
            // Check for server-side structure errors (500s)
            else if (err.response.status >= 500) {
                // Try to show specific error if available, otherwise generic
                errorMessage = err.response.data?.error || "Server Error: Something went wrong. Please try again later.";
            }
            // Check for API-specific validation details
            else if (err.response?.data?.details) {
                const details = err.response.data.details;
                if (Array.isArray(details)) {
                    errorMessage = details.map(d => `${d.field}: ${d.message}`).join(", ");
                } else {
                    errorMessage = err.response.data.error || JSON.stringify(details);
                }
            } else {
                errorMessage = err.response?.data?.error || err.message || "An error occurred";
            }
            setGeneralError(errorMessage);
        }
    };

    const handleToggleMode = () => {
        setIsLogin(!isLogin);
        setGeneralError(null);
        // We probably want to clear errors when switching modes
        // useForm doesn't expose clean 'clearErrors' but validation runs on next action.
        // Or we can resetForm?
        // resetForm(); // This might be annoying if user typed stuff.
        // Let's leave values, validation will re-run on next submit/touch.
    };

    const handleForgotPassword = async () => {
        setGeneralError(null);
        const email = values.usernameOrEmail.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setGeneralError('Enter your email address above first.');
            return;
        }
        setForgotSubmitting(true);
        try {
            await authApi.forgotPassword({ email });
            notify.success('If that email belongs to an active account, a reset link has been sent.');
        } catch (err) {
            logError("Forgot password error:", err);
            setGeneralError('Could not request a password reset. Please try again.');
        } finally {
            setForgotSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={isLogin ? 'WELCOME BACK' : 'CREATE AN ACCOUNT'}
            size="md"
        >
            <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
                <ModalBody>
                    {isLogin ? (
                        <div className={styles.formGroup}>
                            <Input
                                label="Username or Email"
                                name="usernameOrEmail"
                                value={values.usernameOrEmail}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                error={touched.usernameOrEmail && errors.usernameOrEmail}
                                required
                                placeholder="Quantum Traveler"
                                autoFocus
                                fullWidth
                            />
                        </div>
                    ) : (
                        <>
                            <div className={styles.formGroup}>
                                <Input
                                    label="Username"
                                    name="username"
                                    value={values.username}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    error={touched.username && errors.username}
                                    required
                                    placeholder="Explorer"
                                    autoFocus
                                    fullWidth
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <Input
                                    label="Email"
                                    type="email"
                                    name="email"
                                    value={values.email}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    error={touched.email && errors.email}
                                    required
                                    placeholder="void@nebula.io"
                                    fullWidth
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <Input
                                    label="Invite Key"
                                    name="inviteKey"
                                    value={values.inviteKey}
                                    onChange={handleChange}
                                    onBlur={handleBlur}
                                    error={touched.inviteKey && errors.inviteKey}
                                    required
                                    placeholder="fg_invite_..."
                                    fullWidth
                                />
                            </div>
                        </>
                    )}

                    <div className={styles.formGroup}>
                        <Input
                            label="Password"
                            type="password"
                            name="password"
                            value={values.password}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            error={touched.password && errors.password}
                            required
                            placeholder="••••••••"
                            fullWidth
                        />
                        {!isLogin && (
                            <Text size="xs" color="muted" style={{ marginTop: '4px', opacity: 0.8 }}>
                                Password must be at least 8 characters long, contain an uppercase letter, and a number.
                            </Text>
                        )}
                    </div>

                    {isLogin && (
                        <>
                            <Checkbox
                                label="Remember me on this device"
                                name="rememberMe"
                                checked={Boolean(values.rememberMe)}
                                onChange={handleChange}
                                className={styles.rememberMe}
                            />
                            <button
                                type="button"
                                className={styles.toggleButton}
                                onClick={handleForgotPassword}
                                disabled={isForgotSubmitting}
                            >
                                {isForgotSubmitting ? 'Sending reset link...' : 'Forgot password?'}
                            </button>
                        </>
                    )}

                    {generalError && (
                        <div className={styles.errorMessage}>
                            {generalError}
                        </div>
                    )}
                </ModalBody>

                <ModalFooter>
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div className={styles.actions}>
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                fullWidth
                                variant="primary"
                                style={{ fontWeight: 'bold' }}
                            >
                                {isSubmitting ? 'PROCESSING...' : (isLogin ? 'LOG IN' : 'CREATE')}
                            </Button>

                            <Button
                                type="button"
                                onClick={onClose}
                                fullWidth
                                variant="secondary"
                            >
                                Cancel
                            </Button>
                        </div>

                        <div className={styles.toggleContainer}>
                            <Text size="sm" as="span" style={{ marginRight: '8px' }}>
                                {isLogin ? "DON'T HAVE AN ACCOUNT?" : "ALREADY HAVE AN ACCOUNT?"}
                            </Text>
                            <button
                                type="button"
                                onClick={handleToggleMode}
                                className={styles.toggleButton}
                                style={{ color: themeColor }}
                            >
                                {isLogin ? 'SIGN UP' : 'LOGIN'}
                            </button>
                        </div>
                    </div>
                </ModalFooter>
            </form>
        </Modal>
    );
}

function AuthModal({ isOpen, onClose }) {
    if (!isOpen) {
        return null;
    }

    return <AuthModalInner onClose={onClose} />;
}

export default AuthModal;
