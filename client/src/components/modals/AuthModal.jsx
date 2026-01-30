import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Input from '../atoms/Input';
import Button from '../atoms/Button';
import { Heading, Text } from '../atoms/Typography';
import { useForm } from '../../hooks/useForm';
import styles from './AuthModal.module.css';
import '../../App.css';
import notify from '../../utils/notify';

/**
 * AuthModal - Refactored to match exactly the application modal standards
 * (Reference: GoalDetailModal style)
 */
function AuthModal({ isOpen, onClose }) {
    const { login, signup } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [generalError, setGeneralError] = useState(null);

    // Theme color (For consistent highlighting)
    const themeColor = 'var(--color-text-primary)';

    const validate = (values) => {
        const errors = {};
        if (isLogin) {
            if (!values.usernameOrEmail) errors.usernameOrEmail = "Required";
        } else {
            if (!values.username) errors.username = "Required";
            if (!values.email) errors.email = "Required";
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
        resetForm
    } = useForm({
        username: '',
        email: '',
        password: '',
        usernameOrEmail: ''
    }, validate);

    if (!isOpen) return null;

    const onSubmit = async (formValues) => {
        setGeneralError(null);
        try {
            if (isLogin) {
                await login(formValues.usernameOrEmail, formValues.password);
                onClose();
            } else {
                await signup(formValues.username, formValues.email, formValues.password);
                setIsLogin(true);
                setGeneralError(null);
                notify.success("Account created! Please log in.");
                // Optionally prefill login
                handleChange({ target: { name: 'usernameOrEmail', value: formValues.username } });
                resetForm(); // OR just keep values? Let's reset to clean state except usernameOrEmail maybe?
                // Actually resetForm wipes everything. Let's just manually set.
                // But useForm doesn't expose manual set well except generic handleChange.
                // Let's just let the user type it or rely on browser autofill.
            }
        } catch (err) {
            let errorMessage = "An error occurred";
            if (err.response?.data?.details) {
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

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                {/* Header - Reference GoalDetailModal */}
                <div className={styles.header} style={{ borderBottomColor: themeColor }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <Heading level={3} className={styles.title} style={{ color: themeColor }}>
                            {isLogin ? 'WELCOME BACK' : 'CREATE AN ACCOUNT'}
                        </Heading>
                        <button
                            onClick={onClose}
                            className={styles.closeButton}
                        >
                            &times;
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
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
                    </div>

                    {generalError && (
                        <div className={styles.errorMessage}>
                            {generalError}
                        </div>
                    )}

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
                </form>
            </div>
        </div>
    );
}

export default AuthModal;
