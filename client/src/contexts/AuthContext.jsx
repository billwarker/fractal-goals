import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, clearAccessToken, setAccessToken } from '../utils/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchCurrentUser();
    }, []);

    // Handle events from axios interceptors
    useEffect(() => {
        const handleUnauthorized = () => {
            clearAccessToken();
            setUser(null);
            setLoading(false);
        };
        const handleTokenRefresh = (e) => {
            if (e.detail?.token) {
                setAccessToken(e.detail.token);
            }
            if (e.detail?.user) {
                setUser(e.detail.user);
            }
        };
        window.addEventListener('auth:unauthorized', handleUnauthorized);
        window.addEventListener('auth:token_refreshed', handleTokenRefresh);
        return () => {
            window.removeEventListener('auth:unauthorized', handleUnauthorized);
            window.removeEventListener('auth:token_refreshed', handleTokenRefresh);
        };
    }, []);

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
                    setUser(refreshResponse.data.user);
                    return;
                }
            }

            const res = await authApi.getMe();
            setUser(res.data);
        } catch (err) {
            console.error("Failed to fetch current user:", err);
            const status = err?.response?.status;
            const isNetworkError = !err?.response;

            // Keep token for transient network failures so interceptor retries can recover.
            if (!isNetworkError && (status === 401 || status === 403)) {
                clearAccessToken();
                setUser(null);
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
            setUser(userData);
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
            setUser(null);
        }
    };

    const value = {
        user,
        token: null,
        loading,
        login,
        signup,
        logout,
        setUser,
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
