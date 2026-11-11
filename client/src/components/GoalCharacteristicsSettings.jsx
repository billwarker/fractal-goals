import React, { useState } from 'react';
import { useGoalLevels } from '../contexts/GoalLevelsContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import GoalIcon from './atoms/GoalIcon';
import Button from './atoms/Button';
import ChevronIcon from './atoms/ChevronIcon';
import Switch from './atoms/Switch';
import GoalLevelReviewSettings from './GoalLevelReviewSettings';
import AnimatedGoalIcon from './atoms/AnimatedGoalIcon';
import { SettingsRow, rowDescriptionId } from './settings/SettingsSection';
import { ICON_SHAPES, DEADLINE_UNITS } from '../utils/goalCharacteristics';
import { authApi } from '../utils/api';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import controls from './settings/SettingsControls.module.css';
import styles from './GoalCharacteristicsSettings.module.css';
import { logError } from '../utils/logger';
import LoadingState from './common/LoadingState';

const parseCount = (value) => (value ? parseInt(value, 10) : null);

function LevelIcon({ shape, color, secondaryColor }) {
    const { animatedIcons } = useTheme();
    const Icon = animatedIcons ? AnimatedGoalIcon : GoalIcon;
    return <Icon shape={shape} color={color} secondaryColor={secondaryColor} isSmart size={22} />;
}

/** A level's settings in a collapsible panel; unsaved edits are flagged in its header. */
function LevelPanel({ title, icon, customized, dirty, onSave, onReset, defaultOpen = false, children }) {
    return (
        <details className={styles.level} open={defaultOpen || undefined}>
            <summary className={styles.levelSummary}>
                {icon}
                <span className={styles.levelName}>{title}</span>
                {customized && <span className={styles.badge}>Customized</span>}
                {dirty && <span className={styles.unsaved}>Unsaved changes</span>}
                <ChevronIcon className={styles.levelChevron} size={14} aria-hidden="true" />
            </summary>
            <div className={styles.levelBody}>
                {children}
                <div className={styles.levelActions}>
                    {customized && (
                        <Button variant="secondary" size="sm" onClick={onReset}>Restore default</Button>
                    )}
                    <Button size="sm" disabled={!dirty} onClick={onSave}>Save changes</Button>
                </div>
            </div>
        </details>
    );
}

function Group({ title, children }) {
    return (
        <div className={styles.group}>
            <h5 className={styles.groupTitle}>{title}</h5>
            {children}
        </div>
    );
}

function ColorPair({ idPrefix, primary, secondary, onPrimary, onSecondary }) {
    return (
        <span className={styles.colors}>
            <label className={styles.color}>
                <input id={`${idPrefix}-color`} type="color" value={primary} onChange={(event) => onPrimary(event.target.value)} />
                <span>Main</span>
            </label>
            <label className={styles.color}>
                <input type="color" value={secondary} onChange={(event) => onSecondary(event.target.value)} />
                <span>Ring</span>
            </label>
        </span>
    );
}

