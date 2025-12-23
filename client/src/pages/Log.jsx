import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import '../App.css';

/**
 * Log Page - Log new practice sessions
 * Allows users to create practice sessions linked to short-term goals for the current fractal
 */
function Log() {
    const { rootId } = useParams(); // Get rootId from URL
    const navigate = useNavigate();

    const [fractalData, setFractalData] = useState(null);
    const [shortTermGoals, setShortTermGoals] = useState([]);
    const [selectedGoals, setSelectedGoals] = useState([]);
    const [description, setDescription] = useState('');
    const [immediateGoals, setImmediateGoals] = useState([{ name: '', description: '' }]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchFractalData();
    }, [rootId, navigate]);

    const fetchFractalData = async () => {
        try {
            const res = await fractalApi.getGoals(rootId);
            setFractalData(res.data);
            const stGoals = collectShortTermGoals(res.data);
            setShortTermGoals(stGoals);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch fractal data", err);
            setLoading(false);
            if (err.response?.status === 404) {
                navigate('/');
            }
        }
    };

    // Collect all short-term goals from a tree
    const collectShortTermGoals = (node, collected = []) => {
        if (!node) return collected;

        const type = node.attributes?.type || node.type;
        if (type === 'ShortTermGoal') {
            collected.push({
                id: node.attributes?.id || node.id,
                name: node.name
            });
        }

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => collectShortTermGoals(child, collected));
        }

        return collected;
    };

    const handleGoalToggle = (goalId) => {
        setSelectedGoals(prev =>
            prev.includes(goalId)
                ? prev.filter(id => id !== goalId)
                : [...prev, goalId]
        );
    };

    const handleAddImmediateGoal = () => {
        setImmediateGoals([...immediateGoals, { name: '', description: '' }]);
    };

    const handleRemoveImmediateGoal = (index) => {
        setImmediateGoals(immediateGoals.filter((_, i) => i !== index));
    };

    const handleImmediateGoalChange = (index, field, value) => {
        const updated = [...immediateGoals];
        updated[index][field] = value;
        setImmediateGoals(updated);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (selectedGoals.length === 0) {
            alert('Please select at least one short-term goal');
            return;
        }

        setSubmitting(true);

        try {
            await fractalApi.createSession(rootId, {
                parent_ids: selectedGoals,
                description: description,
                immediate_goals: immediateGoals.filter(ig => ig.name.trim() !== '')
            });

            // Reset form
            setSelectedGoals([]);
            setDescription('');
            setImmediateGoals([{ name: '', description: '' }]);

            alert('Practice session logged successfully!');
        } catch (err) {
            alert('Error logging practice session: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="log-page" style={{ padding: '20px', color: 'white', maxWidth: '800px', margin: '0 auto' }}>
            <h1 style={{ fontWeight: 300, borderBottom: '1px solid #444', paddingBottom: '15px', marginBottom: '20px' }}>
                Log Practice Session
            </h1>

            {loading ? (
                <p>Loading...</p>
            ) : (
                <form onSubmit={handleSubmit}>
                    {/* Step 1: Select Short-Term Goals */}
                    <div style={{ marginBottom: '30px' }}>
                        <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>
                            1. Select Short-Term Goals ({selectedGoals.length} selected)
                        </h3>
                        {shortTermGoals.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {shortTermGoals.map(goal => (
                                    <label
                                        key={goal.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '12px',
                                            background: selectedGoals.includes(goal.id) ? '#1e3a5f' : '#2a2a2a',
                                            border: '1px solid ' + (selectedGoals.includes(goal.id) ? '#2196f3' : '#444'),
                                            borderRadius: '6px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedGoals.includes(goal.id)}
                                            onChange={() => handleGoalToggle(goal.id)}
                                            style={{ marginRight: '12px', cursor: 'pointer' }}
                                        />
                                        <span>{goal.name}</span>
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <p style={{ color: '#666' }}>No short-term goals found in this fractal</p>
                        )}
                    </div>

                    {/* Step 2: Session Description */}
                    {selectedGoals.length > 0 && (
                        <>
                            <div style={{ marginBottom: '30px' }}>
                                <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>2. Session Description (Optional)</h3>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Describe what you worked on in this session..."
                                    style={{
                                        width: '100%',
                                        minHeight: '100px',
                                        padding: '12px',
                                        background: '#2a2a2a',
                                        border: '1px solid #444',
                                        borderRadius: '6px',
                                        color: 'white',
                                        fontSize: '14px',
                                        fontFamily: 'inherit',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>

                            {/* Step 3: Immediate Goals */}
                            <div style={{ marginBottom: '30px' }}>
                                <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>3. Immediate Goals</h3>
                                {immediateGoals.map((ig, index) => (
                                    <div key={index} style={{ marginBottom: '12px', padding: '12px', background: '#2a2a2a', borderRadius: '6px' }}>
                                        <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                                            <input
                                                type="text"
                                                placeholder="Goal name"
                                                value={ig.name}
                                                onChange={(e) => handleImmediateGoalChange(index, 'name', e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    padding: '8px',
                                                    background: '#1e1e1e',
                                                    border: '1px solid #444',
                                                    borderRadius: '4px',
                                                    color: 'white'
                                                }}
                                            />
                                            {immediateGoals.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveImmediateGoal(index)}
                                                    style={{
                                                        padding: '8px 12px',
                                                        background: '#d32f2f',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        color: 'white',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                        <textarea
                                            placeholder="Description (optional)"
                                            value={ig.description}
                                            onChange={(e) => handleImmediateGoalChange(index, 'description', e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: '#1e1e1e',
                                                border: '1px solid #444',
                                                borderRadius: '4px',
                                                color: 'white',
                                                fontSize: '14px',
                                                fontFamily: 'inherit',
                                                resize: 'vertical',
                                                minHeight: '60px'
                                            }}
                                        />
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={handleAddImmediateGoal}
                                    style={{
                                        padding: '10px 16px',
                                        background: '#333',
                                        border: '1px solid #444',
                                        borderRadius: '4px',
                                        color: 'white',
                                        cursor: 'pointer'
                                    }}
                                >
                                    + Add Immediate Goal
                                </button>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={submitting}
                                style={{
                                    width: '100%',
                                    padding: '14px',
                                    background: submitting ? '#666' : '#4caf50',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: 'white',
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                    cursor: submitting ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {submitting ? 'Logging Session...' : 'Log Practice Session'}
                            </button>
                        </>
                    )}
                </form>
            )}
        </div>
    );
}

export default Log;
