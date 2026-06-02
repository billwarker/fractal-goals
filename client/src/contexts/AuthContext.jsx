import React, { createContext, useContext, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, clearAccessToken, setAccessToken } from '../utils/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const queryClient = useQueryClient();

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
        const handleUnauthorized = () => {
            clearAccessToken();
            replaceUser(null);
            setLoading(false);
        };
        const handleTokenRefresh = (e) => {
            if (e.detail?.token) {
                setAccessToken(e.detail.token);
            }
            if (e.detail?.user) {
                replaceUser(e.detail.user);
            }
        };
        window.addEventListener('auth:unauthorized', handleUnauthorized);
        window.addEventListener('auth:token_refreshed', handleTokenRefresh);
        return () => {
            window.removeEventListener('auth:unauthorized', handleUnauthorized);
            window.removeEventListener('auth:token_refreshed', handleTokenRefresh);
        };
    }, [queryClient, user?.id]);

    const fetchCurrentUser = async () => {
        try {
            const legacyToken = localStorage.getItem('token');
            if (legacyToken) {
                const refreshResponse = await authApi.refresh(legacyToken);
                localStorage.removeItem('token');
                if (refreshResponse.data?.token) {
                    setAccessToken(refreshResponse.data.token);
                }
                if (refreshResponse.data?.user) {
                    replaceUser(refreshResponse.data.user);
                    return;
                }
            }

            const res = await authApi.getMe();
            replaceUser(res.data);
            await authApi.getCsrf();
        } catch (err) {
            const status = err?.response?.status;
            const isNetworkError = !err?.response;

            // Keep token for transient network failures so interceptor retries can recover.
            if (!isNetworkError && (status === 401 || status === 403)) {
                clearAccessToken();
                replaceUser(null);
            } else {
                console.error("Failed to fetch current user:", err);
            }
        } finally {
            setLoading(false);
        }
    };

    const login = async (usernameOrEmail, password) => {
        try {
            const res = await authApi.login({
                username_or_email: usernameOrEmail,
                password: password
            });
            const { token, user: userData } = res.data;
            setAccessToken(token);
            replaceUser(userData);
            return res.data;
        } catch (err) {
            console.error("Login failed:", err);
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
            console.error("Signup failed:", err);
            throw err;
        }
    };

    const logout = async () => {
        try {
            await authApi.logout();
        } finally {
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
