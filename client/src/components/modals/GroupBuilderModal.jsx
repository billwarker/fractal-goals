import React, { useMemo, useRef, useState } from 'react';
import { useActivities } from '../../contexts/ActivitiesContext';
import { useFractalTree } from '../../hooks/useGoalQueries';
import useIsMobile from '../../hooks/useIsMobile';
import notify from '../../utils/notify';
import { sortGroupsTreeOrder, getGroupBreadcrumb } from '../../utils/manageActivities';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import GoalHierarchySelector from '../goals/GoalHierarchySelector';
import { logError } from '../../utils/logger';
import { getGoalGroupConflicts } from '../../utils/goalActivityGroupErrors';
import ConfirmationModal from '../ConfirmationModal';

function flattenGoals(node, goals = [], parentId = null) {
    if (!node) return goals;
    const nodeId = node.id || node.attributes?.id;
    const children = Array.isArray(node.children) ? node.children : [];
    goals.push({
        id: nodeId,
        name: node.name || node.attributes?.name || 'Untitled goal',
        type: node.attributes?.type || node.type,
        parent_id: parentId,
        childrenIds: children.map((child) => child.id || child.attributes?.id).filter(Boolean),
        completed: Boolean(node.completed || node.attributes?.completed),
    });
    if (children.length > 0) {
        children.forEach((child) => flattenGoals(child, goals, nodeId));
    }
    return goals;
}

function getGroupDepth(groupId, activityGroups) {
    let depth = 0;
    let currentId = groupId;
    const seen = new Set();
    while (currentId) {
        if (seen.has(currentId)) break;
        seen.add(currentId);
        const group = (activityGroups || []).find((item) => item.id === currentId);
        if (!group || !group.parent_id) break;
        depth++;
        currentId = group.parent_id;
    }
    return depth;
}

function buildInitialGroupFormState(editingGroup) {
    if (!editingGroup) {
        return {
            name: '',
            description: '',
            parentId: '',
            selectedGoalIds: [],
        };
    }

    return {
        name: editingGroup.name || '',
        description: editingGroup.description || '',
        parentId: editingGroup.parent_id || '',
        selectedGoalIds: editingGroup.associated_goal_ids || [],
    };
}

