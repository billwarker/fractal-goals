import React, { useState, useEffect, useMemo } from 'react';
import { useActivities } from '../../contexts/ActivitiesContext';
import { useGoals } from '../../contexts/GoalsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { fractalApi } from '../../utils/api';

export default function GroupBuilderModal({ isOpen, onClose, editingGroup, rootId, activityGroups, onSave }) {
    const { createActivityGroup, updateActivityGroup, setActivityGroupGoals } = useActivities();
    const { useFractalTreeQuery } = useGoals();
    const { getGoalColor } = useTheme();

    // Use the query hook to get the fractal tree for goal selection
    const { data: currentFractal } = useFractalTreeQuery(rootId);

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [parentId, setParentId] = useState('');
    const [selectedGoalIds, setSelectedGoalIds] = useState([]);
    const [loading, setLoading] = useState(false);

    // UI State for Goal Selector
    const [showGoalSelector, setShowGoalSelector] = useState(false);

    // Flatten goal tree for selection
    const flattenGoals = (node, goals = []) => {
        if (!node) return goals;
        goals.push({
            id: node.id || node.attributes?.id,
            name: node.name,
            type: node.attributes?.type || node.type
        });
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => flattenGoals(child, goals));
        }
        return goals;
    };

    const allGoals = useMemo(() => flattenGoals(currentFractal), [currentFractal]);

    useEffect(() => {
        if (editingGroup) {
            setName(editingGroup.name);
            setDescription(editingGroup.description || '');
            setParentId(editingGroup.parent_id || '');
            setSelectedGoalIds(editingGroup.associated_goal_ids || []);
        } else {
            setName('');
            setDescription('');
            setParentId('');
            setSelectedGoalIds([]);
        }
        setShowGoalSelector(false);
    }, [editingGroup, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            // Prepare payload
            const data = {
                name,
                description,
                parent_id: parentId || null // Send null if empty string
            };

            let result;
            if (editingGroup) {
                result = await updateActivityGroup(rootId, editingGroup.id, data);
                // Update goal associations
                await setActivityGroupGoals(rootId, editingGroup.id, selectedGoalIds);
            } else {
                result = await createActivityGroup(rootId, data);
                // Set goal associations for new group
                if (result && result.id && selectedGoalIds.length > 0) {
                    await setActivityGroupGoals(rootId, result.id, selectedGoalIds);
                }
            }
            onSave?.();
            onClose();
        } catch (err) {
            console.error("Failed to save group", err);
        } finally {
            setLoading(false);
        }
    };

    // Filter available parent groups to avoid cycles and self-selection
    const availableParentGroups = useMemo(() => {
        if (!activityGroups) return [];
        if (!editingGroup) return activityGroups;

        // Simple cycle check: Can't pick self. 
        // Checks deeper cycles is harder without full tree traversal but backend will block it (hopefully) or it's just a UI constraint.
        // We'll just block self for now.
        return activityGroups.filter(g => g.id !== editingGroup.id);
    }, [activityGroups, editingGroup]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'var(--color-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={onClose}>
            <div style={{
                background: 'var(--color-bg-card)', padding: '24px', borderRadius: '8px', width: '500px', maxHeight: '90vh', overflowY: 'auto',
                border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', display: 'flex', flexDirection: 'column', gap: '20px',
                boxShadow: 'var(--shadow-md)'
            }} onClick={e => e.stopPropagation()}>
                <h2 style={{ fontSize: '20px', fontWeight: 300, margin: 0 }}>
                    {editingGroup ? 'Edit Group' : 'Create Group'}
                </h2>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>

                    {/* Name */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '5px' }}>Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            style={{ width: '100%', padding: '10px', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
                            required
                            autoFocus
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '5px' }}>Description</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            style={{ width: '100%', padding: '10px', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', minHeight: '60px', fontFamily: 'inherit', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* Parent Group */}
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '5px' }}>Parent Group (Optional)</label>
                        <select
                            value={parentId}
                            onChange={e => setParentId(e.target.value)}
                            style={{ width: '100%', padding: '10px', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', boxSizing: 'border-box' }}
                        >
                            <option value="">(No Parent - Root Level)</option>
                            {availableParentGroups.map(group => (
                                <option key={group.id} value={group.id}>
                                    {group.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Associated Goals */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)' }}>Associated Goals</label>
                            <button
                                type="button"
                                onClick={() => setShowGoalSelector(!showGoalSelector)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--color-brand-primary)', cursor: 'pointer', fontSize: '12px' }}
                            >
                                {showGoalSelector ? 'Hide Goals' : 'Select Goals'}
                            </button>
                        </div>

                        {/* Selected Goals Tags */}
                        {selectedGoalIds.length > 0 && !showGoalSelector && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '5px' }}>
                                {selectedGoalIds.map(id => {
                                    const goal = allGoals.find(g => g.id === id);
                                    if (!goal) return null;
                                    const color = getGoalColor(goal.type);
                                    return (
                                        <span key={id} style={{
                                            fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                                            background: `${color}30`, border: `1px solid ${color}`, color: color
                                        }}>
                                            {goal.name}
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        {/* Goal Selector Area */}
                        {showGoalSelector && (
                            <div style={{
                                background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: '4px',
                                padding: '10px', maxHeight: '200px', overflowY: 'auto'
                            }}>
                                {allGoals.length === 0 ? (
                                    <div style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: '12px' }}>No goals found.</div>
                                ) : (
                                    allGoals.map(goal => {
                                        const isSelected = selectedGoalIds.includes(goal.id);
                                        const color = getGoalColor(goal.type);
                                        return (
                                            <div key={goal.id} style={{ marginBottom: '4px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setSelectedGoalIds([...selectedGoalIds, goal.id]);
                                                            else setSelectedGoalIds(selectedGoalIds.filter(id => id !== goal.id));
                                                        }}
                                                    />
                                                    <span style={{ color: isSelected ? color : 'var(--color-text-secondary)', fontSize: '13px' }}>{goal.name}</span>
                                                </label>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                            All activities in this group will be associated with these goals.
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                        <button type="button" onClick={onClose} style={{ padding: '10px 16px', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" disabled={loading} style={{ padding: '10px 24px', background: 'var(--color-brand-primary)', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', opacity: loading ? 0.7 : 1, fontWeight: 'bold' }}>
                            {loading ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
