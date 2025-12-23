import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { globalApi } from '../utils/api';
import '../App.css';

/**
 * Selection Page - Fractal Goal Selection
 * Displays all root goals as cards and allows navigation to specific fractal views
 */
function Selection({ onDeleteFractal, onCreateNewFractal }) {
    const navigate = useNavigate();
    const [fractals, setFractals] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFractals();
    }, []);

    const fetchFractals = async () => {
        try {
            const res = await globalApi.getAllFractals();
            setFractals(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch fractals", err);
            setLoading(false);
        }
    };

    const handleSelectRoot = (rootId) => {
        // Navigate to fractal-scoped URL
        navigate(`/${rootId}/fractal-goals`);
    };

    const handleCreateNew = () => {
        onCreateNewFractal();
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'white' }}>Loading fractals...</div>;
    }

    return (
        <div className="fractal-selection-container">
            <h1 style={{ color: 'white', fontWeight: 300, marginBottom: '10px' }}>
                My Fractal Goals
            </h1>
            <p style={{ color: '#888' }}>Select a tree to focus on</p>

            <div className="fractal-selection-grid">
                {fractals.map(fractal => (
                    <div
                        key={fractal.id}
                        className="fractal-card"
                        onClick={() => handleSelectRoot(fractal.id)}
                    >
                        <h3>{fractal.name}</h3>
                        <button
                            className="delete-btn"
                            onClick={(e) => onDeleteFractal(e, fractal.id, fractal.name)}
                            title="Delete Fractal"
                        >
                            ×
                        </button>
                    </div>
                ))}

                <div className="fractal-card add-fractal-card" onClick={handleCreateNew}>
                    <div className="add-icon">+</div>
                    <h3>New Fractal</h3>
                </div>
            </div>
        </div>
    );
}

export default Selection;
