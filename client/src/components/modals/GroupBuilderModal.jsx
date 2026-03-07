import React, { useState, useEffect, useMemo } from 'react';
import { useActivities } from '../../contexts/ActivitiesContext';
import { useGoals } from '../../contexts/GoalsContext';
import { useTheme } from '../../contexts/ThemeContext'
import { useGoalLevels } from '../../contexts/GoalLevelsContext';;
import useIsMobile from '../../hooks/useIsMobile';
import notify from '../../utils/notify';
import { sortGroupsTreeOrder, getGroupBreadcrumb } from '../../utils/manageActivities';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';

export default function GroupBuilderModal({ isOpen, onClose, editingGroup, rootId, activityGroups, onSave }) {
    const { createActivityGroup, updateActivityGroup, setActivityGroupGoals } = useActivities();
    const { useFractalTreeQuery } = useGoals();
    const { getGoalColor } = useGoalLevels();;

    // Use the query hook to get the fractal tree for goal selection
    const { data: currentFractal } = useFractalTreeQuery(rootId);
    const isMobile = useIsMobile();

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [parentId, setParentId] = useState('');
    const [selectedGoalIds, setSelectedGoalIds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

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
        setError(null);
        setShowGoalSelector(false);
    }, [editingGroup, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (loading) return;
        setLoading(true);
        setError(null);
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
            const message = err?.response?.data?.error || "Failed to save group";
            setError(message);
            notify.error(message);
        } finally {
            setLoading(false);
        }
    };

    // Compute depth of a group (0 = root, 1 = child, 2 = grandchild)
    const getGroupDepth = (groupId) => {
        let depth = 0;
        let currentId = groupId;
        const seen = new Set();
        while (currentId) {
            if (seen.has(currentId)) break;
            seen.add(currentId);
            const group = (activityGroups || []).find(g => g.id === currentId);
            if (!group || !group.parent_id) break;
            depth++;
            currentId = group.parent_id;
        }
        return depth;
    };

    // Build breadcrumb path using shared utility
    const groupBreadcrumb = (groupId) => getGroupBreadcrumb(groupId, activityGroups || []);

    // Filter available parent groups to avoid cycles, self-selection, and enforce max 3 levels
    const availableParentGroups = useMemo(() => {
        if (!activityGroups) return [];

        let candidates = activityGroups;

        // When editing, exclude the group itself and all its descendants to prevent cycles
        if (editingGroup) {
            const childrenByParent = activityGroups.reduce((acc, group) => {
                const key = group.parent_id || '__root__';
                if (!acc[key]) acc[key] = [];
                acc[key].push(group.id);
                return acc;
            }, {});

            const blocked = new Set([editingGroup.id]);
            const stack = [...(childrenByParent[editingGroup.id] || [])];
            while (stack.length > 0) {
                const current = stack.pop();
                if (!current || blocked.has(current)) continue;
                blocked.add(current);
                const children = childrenByParent[current] || [];
                children.forEach((childId) => stack.push(childId));
            }

            candidates = activityGroups.filter(g => !blocked.has(g.id));
        }

        // Only show groups at depth < 2 (so new child would be at depth <= 2, max 3 levels)
        return sortGroupsTreeOrder(candidates.filter(g => getGroupDepth(g.id) < 2));
    }, [activityGroups, editingGroup]);

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={editingGroup ? 'Edit Group' : 'Create Group'}
            size="md"
        >
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <ModalBody>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {error && (
                            <div style={{ fontSize: '13px', color: 'var(--color-brand-danger)' }}>
                                {error}
                            </div>
                        )}

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
                                        {groupBreadcrumb(group.id)}
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
                    </div>
                </ModalBody>

                <ModalFooter>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexDirection: isMobile ? 'column-reverse' : 'row', width: '100%' }}>
                        <Button variant="secondary" onClick={onClose} fullWidth={isMobile}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" disabled={loading} fullWidth={isMobile}>
                            {loading ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </ModalFooter>
            </form>
        </Modal>
    );
}
