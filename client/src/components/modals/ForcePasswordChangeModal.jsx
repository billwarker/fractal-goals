import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Input from '../atoms/Input';
import Button from '../atoms/Button';
import { Text } from '../atoms/Typography';
import { useForm } from '../../hooks/useForm';
import { authApi } from '../../utils/api';
import styles from './AuthModal.module.css';
import notify from '../../utils/notify';
import { logError } from '../../utils/logger';

/**
 * Blocking modal shown when an admin has required a password change.
 * The backend rejects all other API calls with `password_change_required`
 * until the password is updated, so this modal cannot be dismissed.
 */
function ForcePasswordChangeModal() {
    const { logout, setUser } = useAuth();
    const [generalError, setGeneralError] = useState(null);

    const validate = (values) => {
        const errors = {};
        if (!values.currentPassword) errors.currentPassword = 'Required';
        if (!values.newPassword) errors.newPassword = 'Required';
        else if (values.newPassword.length < 8) errors.newPassword = 'Must be at least 8 characters';
        if (values.confirmPassword !== values.newPassword) errors.confirmPassword = 'Passwords do not match';
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
    } = useForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    }, validate);

    const onSubmit = async (formValues) => {
        setGeneralError(null);
        try {
            await authApi.updatePassword({
                current_password: formValues.currentPassword,
                new_password: formValues.newPassword,
            });
            const res = await authApi.getMe();
            setUser(res.data);
            notify.success('Password updated. Welcome back!');
        } catch (err) {
            logError('Forced password change failed:', err);
            let errorMessage = err.response?.data?.error || 'An error occurred';
            if (err.response?.data?.details && Array.isArray(err.response.data.details)) {
                errorMessage = err.response.data.details.map(d => `${d.field}: ${d.message}`).join(', ');
            } else if (!err.response) {
                errorMessage = 'Network Error: Unable to reach the server. Please check your connection.';
            }
            setGeneralError(errorMessage);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={() => {}}
            title="PASSWORD CHANGE REQUIRED"
            size="md"
            showCloseButton={false}
            closeOnEsc={false}
            closeOnBackdrop={false}
        >
            <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
                <ModalBody>
                    <Text size="sm" color="muted" style={{ marginBottom: '12px' }}>
                        An administrator requires you to set a new password before continuing.
                    </Text>
                    <div className={styles.formGroup}>
                        <Input
                            label="Current Password"
                            type="password"
                            name="currentPassword"
                            value={values.currentPassword}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            error={touched.currentPassword && errors.currentPassword}
                            required
                            placeholder="••••••••"
                            autoFocus
                            fullWidth
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <Input
                            label="New Password"
                            type="password"
                            name="newPassword"
                            value={values.newPassword}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            error={touched.newPassword && errors.newPassword}
                            required
                            placeholder="••••••••"
                            fullWidth
                        />
                        <Text size="xs" color="muted" style={{ marginTop: '4px', opacity: 0.8 }}>
                            Password must be at least 8 characters long, contain an uppercase letter, and a number.
                        </Text>
                    </div>
                    <div className={styles.formGroup}>
                        <Input
                            label="Confirm New Password"
                            type="password"
                            name="confirmPassword"
                            value={values.confirmPassword}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            error={touched.confirmPassword && errors.confirmPassword}
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
                </ModalBody>
                <ModalFooter>
                    <div className={styles.actions}>
                        <Button type="button" variant="secondary" onClick={logout} disabled={isSubmitting}>
                            Log Out
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Updating...' : 'Update Password'}
                        </Button>
                    </div>
                </ModalFooter>
            </form>
        </Modal>
    );
}

export default ForcePasswordChangeModal;
