import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import Button from '../components/atoms/Button';
import Input from '../components/atoms/Input';
import { Heading, Text } from '../components/atoms/Typography';
import { authApi } from '../utils/api';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import './ResetPassword.css';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        if (!token) {
            setError('This reset link is missing its token.');
            return;
        }
        if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
            setError('Password must be at least 8 characters long, contain an uppercase letter, and a number.');
            return;
        }
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setSubmitting(true);
        try {
            await authApi.resetPassword({ token, new_password: password });
            notify.success('Password reset. Please log in with your new password.');
            navigate('/', { replace: true, state: { openAuthModal: true } });
        } catch (err) {
            setError(formatError(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="reset-password-page">
            <form className="reset-password-panel" onSubmit={handleSubmit}>
                <Heading level={1} size="lg">Reset Password</Heading>
                <Text color="muted">Choose a new password for your Fractal Goals account.</Text>
                <Input
                    label="New password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    fullWidth
                    required
                />
                <Input
                    label="Confirm password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    fullWidth
                    required
                />
                {error && <div className="reset-password-error">{error}</div>}
                <Button type="submit" variant="primary" fullWidth disabled={isSubmitting}>
                    {isSubmitting ? 'Resetting...' : 'Reset Password'}
                </Button>
                <Link className="reset-password-link" to="/">Back to login</Link>
            </form>
        </main>
    );
}
