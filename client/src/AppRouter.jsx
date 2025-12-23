import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import './App.css';

// Import page components
import Selection from './pages/Selection';
import FractalGoals from './pages/FractalGoals';
import Sessions from './pages/Sessions';
import Log from './pages/Log';
import CreateSessionTemplate from './pages/CreateSessionTemplate';

const API_URL = 'http://localhost:8000/api/goals';

// Helper functions (from original App.jsx)
const getChildType = (parentType) => {
    const map = {
        'UltimateGoal': 'LongTermGoal',
        'LongTermGoal': 'MidTermGoal',
        'MidTermGoal': 'ShortTermGoal',
        'ShortTermGoal': 'PracticeSession',
        'PracticeSession': 'ImmediateGoal',
        'ImmediateGoal': 'MicroGoal',
        'MicroGoal': 'NanoGoal',
        'NanoGoal': null
    };
    return map[parentType];
};

const getTypeDisplayName = (type) => {
    const names = {
        'UltimateGoal': 'Ultimate Goal',
        'LongTermGoal': 'Long Term Goal',
        'MidTermGoal': 'Mid Term Goal',
        'ShortTermGoal': 'Short Term Goal',
        'PracticeSession': 'Practice Session',
        'ImmediateGoal': 'Immediate Goal',
        'MicroGoal': 'Micro Goal',
        'NanoGoal': 'Nano Goal'
    };
    return names[type] || type;
};

const calculateGoalAge = (createdAt) => {
    if (!createdAt) return null;

    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays >= 365) {
        return `${(diffDays / 365).toFixed(1)}y`;
    } else if (diffDays >= 30 || diffDays > 7) {
        return `${(diffDays / 30.44).toFixed(1)}mo`;
    } else if (diffDays > 6) {
        return `${(diffDays / 7).toFixed(1)}w`;
    } else {
        return `${Math.floor(diffDays)}d`;
    }
};

function App() {
    const navigate = useNavigate();
    const location = useLocation();

    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [fractalToDelete, setFractalToDelete] = useState(null);

    // Form State for creating new fractals
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    useEffect(() => {
        setLoading(false);
    }, []);

    const handleDeleteFractal = (e, fractalId, fractalName) => {
        e.stopPropagation();
        setFractalToDelete({ id: fractalId, name: fractalName });
    };

    const confirmDeleteFractal = async () => {
        if (!fractalToDelete) return;

        try {
            await axios.delete(`http://localhost:8000/api/fractals/${fractalToDelete.id}`);
            setFractalToDelete(null);

            // If we're currently viewing this fractal, redirect to home
            if (location.pathname.includes(fractalToDelete.id)) {
                navigate('/');
            }
        } catch (err) {
            alert('Failed to delete fractal: ' + err.message);
        }
    };

    const openModal = () => {
        setShowModal(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                name,
                description
            };

            const res = await axios.post('http://localhost:8000/api/fractals', payload);

            setShowModal(false);
            setName('');
            setDescription('');

            // Navigate to the new fractal's page
            navigate(`/${res.data.id}/fractal-goals`);

        } catch (err) {
            alert('Error creating fractal: ' + err.message);
        }
    };

    // Navigation header component
    const NavigationHeader = () => {
        // Extract rootId from current path
        const pathParts = location.pathname.split('/');
        const rootId = pathParts[1]; // First part after /

        const [fractalName, setFractalName] = React.useState('Fractal Goals');

        // Fetch fractal name when rootId changes
        React.useEffect(() => {
            if (rootId && rootId !== '') {
                // Fetch the fractal data to get its name
                axios.get(`http://localhost:8001/api/${rootId}/goals`)
                    .then(res => {
                        if (res.data && res.data.name) {
                            setFractalName(res.data.name);
                        }
                    })
                    .catch(err => {
                        console.error('Failed to fetch fractal name:', err);
                    });
            } else {
                setFractalName('Fractal Goals');
            }
        }, [rootId]);

        // Only show nav if we're on a fractal page
        if (!rootId || rootId === '') return null;

        const navItems = [
            { path: `/${rootId}/fractal-goals`, label: 'FRACTAL VIEW' },
            { path: `/${rootId}/sessions`, label: 'SESSIONS' },
            { path: `/${rootId}/log`, label: 'LOG' },
            { path: `/${rootId}/create-session-template`, label: 'TEMPLATES' }
        ];

        return (
            <div className="top-nav-links">
                <div className="nav-group">
                    <span className="fractal-title">{fractalName}</span>
                    <div className="nav-separator">|</div>
                    {navItems.map(item => (
                        <button
                            key={item.path}
                            className={`nav-text-link ${location.pathname === item.path ? 'active' : ''}`}
                            onClick={() => navigate(item.path)}
                        >
                            {item.label}
                        </button>
                    ))}
                    <div className="nav-separator">|</div>
                    <button className="nav-text-link home-link" onClick={() => navigate('/')}>
                        EXIT TO HOME
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="app-container">
            <NavigationHeader />

            <div className="top-section">
                <div className="main-content">
                    {loading ? (
                        <p>Loading...</p>
                    ) : (
                        <Routes>
                            <Route
                                path="/"
                                element={
                                    <Selection
                                        onDeleteFractal={handleDeleteFractal}
                                        onCreateNewFractal={openModal}
                                    />
                                }
                            />
                            <Route
                                path="/selection"
                                element={<Navigate to="/" replace />}
                            />
                            <Route
                                path="/:rootId/fractal-goals"
                                element={<FractalGoals />}
                            />
                            <Route path="/:rootId/sessions" element={<Sessions />} />
                            <Route path="/:rootId/log" element={<Log />} />
                            <Route path="/:rootId/create-session-template" element={<CreateSessionTemplate />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    )}
                </div>
            </div>

            {/* Create Fractal Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>Create New Fractal</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Name:</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>

                            <div className="form-group">
                                <label>Description:</label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={4}
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit">Create</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {fractalToDelete && (
                <div className="modal-overlay" onClick={() => setFractalToDelete(null)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h2>Delete Fractal</h2>
                        <p>Are you sure you want to delete <strong>{fractalToDelete.name}</strong>?</p>
                        <p style={{ color: '#ff6b6b', fontSize: '0.9em' }}>
                            This will permanently delete the entire goal tree.
                        </p>
                        <div className="modal-actions">
                            <button onClick={() => setFractalToDelete(null)}>Cancel</button>
                            <button onClick={confirmDeleteFractal} style={{ background: '#d32f2f' }}>
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
