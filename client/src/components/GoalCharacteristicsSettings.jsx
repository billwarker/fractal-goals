import React, { useState } from 'react';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useTheme } from '../contexts/ThemeContext';
import GoalIcon from './atoms/GoalIcon';
<<<<<<< HEAD
import AnimatedGoalIcon from './atoms/AnimatedGoalIcon';
import { ICON_SHAPES } from '../utils/goalCharacteristics';
=======
import { ICON_SHAPES, DEADLINE_UNITS } from '../utils/goalCharacteristics';
>>>>>>> main
import useIsMobile from '../hooks/useIsMobile';
import toast from 'react-hot-toast';

const GoalCharacteristicsSettings = () => {
    const { goalLevels, updateGoalLevel, resetGoalLevel } = useGoalLevels();
    const { animatedIcons } = useTheme();
    const isMobile = useIsMobile();

    // We maintain local state for active edits before saving to DB
    const [edits, setEdits] = useState({});

    if (!goalLevels || goalLevels.length === 0) {
        return <div>Loading Goal Configuration...</div>;
    }

    const handleChange = (levelId, field, value) => {
        setEdits(prev => ({
            ...prev,
            [levelId]: {
                ...(prev[levelId] || {}),
                [field]: value
            }
        }));
    };

    const handleSave = async (levelId) => {
        const changes = edits[levelId];
        if (!changes) return;

        try {
            await updateGoalLevel({ id: levelId, updates: changes });
            toast.success("Settings saved.");

            // Clear local edits for this level since they are now persisted
            setEdits(prev => {
                const next = { ...prev };
                delete next[levelId];
                return next;
            });
        } catch (error) {
            console.error(error);
            toast.error("Failed to save settings.");
        }
    };

    const handleReset = async (levelId) => {
        if (!window.confirm("Restore this level to the system default characteristics?")) return;
        try {
            await resetGoalLevel(levelId);
            toast.success("Reset to defaults.");
            setEdits(prev => {
                const next = { ...prev };
                delete next[levelId];
                return next;
            });
        } catch (error) {
            toast.error("Failed to reset level.");
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                Customize the shape, colors, and behaviors of your goal hierarchy.
                Any modifications you make here will be saved as personal overrides specifically for your account.
            </p>

            {goalLevels.map((level) => {
                // Merge DB state with local unsaved edits
                const current = { ...level, ...(edits[level.id] || {}) };
                const hasUnsavedChanges = !!edits[level.id] && Object.keys(edits[level.id]).length > 0;
                const isCustomized = level.owner_id !== null;

                return (
                    <div
                        key={level.id}
                        style={{
                            padding: '16px',
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            backgroundColor: 'var(--color-bg-card-alt)'
                        }}
                    >
                        {/* Header Row */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '16px',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>
                                {animatedIcons ? (
                                    <AnimatedGoalIcon
                                        shape={current.icon || 'circle'}
                                        color={current.color || 'var(--color-brand-primary)'}
                                        secondaryColor={current.secondary_color || undefined}
                                        isSmart={true}
                                        size={32}
                                    />
                                ) : (
                                    <GoalIcon
                                        shape={current.icon || 'circle'}
                                        color={current.color || 'var(--color-brand-primary)'}
                                        secondaryColor={current.secondary_color || undefined}
                                        isSmart={true}
                                        size={24}
                                    />
                                )}
                                {current.name}

                                {isCustomized && (
                                    <span style={{ fontSize: '10px', background: 'var(--color-bg-primary)', padding: '2px 6px', borderRadius: '4px', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                                        Customized
                                    </span>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                {isCustomized && (
                                    <button
                                        onClick={() => handleReset(level.id)}
                                        style={{
                                            fontSize: '12px',
                                            background: 'transparent',
                                            border: '1px solid var(--color-border)',
                                            color: 'var(--color-text-secondary)',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Restore Default
                                    </button>
                                )}
                                {hasUnsavedChanges && (
                                    <button
                                        onClick={() => handleSave(level.id)}
                                        style={{
                                            fontSize: '12px',
                                            background: 'var(--color-brand-primary)',
                                            border: 'none',
                                            color: '#fff',
                                            padding: '4px 12px',
                                            borderRadius: '4px',
                                            cursor: 'pointer',
                                            fontWeight: 'bold'
                                        }}
                                    >
                                        Save Changes
                                    </button>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Icon Selection */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                                    Shape
                                </label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {ICON_SHAPES.map(s => {
                                        const isSelected = current.icon === s.value;
                                        return (
                                            <button
                                                key={s.value}
                                                onClick={() => handleChange(level.id, 'icon', s.value)}
                                                style={{
                                                    padding: '8px',
                                                    borderRadius: '4px',
                                                    border: '1px solid',
                                                    borderColor: isSelected ? (current.color || 'var(--color-brand-primary)') : 'var(--color-border)',
                                                    backgroundColor: isSelected ? 'rgba(0,0,0,0.1)' : 'transparent',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                                title={s.label}
                                            >
                                                <GoalIcon
                                                    shape={s.value}
                                                    color={isSelected ? (current.color || 'var(--color-brand-primary)') : 'var(--color-text-muted)'}
                                                    size={20}
                                                />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Color Selection */}
                            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                                        Primary Color
                                    </label>
                                    <input
                                        type="color"
                                        value={current.color || '#000000'}
                                        onChange={(e) => handleChange(level.id, 'color', e.target.value)}
                                        style={{ width: isMobile ? '100%' : '120px', height: '32px', padding: 0, border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                                        Secondary Color <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>(SMART ring fill)</span>
                                    </label>
                                    <input
                                        type="color"
                                        value={current.secondary_color || current.color || '#000000'}
                                        onChange={(e) => handleChange(level.id, 'secondary_color', e.target.value)}
                                        style={{ width: isMobile ? '100%' : '120px', height: '32px', padding: 0, border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer' }}
                                    />
                                </div>
                            </div>

                            {/* Behavior Toggles */}
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={current.allow_manual_completion ?? true}
                                        onChange={(e) => handleChange(level.id, 'allow_manual_completion', e.target.checked)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    Allow Manual Completion
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={current.track_activities ?? true}
                                        onChange={(e) => handleChange(level.id, 'track_activities', e.target.checked)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    Support Activity Tracking
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={current.requires_smart ?? false}
                                        onChange={(e) => handleChange(level.id, 'requires_smart', e.target.checked)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    Requires SMART Metrics
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={current.auto_complete_when_children_done ?? false}
                                        onChange={(e) => handleChange(level.id, 'auto_complete_when_children_done', e.target.checked)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    Auto-Complete When Children Done
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={current.can_have_targets ?? true}
                                        onChange={(e) => handleChange(level.id, 'can_have_targets', e.target.checked)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    Can Have Targets
                                </label>


                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={current.description_required ?? false}
                                        onChange={(e) => handleChange(level.id, 'description_required', e.target.checked)}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    Description Required
                                </label>
                            </div>

                            {/* Value + Unit Controls */}
                            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginTop: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                                        Deadline Range
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <input
                                            type="number"
                                            placeholder="Min"
                                            min="0"
                                            value={current.deadline_min_value ?? ''}
                                            onChange={(e) => handleChange(level.id, 'deadline_min_value', e.target.value ? parseInt(e.target.value) : null)}
                                            style={{ width: '55px', padding: '4px 8px', fontSize: '13px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                                        />
                                        <select
                                            value={current.deadline_min_unit ?? 'days'}
                                            onChange={(e) => handleChange(level.id, 'deadline_min_unit', e.target.value)}
                                            style={{ padding: '4px 4px', fontSize: '12px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', cursor: 'pointer' }}
                                        >
                                            {DEADLINE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                        </select>
                                        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>to</span>
                                        <input
                                            type="number"
                                            placeholder="Max"
                                            min="0"
                                            value={current.deadline_max_value ?? ''}
                                            onChange={(e) => handleChange(level.id, 'deadline_max_value', e.target.value ? parseInt(e.target.value) : null)}
                                            style={{ width: '55px', padding: '4px 8px', fontSize: '13px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                                        />
                                        <select
                                            value={current.deadline_max_unit ?? 'days'}
                                            onChange={(e) => handleChange(level.id, 'deadline_max_unit', e.target.value)}
                                            style={{ padding: '4px 4px', fontSize: '12px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', cursor: 'pointer' }}
                                        >
                                            {DEADLINE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                                        Max Children <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>(blank = unlimited)</span>
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="∞"
                                        min="0"
                                        value={current.max_children ?? ''}
                                        onChange={(e) => handleChange(level.id, 'max_children', e.target.value ? parseInt(e.target.value) : null)}
                                        style={{ width: '70px', padding: '4px 8px', fontSize: '13px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                                        Default Deadline Offset
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <input
                                            type="number"
                                            placeholder="—"
                                            min="0"
                                            value={current.default_deadline_offset_value ?? ''}
                                            onChange={(e) => handleChange(level.id, 'default_deadline_offset_value', e.target.value ? parseInt(e.target.value) : null)}
                                            style={{ width: '55px', padding: '4px 8px', fontSize: '13px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                                        />
                                        <select
                                            value={current.default_deadline_offset_unit ?? 'days'}
                                            onChange={(e) => handleChange(level.id, 'default_deadline_offset_unit', e.target.value)}
                                            style={{ padding: '4px 4px', fontSize: '12px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', cursor: 'pointer' }}
                                        >
                                            {DEADLINE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: 'var(--color-text-secondary)' }}>
                                        Sort Children By
                                    </label>
                                    <select
                                        value={current.sort_children_by ?? ''}
                                        onChange={(e) => handleChange(level.id, 'sort_children_by', e.target.value || null)}
                                        style={{ padding: '4px 8px', fontSize: '13px', border: '1px solid var(--color-border)', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', cursor: 'pointer' }}
                                    >
                                        <option value="">Manual (default)</option>
                                        <option value="deadline">Deadline</option>
                                        <option value="created_at">Created Date</option>
                                        <option value="completion_rate">Completion Rate</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default GoalCharacteristicsSettings;