function AmountWithUnit({ id, describedBy, value, unit, placeholder, onValue, onUnit, unitLabel }) {
    return (
        <span className={styles.amount}>
            <input
                id={id}
                aria-describedby={describedBy}
                type="number"
                inputMode="numeric"
                min="0"
                placeholder={placeholder}
                value={value ?? ''}
                onChange={(event) => onValue(parseCount(event.target.value))}
                className={`${controls.input} ${controls.number}`}
            />
            <select
                aria-label={unitLabel}
                value={unit ?? 'days'}
                onChange={(event) => onUnit(event.target.value)}
                className={`${controls.select} ${styles.unit}`}
            >
                {DEADLINE_UNITS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        </span>
    );
}

function LevelSettings({ level, edits, onChange, onSave, onReset }) {
    const current = { ...level, ...(edits || {}) };
    const id = `level-${level.id}`;
    const set = (field) => (value) => onChange(level.id, field, value);
    const color = current.color || '#4f9cf9';

    return (
        <LevelPanel
            title={current.name}
            icon={<LevelIcon shape={current.icon || 'circle'} color={color} secondaryColor={current.secondary_color || undefined} />}
            customized={level.owner_id !== null}
            dirty={Boolean(edits && Object.keys(edits).length)}
            onSave={() => onSave(level.id)}
            onReset={() => onReset(level.id)}
        >
            <Group title="Appearance">
                <SettingsRow label="Shape" stacked>
                    <div className={styles.shapes} role="radiogroup" aria-label={`${current.name} shape`}>
                        {ICON_SHAPES.map((shape) => {
                            const selected = current.icon === shape.value;
                            return (
                                <button
                                    key={shape.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={selected}
                                    aria-label={shape.label}
                                    title={shape.label}
                                    className={styles.shape}
                                    style={selected ? { '--shape-color': color } : undefined}
                                    onClick={() => set('icon')(shape.value)}
                                >
                                    <GoalIcon shape={shape.value} color={selected ? color : 'var(--color-text-muted)'} size={18} />
                                </button>
                            );
                        })}
                    </div>
                </SettingsRow>
                <SettingsRow label="Colours" description="The icon, and the fill of its SMART ring." controlId={`${id}-color`}>
                    <ColorPair
                        idPrefix={id}
                        primary={color}
                        secondary={current.secondary_color || color}
                        onPrimary={set('color')}
                        onSecondary={set('secondary_color')}
                    />
                </SettingsRow>
            </Group>

            <Group title="Rules">
                <SettingsRow label="Track activities" description="Sessions and activities can count toward these goals." controlId={`${id}-track`}>
                    <Switch id={`${id}-track`} aria-describedby={rowDescriptionId(`${id}-track`)} checked={current.track_activities ?? true} onChange={set('track_activities')} />
                </SettingsRow>
                <SettingsRow label="Require SMART" description="Goals here must meet every SMART criterion." controlId={`${id}-smart`}>
                    <Switch id={`${id}-smart`} aria-describedby={rowDescriptionId(`${id}-smart`)} checked={current.requires_smart ?? false} onChange={set('requires_smart')} />
                </SettingsRow>
                <SettingsRow label="Require a description" controlId={`${id}-description`}>
                    <Switch id={`${id}-description`} checked={current.description_required ?? false} onChange={set('description_required')} />
                </SettingsRow>
            </Group>

            <Group title="Deadlines">
                <SettingsRow label="Allowed deadline" description="How far ahead a deadline can be. Leave blank for no limit." controlId={`${id}-deadline-min`} stacked>
                    <span className={styles.range}>
                        <AmountWithUnit
                            id={`${id}-deadline-min`}
                            describedBy={rowDescriptionId(`${id}-deadline-min`)}
                            value={current.deadline_min_value}
                            unit={current.deadline_min_unit}
                            placeholder="Min"
                            unitLabel="Shortest deadline unit"
                            onValue={set('deadline_min_value')}
                            onUnit={set('deadline_min_unit')}
                        />
                        <span className={styles.to}>to</span>
                        <AmountWithUnit
                            id={`${id}-deadline-max`}
                            value={current.deadline_max_value}
                            unit={current.deadline_max_unit}
                            placeholder="Max"
                            unitLabel="Longest deadline unit"
                            onValue={set('deadline_max_value')}
                            onUnit={set('deadline_max_unit')}
                        />
                    </span>
                </SettingsRow>
                <SettingsRow label="Default deadline" description="Filled in for new goals. Leave blank for none." controlId={`${id}-deadline-default`}>
                    <AmountWithUnit
                        id={`${id}-deadline-default`}
                        describedBy={rowDescriptionId(`${id}-deadline-default`)}
                        value={current.default_deadline_offset_value}
                        unit={current.default_deadline_offset_unit}
                        placeholder="—"
                        unitLabel="Default deadline unit"
                        onValue={set('default_deadline_offset_value')}
                        onUnit={set('default_deadline_offset_unit')}
                    />
                </SettingsRow>
            </Group>

            <Group title="Children">
                <SettingsRow label="Most children" description="Leave blank for no limit." controlId={`${id}-max-children`}>
                    <input
                        id={`${id}-max-children`}
                        aria-describedby={rowDescriptionId(`${id}-max-children`)}
                        type="number"
                        inputMode="numeric"
                        min="0"
                        placeholder="No limit"
                        value={current.max_children ?? ''}
                        onChange={(event) => set('max_children')(parseCount(event.target.value))}
                        className={`${controls.input} ${styles.wideNumber}`}
                    />
                </SettingsRow>
                <SettingsRow label="Sort children by" controlId={`${id}-sort`}>
                    <select
                        id={`${id}-sort`}
                        value={current.sort_children_by ?? ''}
                        onChange={(event) => set('sort_children_by')(event.target.value || null)}
                        className={controls.select}
                    >
                        <option value="">Manual</option>
                        <option value="deadline">Deadline</option>
                        <option value="created_at">Date created</option>
                        <option value="completion_rate">Completion rate</option>
                    </select>
                </SettingsRow>
            </Group>

            <Group title="Reviews">
                <GoalLevelReviewSettings idPrefix={id} current={current} onChange={(field, value) => onChange(level.id, field, value)} />
            </Group>
        </LevelPanel>
    );
}

const GoalCharacteristicsSettings = () => {
    const { goalLevels, updateGoalLevel, resetGoalLevel } = useGoalLevels();
    // Unsaved edits per level, kept until saved.
    const [edits, setEdits] = useState({});

    if (!goalLevels || goalLevels.length === 0) {
        return <LoadingState label="Loading goal levels…" />;
    }

    const editableGoalLevels = goalLevels.filter((level) => level?.name !== 'Completed');

    const handleChange = (levelId, field, value) => {
        setEdits((previous) => ({ ...previous, [levelId]: { ...(previous[levelId] || {}), [field]: value } }));
    };

    const clearEdits = (levelId) => setEdits((previous) => {
        const next = { ...previous };
        delete next[levelId];
        return next;
    });

    const handleSave = async (levelId) => {
        const changes = edits[levelId];
        if (!changes) return;
        try {
            await updateGoalLevel({ id: levelId, updates: changes });
            notify.success('Settings saved.');
            clearEdits(levelId);
        } catch (error) {
            logError(error);
            notify.error(`Failed to save settings: ${formatError(error)}`);
        }
    };

    const handleReset = async (levelId) => {
        if (!window.confirm('Restore this level to the system default characteristics?')) return;
        try {
            await resetGoalLevel(levelId);
            notify.success('Reset to defaults.');
            clearEdits(levelId);
        } catch (error) {
            notify.error(`Failed to reset level: ${formatError(error)}`);
        }
    };

    return (
        <div className={styles.container}>
            {editableGoalLevels.map((level) => (
                <LevelSettings
                    key={level.id}
                    level={level}
                    edits={edits[level.id]}
                    onChange={handleChange}
                    onSave={handleSave}
                    onReset={handleReset}
                />
            ))}
            <CompletedGoalSettings />
        </div>
    );
};

function CompletedGoalSettings() {
    const { user, setUser } = useAuth();
    const prefs = user?.preferences || {};
    const [edits, setEdits] = useState({});

    const currentPrimary = edits.completed_primary_color ?? prefs.completed_primary_color ?? '#4caf50';
    const currentSecondary = edits.completed_secondary_color ?? prefs.completed_secondary_color ?? '#2e7d32';

    const handleSave = async () => {
        try {
            const res = await authApi.updatePreferences({ preferences: edits });
            setUser(res.data);
            notify.success('Completed goal colors saved.');
            setEdits({});
        } catch (error) {
            logError(error);
            notify.error(`Failed to save settings: ${formatError(error)}`);
        }
    };

    const handleReset = async () => {
        if (!window.confirm('Restore completed goals to default green colors?')) return;
        try {
            // Clearing them makes the app fall back to the defaults.
            const res = await authApi.updatePreferences({
                preferences: { completed_primary_color: null, completed_secondary_color: null },
            });
            setUser(res.data);
            notify.success('Reset to defaults.');
            setEdits({});
        } catch (error) {
            notify.error(`Failed to reset colors: ${formatError(error)}`);
        }
    };

    return (
        <LevelPanel
            title="Completed goals"
            icon={<LevelIcon shape="check" color={currentPrimary} secondaryColor={currentSecondary} />}
            customized={Boolean(prefs.completed_primary_color || prefs.completed_secondary_color)}
            dirty={Object.keys(edits).length > 0}
            onSave={handleSave}
            onReset={handleReset}
        >
            <Group title="Appearance">
                <SettingsRow
                    label="Colours"
                    description="Used for every completed goal and its connections in the tree."
                    controlId="level-completed-color"
                >
                    <ColorPair
                        idPrefix="level-completed"
                        primary={currentPrimary}
                        secondary={currentSecondary}
                        onPrimary={(value) => setEdits((previous) => ({ ...previous, completed_primary_color: value }))}
                        onSecondary={(value) => setEdits((previous) => ({ ...previous, completed_secondary_color: value }))}
                    />
                </SettingsRow>
            </Group>
        </LevelPanel>
    );
}

export default GoalCharacteristicsSettings;
