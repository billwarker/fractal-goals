import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
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

    // Theme color (Matching the request for white highlighting)
    const themeColor = '#ffffff';

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
        <div className="modal-overlay">
            <div className="modal" style={{ width: '450px', maxWidth: '90vw' }}>
                {/* Header - Reference GoalDetailModal */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    paddingBottom: '16px',
                    marginBottom: '16px',
                    borderBottom: `2px solid ${themeColor}`
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: themeColor, letterSpacing: '1px' }}>
                            {isLogin ? 'WELCOME BACK' : 'CREATE AN ACCOUNT'}
                        </div>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#888',
                                fontSize: '24px',
                                cursor: 'pointer',
                                padding: '0',
                                lineHeight: 1
                            }}
                        >
                            &times;
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {isLogin ? (
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: themeColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                Username or Email
                            </label>
                            <input
                                type="text"
                                name="usernameOrEmail"
                                value={formData.usernameOrEmail}
                                onChange={handleInputChange}
                                required
                                placeholder="Quantum Traveler"
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                    ) : (
                        <>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: themeColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                    Username
                                </label>
                                <input
                                    type="text"
                                    name="username"
                                    value={formData.username}
                                    onChange={handleInputChange}
                                    required
                                    placeholder="Explorer"
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        background: '#2a2a2a',
                                        border: '1px solid #444',
                                        borderRadius: '4px',
                                        color: 'white',
                                        fontSize: '14px'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: themeColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                    Email
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    required
                                    placeholder="void@nebula.io"
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        background: '#2a2a2a',
                                        border: '1px solid #444',
                                        borderRadius: '4px',
                                        color: 'white',
                                        fontSize: '14px'
                                    }}
                                />
                            </div>
                        </>
                    )}

                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: themeColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                            Password
                        </label>
                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleInputChange}
                            required
                            placeholder="••••••••"
                            style={{
                                width: '100%',
                                padding: '10px',
                                background: '#2a2a2a',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                color: 'white',
                                fontSize: '14px'
                            }}
                        />
                    </div>

                    {error && (
                        <div style={{ color: '#ff5252', fontSize: '12px', textAlign: 'center', background: 'rgba(255, 82, 82, 0.1)', padding: '10px', borderRadius: '4px', marginTop: '5px' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px', paddingTop: '16px', borderTop: '1px solid #333' }}>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '12px',
                                background: themeColor,
                                border: 'none',
                                borderRadius: '4px',
                                color: '#000000',
                                fontWeight: 'bold',
                                fontSize: '14px',
                                cursor: 'pointer',
                                transition: 'opacity 0.2s'
                            }}
                        >
                            {loading ? 'PROCESSING...' : (isLogin ? 'LOG IN' : 'CREATE')}
                        </button>

                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                width: '100%',
                                padding: '10px',
                                background: 'transparent',
                                border: '1px solid #555',
                                borderRadius: '4px',
                                color: '#aaa',
                                cursor: 'pointer',
                                fontSize: '13px'
                            }}
                        >
                            Cancel
                        </button>
                    </div>

                    <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '13px', color: '#888' }}>
                        {isLogin ? "DON'T HAVE AN ACCOUNT?" : "ALREADY HAVE AN ACCOUNT?"}
                        <button
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: themeColor,
                                cursor: 'pointer',
                                padding: '0 5px',
                                fontWeight: 'bold'
                            }}
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
