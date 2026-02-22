import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../utils/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    // Effect to handle token changes and initial load
    useEffect(() => {
        if (token) {
            localStorage.setItem('token', token);
            fetchCurrentUser();
        } else {
            localStorage.removeItem('token');
            setUser(null);
            setLoading(false);
        }
    }, [token]);

    // Handle events from axios interceptors
    useEffect(() => {
        const handleUnauthorized = () => {
            setToken(null);
            setUser(null);
        };
        const handleTokenRefresh = (e) => {
            if (e.detail?.token) {
                setToken(e.detail.token);
                if (e.detail.user) setUser(e.detail.user);
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
            const res = await authApi.getMe();
            setUser(res.data);
        } catch (err) {
            console.error("Failed to fetch current user:", err);
            // If fetching user fails, token might be invalid/expired
            setToken(null);
            localStorage.removeItem('token');
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
            const { token: newToken, user: userData } = res.data;
            setToken(newToken);
            setUser(userData);
            return res.data;
        } catch (err) {
            console.error("Login failed:", err);
            throw err;
        }
    };

    const signup = async (username, email, password) => {
        try {
            const res = await authApi.signup({
                username,
                email,
                password
            });
            return res.data;
        } catch (err) {
            console.error("Signup failed:", err);
            throw err;
        }
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
    };

    const value = {
        user,
        token,
        loading,
        login,
        signup,
        logout,
        setUser,
        isAuthenticated: !!token && !!user
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
