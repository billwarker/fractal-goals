import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authApi, clearAccessToken, setAccessToken } from '../utils/api';
import notify from '../utils/notify';
import { logError } from '../utils/logger';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const authVersionRef = useRef(0);

    const replaceUser = (nextUser) => {
        const previousUserId = user?.id || null;
        const nextUserId = nextUser?.id || null;
        if (previousUserId !== nextUserId) {
            queryClient.clear();
        }
        setUser(nextUser || null);
    };

    useEffect(() => {
        fetchCurrentUser();
    }, []);

    // Handle events from axios interceptors
    useEffect(() => {
        const handleSessionExpired = () => {
            authVersionRef.current += 1;
            clearAccessToken();
            replaceUser(null);
            setLoading(false);
            notify.error('Your session expired. Please log in again.');
            navigate('/', {
                replace: true,
                state: { openAuthModal: true, authReason: 'session-expired' },
            });
        };
        const handleTokenRefresh = (e) => {
            if (e.detail?.token) {
                setAccessToken(e.detail.token);
            }
            if (e.detail?.user) {
                authVersionRef.current += 1;
                replaceUser(e.detail.user);
            }
        };
        window.addEventListener('auth:session_expired', handleSessionExpired);
        window.addEventListener('auth:token_refreshed', handleTokenRefresh);
        return () => {
            window.removeEventListener('auth:session_expired', handleSessionExpired);
            window.removeEventListener('auth:token_refreshed', handleTokenRefresh);
        };
    }, [navigate, queryClient, user?.id]);

    const fetchCurrentUser = async () => {
        const authVersion = authVersionRef.current;
        const isStaleAuthCheck = () => authVersionRef.current !== authVersion;

        try {
            const res = await authApi.getMe();
            if (isStaleAuthCheck()) return;
            replaceUser(res.data);
            await authApi.getCsrf();
        } catch (err) {
            if (isStaleAuthCheck()) return;

            const status = err?.response?.status;
            const isNetworkError = !err?.response;

            // Keep token for transient network failures so interceptor retries can recover.
            if (!isNetworkError && (status === 401 || status === 403)) {
                try {
                    const refreshResponse = await authApi.refresh();
                    if (isStaleAuthCheck()) return;
                    if (refreshResponse.data?.token) {
                        setAccessToken(refreshResponse.data.token);
                    }
                    if (refreshResponse.data?.user) {
                        replaceUser(refreshResponse.data.user);
                        await authApi.getCsrf();
                        return;
                    }
                } catch {
                    if (isStaleAuthCheck()) return;
                    clearAccessToken();
                    replaceUser(null);
                }
            } else {
                logError("Failed to fetch current user:", err);
            }
        } finally {
            setLoading(false);
        }
    };

    const login = async (usernameOrEmail, password, options = {}) => {
        try {
            const res = await authApi.login({
                username_or_email: usernameOrEmail,
                password: password,
                remember_me: Boolean(options.rememberMe)
            });
            const { token, user: userData } = res.data;
            authVersionRef.current += 1;
            setAccessToken(token);
            replaceUser(userData);
            return res.data;
        } catch (err) {
            logError("Login failed:", err);
            throw err;
        }
    };

    const signup = async (username, email, password, inviteKey) => {
        try {
            const res = await authApi.signup({
                username,
                email,
                password,
                invite_key: inviteKey
            });
            return res.data;
        } catch (err) {
            logError("Signup failed:", err);
            throw err;
        }
    };

    const logout = async () => {
        try {
            await authApi.logout();
        } finally {
            authVersionRef.current += 1;
            clearAccessToken();
            replaceUser(null);
        }
    };

    const value = {
        user,
        token: null,
        loading,
        login,
        signup,
        logout,
        setUser: replaceUser,
        isAuthenticated: !!user
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
