import React, { useState } from 'react';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import GoalIcon from './atoms/GoalIcon';
import AnimatedGoalIcon from './atoms/AnimatedGoalIcon';
import { ICON_SHAPES, DEADLINE_UNITS } from '../utils/goalCharacteristics';
import { authApi } from '../utils/api';
import useIsMobile from '../hooks/useIsMobile';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import styles from './GoalCharacteristicsSettings.module.css';

const GoalCharacteristicsSettings = () => {
    const { goalLevels, updateGoalLevel, resetGoalLevel } = useGoalLevels();
    const { user, setUser } = useAuth();
    const { animatedIcons } = useTheme();
    const isMobile = useIsMobile();

    // We maintain local state for active edits before saving to DB
    const [edits, setEdits] = useState({});

    if (!goalLevels || goalLevels.length === 0) {
        return <div>Loading Goal Configuration...</div>;
    }

    const editableGoalLevels = goalLevels.filter((level) => level?.name !== 'Completed');

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
            notify.success('Settings saved.');

            // Clear local edits for this level since they are now persisted
            setEdits(prev => {
                const next = { ...prev };
                delete next[levelId];
                return next;
            });
        } catch (error) {
            console.error(error);
            notify.error(`Failed to save settings: ${formatError(error)}`);
        }
    };

    const handleReset = async (levelId) => {
        if (!window.confirm("Restore this level to the system default characteristics?")) return;
        try {
            await resetGoalLevel(levelId);
            notify.success('Reset to defaults.');
            setEdits(prev => {
                const next = { ...prev };
                delete next[levelId];
                return next;
            });
        } catch (error) {
            notify.error(`Failed to reset level: ${formatError(error)}`);
        }
    };

    return (
        <div className={styles.container}>
            <p className={styles.description}>
                Customize the shape, colors, and behaviors of your goal hierarchy.
                Any modifications you make here will be saved as personal overrides specifically for your account.
            </p>

            {/* Completed Goal Global Settings */}
            <CompletedGoalSettingsCard user={user} setUser={setUser} animatedIcons={animatedIcons} isMobile={isMobile} />

            {editableGoalLevels.map((level) => {
                // Merge DB state with local unsaved edits
                const current = { ...level, ...(edits[level.id] || {}) };
                const hasUnsavedChanges = !!edits[level.id] && Object.keys(edits[level.id]).length > 0;
                const isCustomized = level.owner_id !== null;

                return (
                    <div key={level.id} className={styles.levelCard}>
                        {/* Header Row */}
                        <div className={styles.levelHeaderRow}>
                            <div className={styles.levelHeaderTitle}>
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
                                    <span className={styles.customizedBadge}>
                                        Customized
                                    </span>
                                )}
                            </div>

                            <div className={styles.buttonGroup}>
                                {isCustomized && (
                                    <button
                                        onClick={() => handleReset(level.id)}
                                        className={styles.restoreButton}
                                    >
                                        Restore Default
                                    </button>
                                )}
                                {hasUnsavedChanges && (
                                    <button
                                        onClick={() => handleSave(level.id)}
                                        className={styles.saveButton}
                                    >
                                        Save Changes
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className={styles.settingsGroup}>
                            {/* Icon Selection */}
                            <div>
                                <label className={styles.inputLabel}>
                                    Shape
                                </label>
                                <div className={styles.shapeList}>
                                    {ICON_SHAPES.map(s => {
                                        const isSelected = current.icon === s.value;
                                        return (
                                            <button
                                                key={s.value}
                                                onClick={() => handleChange(level.id, 'icon', s.value)}
                                                className={styles.shapeButton}
                                                style={{
                                                    borderColor: isSelected ? (current.color || 'var(--color-brand-primary)') : 'var(--color-border)',
                                                    backgroundColor: isSelected ? 'rgba(0,0,0,0.1)' : 'transparent',
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
                            <div className={styles.flexRowWrap}>
                                <div>
                                    <label className={styles.inputLabel}>
                                        Primary Color
                                    </label>
                                    <input
                                        type="color"
                                        value={current.color || '#000000'}
                                        onChange={(e) => handleChange(level.id, 'color', e.target.value)}
                                        className={`${styles.colorInput} ${isMobile ? styles.colorInputMobile : styles.colorInputDesktop}`}
                                    />
                                </div>
                                <div>
                                    <label className={styles.inputLabel}>
                                        Secondary Color <span className={styles.subText}>(SMART ring fill)</span>
                                    </label>
                                    <input
                                        type="color"
                                        value={current.secondary_color || current.color || '#000000'}
                                        onChange={(e) => handleChange(level.id, 'secondary_color', e.target.value)}
                                        className={`${styles.colorInput} ${isMobile ? styles.colorInputMobile : styles.colorInputDesktop}`}
                                    />
                                </div>
                            </div>

                            {/* Behavior Toggles */}
                            <div className={styles.behaviorControls}>
                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={current.allow_manual_completion ?? true}
                                        onChange={(e) => handleChange(level.id, 'allow_manual_completion', e.target.checked)}
                                        className={styles.pointer}
                                    />
                                    Allow Manual Completion
                                </label>

                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={current.track_activities ?? true}
                                        onChange={(e) => handleChange(level.id, 'track_activities', e.target.checked)}
                                        className={styles.pointer}
                                    />
                                    Support Activity Tracking
                                </label>

                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={current.requires_smart ?? false}
                                        onChange={(e) => handleChange(level.id, 'requires_smart', e.target.checked)}
                                        className={styles.pointer}
                                    />
                                    Requires SMART Metrics
                                </label>

                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={current.auto_complete_when_children_done ?? false}
                                        onChange={(e) => handleChange(level.id, 'auto_complete_when_children_done', e.target.checked)}
                                        className={styles.pointer}
                                    />
                                    Auto-Complete When Children Done
                                </label>

                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={current.can_have_targets ?? true}
                                        onChange={(e) => handleChange(level.id, 'can_have_targets', e.target.checked)}
                                        className={styles.pointer}
                                    />
                                    Can Have Targets
                                </label>


                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={current.description_required ?? false}
                                        onChange={(e) => handleChange(level.id, 'description_required', e.target.checked)}
                                        className={styles.pointer}
                                    />
                                    Description Required
                                </label>
                            </div>

                            {/* Value + Unit Controls */}
                            <div className={styles.valueUnitControls}>
                                <div>
                                        <label className={styles.inputLabelSecondary}>
                                            Deadline Range
                                        </label>
                                        <div className={styles.flexAlignCenter}>
                                            <input
                                                type="number"
                                                placeholder="Min"
                                                min="0"
                                                value={current.deadline_min_value ?? ''}
                                                onChange={(e) => handleChange(level.id, 'deadline_min_value', e.target.value ? parseInt(e.target.value) : null)}
                                                className={`${styles.numberInput} ${styles.smallNumberInput}`}
                                            />
                                            <select
                                                value={current.deadline_min_unit ?? 'days'}
                                                onChange={(e) => handleChange(level.id, 'deadline_min_unit', e.target.value)}
                                                className={`${styles.selectInput} ${styles.selectInputSmall}`}
                                            >
                                                {DEADLINE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                            </select>
                                            <span className={styles.inputLabelMuted} style={{ marginBottom: 0 }}>to</span>
                                            <input
                                                type="number"
                                                placeholder="Max"
                                                min="0"
                                                value={current.deadline_max_value ?? ''}
                                                onChange={(e) => handleChange(level.id, 'deadline_max_value', e.target.value ? parseInt(e.target.value) : null)}
                                                className={`${styles.numberInput} ${styles.smallNumberInput}`}
                                            />
                                            <select
                                                value={current.deadline_max_unit ?? 'days'}
                                                onChange={(e) => handleChange(level.id, 'deadline_max_unit', e.target.value)}
                                                className={`${styles.selectInput} ${styles.selectInputSmall}`}
                                            >
                                                {DEADLINE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                <div>
                                    <label className={styles.inputLabelSecondary}>
                                        Max Children <span className={styles.subText}>(blank = unlimited)</span>
                                    </label>
                                    <input
                                        type="number"
                                        placeholder="∞"
                                        min="0"
                                        value={current.max_children ?? ''}
                                        onChange={(e) => handleChange(level.id, 'max_children', e.target.value ? parseInt(e.target.value) : null)}
                                        className={`${styles.numberInput} ${styles.mediumNumberInput}`}
                                    />
                                </div>
                                <div>
                                        <label className={styles.inputLabelSecondary}>
                                            Default Deadline Offset
                                        </label>
                                        <div className={styles.flexAlignCenter}>
                                            <input
                                                type="number"
                                                placeholder="—"
                                                min="0"
                                                value={current.default_deadline_offset_value ?? ''}
                                                onChange={(e) => handleChange(level.id, 'default_deadline_offset_value', e.target.value ? parseInt(e.target.value) : null)}
                                                className={`${styles.numberInput} ${styles.smallNumberInput}`}
                                            />
                                            <select
                                                value={current.default_deadline_offset_unit ?? 'days'}
                                                onChange={(e) => handleChange(level.id, 'default_deadline_offset_unit', e.target.value)}
                                                className={`${styles.selectInput} ${styles.selectInputSmall}`}
                                            >
                                                {DEADLINE_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                <div>
                                    <label className={styles.inputLabelSecondary}>
                                        Sort Children By
                                    </label>
                                    <select
                                        value={current.sort_children_by ?? ''}
                                        onChange={(e) => handleChange(level.id, 'sort_children_by', e.target.value || null)}
                                        className={styles.selectInput}
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

const CompletedGoalSettingsCard = ({ user, setUser, animatedIcons, isMobile }) => {
    const prefs = user?.preferences || {};
    const [edits, setEdits] = useState({});

    const currentPrimary = edits.completed_primary_color ?? prefs.completed_primary_color ?? '#4caf50';
    const currentSecondary = edits.completed_secondary_color ?? prefs.completed_secondary_color ?? '#2e7d32';

    const hasUnsavedChanges = Object.keys(edits).length > 0;
    const isCustomized = prefs.completed_primary_color || prefs.completed_secondary_color;

    const handleSave = async () => {
        try {
            const res = await authApi.updatePreferences({ preferences: edits });
            setUser(res.data);
            notify.success('Completed goal colors saved.');
            setEdits({});
        } catch (error) {
            console.error(error);
            notify.error(`Failed to save settings: ${formatError(error)}`);
        }
    };

    const handleReset = async () => {
        if (!window.confirm("Restore completed goals to default green colors?")) return;
        try {
            // Nullifying them will make the app fall back to default
            const changes = { completed_primary_color: null, completed_secondary_color: null };
            const res = await authApi.updatePreferences({ preferences: changes });
            setUser(res.data);
            notify.success('Reset to defaults.');
            setEdits({});
        } catch (error) {
            notify.error(`Failed to reset colors: ${formatError(error)}`);
        }
    };

    return (
        <div className={styles.levelCard}>
            <div className={styles.levelHeaderRow}>
                <div className={styles.levelHeaderTitle}>
                    {animatedIcons ? (
                        <AnimatedGoalIcon
                            shape="check"
                            color={currentPrimary}
                            secondaryColor={currentSecondary}
                            isSmart={true}
                            size={32}
                        />
                    ) : (
                        <GoalIcon
                            shape="check"
                            color={currentPrimary}
                            secondaryColor={currentSecondary}
                            isSmart={true}
                            size={24}
                        />
                    )}
                    Completed Goals
                    {isCustomized && (
                        <span className={styles.customizedBadge}>
                            Customized
                        </span>
                    )}
                </div>

                <div className={styles.buttonGroup}>
                    {isCustomized && (
                        <button
                            onClick={handleReset}
                            className={styles.restoreButton}
                        >
                            Restore Default
                        </button>
                    )}
                    {hasUnsavedChanges && (
                        <button
                            onClick={handleSave}
                            className={styles.saveButton}
                        >
                            Save Changes
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.settingsGroup}>
                <p className={styles.inputLabelSecondary}>
                    Select the colors used for all completed goals and their connections in the FlowTree.
                </p>
                <div className={styles.flexRowWrap}>
                    <div>
                        <label className={styles.inputLabel}>
                            Primary Color
                        </label>
                        <input
                            type="color"
                            value={currentPrimary}
                            onChange={(e) => setEdits(prev => ({ ...prev, completed_primary_color: e.target.value }))}
                            className={`${styles.colorInput} ${isMobile ? styles.colorInputMobile : styles.colorInputDesktop}`}
                        />
                    </div>
                    <div>
                        <label className={styles.inputLabel}>
                            Secondary Color <span className={styles.subText}>(SMART ring fill)</span>
                        </label>
                        <input
                            type="color"
                            value={currentSecondary}
                            onChange={(e) => setEdits(prev => ({ ...prev, completed_secondary_color: e.target.value }))}
                            className={`${styles.colorInput} ${isMobile ? styles.colorInputMobile : styles.colorInputDesktop}`}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GoalCharacteristicsSettings;