function GroupGoalSelectorModal({
    isOpen,
    onClose,
    goals,
    selectedGoalIds,
    onSave,
    groupName,
    modalLayer,
}) {
    const [draftGoalIds, setDraftGoalIds] = useState(selectedGoalIds);

    if (!isOpen) {
        return null;
    }

    const handleSave = () => {
        onSave(draftGoalIds);
        onClose();
    };
    const linkedGoalCount = draftGoalIds.length;
    const saveLabel = `Save ${linkedGoalCount} Linked ${linkedGoalCount === 1 ? 'Goal' : 'Goals'}`;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Link Goals${groupName ? `: ${groupName}` : ''}`}
            size="lg"
            stackLevel={2}
            layer={modalLayer}
        >
            <ModalBody>
                <GoalHierarchySelector
                    goals={goals}
                    selectedGoalIds={draftGoalIds}
                    onSelectionChange={setDraftGoalIds}
                    selectionMode="multiple"
                    searchPlaceholder="Search goals..."
                    emptyState="No goals found."
                    highlightSelectionAncestors
                    showAncestorControls={false}
                />
            </ModalBody>

            <ModalFooter>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', width: '100%' }}>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                        All activities in this group will be linked to these goals.
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexShrink: 0 }}>
                        <Button variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleSave}>
                            {saveLabel}
                        </Button>
                    </div>
                </div>
            </ModalFooter>
        </Modal>
    );
}

function GroupBuilderModalInner({ onClose, editingGroup, rootId, activityGroups, onSave, modalLayer }) {
    const { createActivityGroup, updateActivityGroup, setActivityGroupGoals } = useActivities();
    const initialState = buildInitialGroupFormState(editingGroup);

    // Use the query hook to get the fractal tree for goal selection
    const { data: currentFractal } = useFractalTree(rootId);
    const isMobile = useIsMobile();

    const [name, setName] = useState(initialState.name);
    const [description, setDescription] = useState(initialState.description);
    const [parentId, setParentId] = useState(initialState.parentId);
    const [selectedGoalIds, setSelectedGoalIds] = useState(initialState.selectedGoalIds);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // Goals that already use another group: moving them needs confirmation (one group per goal).
    const [pendingMove, setPendingMove] = useState(null);
    const resolvingMoveRef = useRef(false);

    // UI State for Goal Selector
    const [showGoalSelector, setShowGoalSelector] = useState(false);

    const allGoals = useMemo(() => flattenGoals(currentFractal), [currentFractal]);
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

            const result = editingGroup
                ? await updateActivityGroup(rootId, editingGroup.id, data)
                : await createActivityGroup(rootId, data);
            const group = editingGroup ? { ...editingGroup, ...result } : result;
            if (group?.id && (editingGroup || selectedGoalIds.length > 0)) {
                await saveGoals(group, selectedGoalIds);
            } else {
                finish(group);
            }
        } catch (err) {
            fail(err);
        } finally {
            setLoading(false);
        }
    };

    const finish = (group) => {
        onSave?.(group);
        onClose();
    };

    const fail = (err) => {
        logError("Failed to save group", err);
        const message = err?.response?.data?.error || "Failed to save group";
        setError(message);
        notify.error(message);
    };

    const saveGoals = async (group, goalIds, options = {}) => {
        try {
            const updatedGroup = await setActivityGroupGoals(rootId, group.id, goalIds, options);
            finish(updatedGroup?.id ? updatedGroup : { ...group, associated_goal_ids: goalIds });
        } catch (err) {
            const conflicts = getGoalGroupConflicts(err);
            if (conflicts.length === 0) throw err;
            setPendingMove({ group, goalIds, conflicts });
        }
    };

    // ConfirmationModal calls onConfirm then onClose: resolve the first answer only.
    const resolvePendingMove = async (moveGoals) => {
        const move = pendingMove;
        if (!move || resolvingMoveRef.current) return;
        resolvingMoveRef.current = true;
        setPendingMove(null);
        const conflictIds = new Set(move.conflicts.map((conflict) => conflict.goal_id));
        setLoading(true);
        try {
            await saveGoals(
                move.group,
                moveGoals ? move.goalIds : move.goalIds.filter((goalId) => !conflictIds.has(goalId)),
                { replace: moveGoals },
            );
        } catch (err) {
            fail(err);
        } finally {
            resolvingMoveRef.current = false;
            setLoading(false);
        }
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
        return sortGroupsTreeOrder(candidates.filter((group) => getGroupDepth(group.id, activityGroups) < 2));
    }, [activityGroups, editingGroup]);

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={editingGroup ? 'Edit Group' : 'Create Group'}
            size="md"
            stackLevel={1}
            layer={modalLayer}
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
                            <label htmlFor="activity-group-name" style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '5px' }}>Name</label>
                            <input
                                id="activity-group-name"
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
                            <label htmlFor="activity-group-description" style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '5px' }}>Description</label>
                            <textarea
                                id="activity-group-description"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                style={{ width: '100%', padding: '10px', background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)', minHeight: '60px', fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                        </div>

                        {/* Parent Group */}
                        <div>
                            <label htmlFor="activity-group-parent" style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '5px' }}>Parent Group (Optional)</label>
                            <select
                                id="activity-group-parent"
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

                        {/* Linked Goals */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--color-text-muted)' }}>Linked Goals</label>
                                <button
                                    type="button"
                                    onClick={() => setShowGoalSelector(true)}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--color-brand-primary)', cursor: 'pointer', fontSize: '12px' }}
                                >
                                    {selectedGoalIds.length > 0 ? 'Edit Linked Goals' : 'Link Goals'}
                                </button>
                            </div>

                            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '5px' }}>
                                {selectedGoalIds.length === 0
                                    ? 'No linked goals'
                                    : `${selectedGoalIds.length} linked ${selectedGoalIds.length === 1 ? 'goal' : 'goals'}`}
                            </div>

                            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                All activities in this group will be linked to these goals.
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
            <GroupGoalSelectorModal
                key={`${editingGroup?.id || 'new'}:${showGoalSelector ? 'open' : 'closed'}`}
                isOpen={showGoalSelector}
                onClose={() => setShowGoalSelector(false)}
                goals={allGoals}
                selectedGoalIds={selectedGoalIds}
                onSave={setSelectedGoalIds}
                groupName={name.trim()}
                modalLayer={modalLayer}
            />
            <ConfirmationModal
                isOpen={Boolean(pendingMove)}
                onClose={() => resolvePendingMove(false)}
                onConfirm={() => resolvePendingMove(true)}
                title="Move goals to this group?"
                message={pendingMove ? `A goal has one activity group. ${pendingMove.conflicts.map((conflict) => (
                    `“${conflict.goal_name}” uses “${conflict.current_group?.name || 'another group'}”`
                )).join('; ')}. Move ${pendingMove.conflicts.length === 1 ? 'it' : 'them'} here?` : ''}
                confirmText={pendingMove?.conflicts.length === 1 ? 'Move Goal' : 'Move Goals'}
                cancelText="Keep Their Groups"
            />
        </Modal>
    );
}

export default function GroupBuilderModal({
    isOpen,
    onClose,
    editingGroup,
    rootId,
    activityGroups,
    onSave,
    modalLayer = 'default',
}) {
    if (!isOpen) {
        return null;
    }

    const modalKey = editingGroup?.id || 'new-activity-group';
    return (
        <GroupBuilderModalInner
            key={modalKey}
            onClose={onClose}
            editingGroup={editingGroup}
            rootId={rootId}
            activityGroups={activityGroups}
            onSave={onSave}
            modalLayer={modalLayer}
        />
    );
}
