import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Input from '../atoms/Input';
import Button from '../atoms/Button';
import styles from './AuthModal.module.css';
import '../../App.css';

/**
 * AuthModal - Refactored to match exactly the application modal standards
 * (Reference: GoalDetailModal style)
 */
function AuthModal({ isOpen, onClose }) {
    const { login, signup } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Theme color (For consistent highlighting)
    // In light mode, white might be invisible against white background if used for text?
    // The previous implementation used #ffffff which works on dark mode but fails on light mode.
    // We should use a brand color reference or conditional logic.
    // For now, let's use a brand color safe for text, or rely on the class.
    const themeColor = 'var(--color-text-primary)';

    // Form states
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        usernameOrEmail: ''
    });

    if (!isOpen) return null;

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setError(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isLogin) {
                await login(formData.usernameOrEmail, formData.password);
                onClose();
            } else {
                // Client-side validation
                if (formData.password.length < 8) {
                    throw new Error("Password must be at least 8 characters long");
                }
                await signup(formData.username, formData.email, formData.password);
                setIsLogin(true);
                setError(null);
                setFormData(prev => ({ ...prev, usernameOrEmail: formData.username }));
                alert("Account created! Please log in.");
            }
        } catch (err) {
            let errorMessage = "An error occurred";
            if (err.response?.data?.details) {
                // If backend provided structured validation errors, format them nicely
                const details = err.response.data.details;
                if (Array.isArray(details)) {
                    errorMessage = details.map(d => `${d.field}: ${d.message}`).join(", ");
                } else {
                    errorMessage = err.response.data.error || JSON.stringify(details);
                }
            } else {
                errorMessage = err.response?.data?.error || err.message || "An error occurred";
            }
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                {/* Header - Reference GoalDetailModal */}
                <div className={styles.header} style={{ borderBottomColor: themeColor }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <div className={styles.title} style={{ color: themeColor }}>
                            {isLogin ? 'WELCOME BACK' : 'CREATE AN ACCOUNT'}
                        </div>
                        <button
                            onClick={onClose}
                            className={styles.closeButton}
                        >
                            &times;
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    {isLogin ? (
                        <div className={styles.formGroup}>
                            <Input
                                label="Username or Email"
                                name="usernameOrEmail"
                                value={formData.usernameOrEmail}
                                onChange={handleInputChange}
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
                                    value={formData.username}
                                    onChange={handleInputChange}
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
                                    value={formData.email}
                                    onChange={handleInputChange}
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
                            value={formData.password}
                            onChange={handleInputChange}
                            required
                            placeholder="••••••••"
                            fullWidth
                        />
                    </div>

                    {error && (
                        <div className={styles.errorMessage}>
                            {error}
                        </div>
                    )}

                    <div className={styles.actions}>
                        <Button
                            type="submit"
                            disabled={loading}
                            fullWidth
                            variant="primary"
                            style={{ fontWeight: 'bold' }}
                        >
                            {loading ? 'PROCESSING...' : (isLogin ? 'LOG IN' : 'CREATE')}
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
                        {isLogin ? "DON'T HAVE AN ACCOUNT?" : "ALREADY HAVE AN ACCOUNT?"}
                        <button
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
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
