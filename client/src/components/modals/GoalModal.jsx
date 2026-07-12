import React, { useEffect, useRef, useState } from 'react';
import { getTypeDisplayName, getChildType } from '../../utils/goalHelpers';
import { validateDeadlineRange, getDurationInDays } from '../../utils/goalCharacteristics';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Input from '../atoms/Input';
import Button from '../atoms/Button';
import GoalIcon from '../atoms/GoalIcon';
import AnimatedGoalIcon from '../atoms/AnimatedGoalIcon';
import SmartBadge from '../atoms/SmartBadge';
import notify from '../../utils/notify';
import { ICON_SHAPES } from '../../utils/goalCharacteristics';
import { createRandomLevelColors, createRandomLevelIcons } from '../../utils/goalLevelRandomization';
import styles from './GoalModal.module.css';

const ROOT_GOAL_OPTIONS = [
    { type: 'UltimateGoal', label: 'Ultimate', icon: 'twelve-point-star', description: 'Self-actualization—who you want to become. Often takes years or a lifetime.' },
    { type: 'LongTermGoal', label: 'Long Term', icon: 'hexagon', description: 'An ambitious goal well outside your current reach. Expect a long road spanning months to years.' },
    { type: 'MidTermGoal', label: 'Medium Term', icon: 'diamond', description: 'The next major challenge on the horizon—an important, satisfying milestone requiring weeks to months of effort.' },
];

// Short Term roots are intentionally not offered, but the level still exists inside
// every fractal and the backend requires all four level styles, so it stays in the
// shuffled/submitted style set without a visible card.
const HIDDEN_STYLED_LEVELS = [
    { type: 'ShortTermGoal', icon: 'circle' },
];
const STYLED_LEVELS = [...ROOT_GOAL_OPTIONS, ...HIDDEN_STYLED_LEVELS];

function createInitialLevelStyles(parent, getGoalColor, getGoalSecondaryColor) {
    const colors = parent ? null : createRandomLevelColors(STYLED_LEVELS);
    const icons = parent ? null : createRandomLevelIcons(STYLED_LEVELS);
    return Object.fromEntries(STYLED_LEVELS.map((option) => [option.type, {
        color: colors?.[option.type]?.color || getGoalColor(option.type),
        secondary_color: colors?.[option.type]?.secondary_color || getGoalSecondaryColor(option.type),
        icon: icons?.[option.type] || option.icon,
    }]));
}

function getDefaultDeadline(getLevelCharacteristics, levelType) {
    const levelChars = getLevelCharacteristics(levelType);
    if (!levelChars?.default_deadline_offset_value || !levelChars?.default_deadline_offset_unit) {
        return '';
    }

    const offsetDays = getDurationInDays(
        levelChars.default_deadline_offset_value,
        levelChars.default_deadline_offset_unit
    );
    if (!offsetDays) {
        return '';
    }

    const nextDeadline = new Date();
    nextDeadline.setDate(nextDeadline.getDate() + Math.ceil(offsetDays));
    return nextDeadline.toISOString().split('T')[0];
}

function getContrastingTextColor(color) {
    const hex = color.replace('#', '');
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    return ((red * 299) + (green * 587) + (blue * 114)) / 1000 >= 128
        ? '#1a1a1a'
        : '#FFFFFF';
}

function buildInitialModalState(parent, getLevelCharacteristics) {
    if (!parent) {
        return {
            goalType: 'UltimateGoal',
            deadline: '',
        };
    }

    const parentType = parent.attributes?.type || parent.type;
    const childType = getChildType(parentType) || 'UltimateGoal';
    const parentDeadline = parent.attributes?.deadline || parent.deadline;

    return {
        goalType: childType,
        deadline: parentDeadline ? parentDeadline.split('T')[0] : getDefaultDeadline(getLevelCharacteristics, childType),
    };
}

function GoalModalInner({ onClose, onSubmit, parent }) {
    const { getGoalColor, getGoalTextColor, getGoalSecondaryColor, getGoalIcon, getDeadlineConstraints, getLevelCharacteristics } = useGoalLevels();
    const initialState = buildInitialModalState(parent, getLevelCharacteristics);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [relevanceStatement, setRelevanceStatement] = useState('');
    const [deadline, setDeadline] = useState(initialState.deadline);
    const [goalType, setGoalType] = useState(initialState.goalType);
    const [guidanceType, setGuidanceType] = useState(initialState.goalType);
    const [previewSmart, setPreviewSmart] = useState(false);
    const [openIconPickerType, setOpenIconPickerType] = useState(null);
    const iconPickerRef = useRef(null);
    const [levelStyles, setLevelStyles] = useState(() => (
        createInitialLevelStyles(parent, getGoalColor, getGoalSecondaryColor)
    ));
    const [targets] = useState([]);

    useEffect(() => {
        if (!openIconPickerType) return undefined;
        const closeOnOutsideClick = (event) => {
            if (!iconPickerRef.current?.contains(event.target)) setOpenIconPickerType(null);
        };
        const closeOnEscape = (event) => {
            if (event.key !== 'Escape') return;
            // Capture-phase stop so closing the tray does not also close the modal.
            event.stopPropagation();
            setOpenIconPickerType(null);
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape, true);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape, true);
        };
    }, [openIconPickerType]);

    // Handle initial deadline auto-filling and characteristics sync
    const chars = getLevelCharacteristics(goalType);
    const descriptionRequired = Boolean(parent && chars?.description_required);

    const handleGoalTypeChange = (event) => {
        selectGoalType(event.target.value);
    };

    const selectGoalType = (nextType) => {
        setGoalType(nextType);
        setGuidanceType(nextType);
        setOpenIconPickerType((current) => (current && current !== nextType ? null : current));
    };

    const handleLevelColorChange = (type, color) => {
        setLevelStyles((current) => ({ ...current, [type]: { ...current[type], color } }));
    };

    const updateLevelStyle = (type, changes) => {
        setLevelStyles((current) => ({ ...current, [type]: { ...current[type], ...changes } }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // Validate deadline against DB-driven level constraints (value + unit)
        if (deadline) {
            const { minValue, minUnit, maxValue, maxUnit } = getDeadlineConstraints(goalType);
            const minDays = (minValue != null && minUnit) ? getDurationInDays(minValue, minUnit) : null;
            const maxDays = (maxValue != null && maxUnit) ? getDurationInDays(maxValue, maxUnit) : null;
            const validation = validateDeadlineRange(deadline, minDays, maxDays);
            if (!validation.isValid) {
                notify.error(validation.message);
                return;
            }
        }

        onSubmit({
            name,
            description,
            relevance_statement: relevanceStatement,
            deadline: deadline || null,
            type: goalType,
            parent_id: parent ? (parent.attributes?.id || parent.id) : null,
            targets,
            ...(!parent ? { level_styles: levelStyles } : {})
        });
    };

    const themeColor = parent ? getGoalColor(goalType) : levelStyles[goalType].color;
    const textColor = parent ? getGoalTextColor(goalType) : getContrastingTextColor(levelStyles[goalType].color);
    const trimmedName = name.trim();
    const displayName = trimmedName.length > 32 ? `${trimmedName.slice(0, 32).trimEnd()}…` : trimmedName;
    const modalTitle = parent
        ? `Add ${getTypeDisplayName(goalType)}`
        : (displayName ? `Create: ${displayName}` : 'Create New Fractal');

    const selectedRootIndex = ROOT_GOAL_OPTIONS.findIndex((option) => option.type === goalType);
    const guidanceIndex = ROOT_GOAL_OPTIONS.findIndex((option) => option.type === guidanceType);
    const guidanceAboveRoot = guidanceIndex !== -1 && guidanceIndex < selectedRootIndex;
    const guidanceText = guidanceAboveRoot
        ? `Unavailable — a fractal can't contain goal levels above its ${ROOT_GOAL_OPTIONS[selectedRootIndex].label} Goal root.`
        : ROOT_GOAL_OPTIONS.find((option) => option.type === guidanceType)?.description;

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title={modalTitle}
            size={parent ? 'md' : 'lg'}
        >
            <form onSubmit={handleSubmit} className={styles.form}>
                <ModalBody>
                  <div className={styles.fields}>
                    <div className={styles.typeAndColorRow}>
                      <div className={styles.formGroup}>
                        <label htmlFor="goal-type-select" className={styles.label}>Goal Type</label>
                        {parent ? (
                            <div>
                                <div
                                    className={styles.readOnlyType}
                                    style={{ background: themeColor, color: textColor, display: 'flex', alignItems: 'center', gap: '8px' }}
                                >
                                    <GoalIcon
                                        shape={getGoalIcon(goalType)}
                                        color={textColor}
                                        size={18}
                                    />
                                    {getTypeDisplayName(goalType)}
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className={styles.goalTypePicker} role="radiogroup" aria-label="Goal Type">
                                    {ROOT_GOAL_OPTIONS.map((option, index) => {
                                        const selected = goalType === option.type;
                                        const aboveRoot = index < selectedRootIndex;
                                        const PreviewIcon = previewSmart ? AnimatedGoalIcon : GoalIcon;
                                        return (
                                            <div
                                                key={option.type}
                                                ref={openIconPickerType === option.type ? iconPickerRef : null}
                                                className={`${styles.goalTypeOption} ${selected ? styles.goalTypeOptionSelected : ''} ${aboveRoot ? styles.goalTypeOptionAboveRoot : ''} ${openIconPickerType === option.type ? styles.goalTypeOptionTrayOpen : ''}`}
                                                style={{ '--level-color': levelStyles[option.type].color }}
                                                onClick={(event) => {
                                                    if (event.target.closest('input, select, button')) return;
                                                    selectGoalType(option.type);
                                                }}
                                                onMouseEnter={() => setGuidanceType(option.type)}
                                                onMouseLeave={() => setGuidanceType(goalType)}
                                            >
                                                <button type="button" className={styles.iconPickerTrigger}
                                                    onClick={() => {
                                                        if (!selected) {
                                                            selectGoalType(option.type);
                                                            return;
                                                        }
                                                        setOpenIconPickerType((current) => current === option.type ? null : option.type);
                                                    }}
                                                    aria-label={`Choose ${option.label} icon`} aria-expanded={openIconPickerType === option.type}>
                                                    <PreviewIcon shape={levelStyles[option.type].icon} color={levelStyles[option.type].color}
                                                        secondaryColor={levelStyles[option.type].secondary_color}
                                                        isSmart={previewSmart} size={54} />
                                                </button>
                                                <label className={styles.goalTypeChoice} onFocus={() => setGuidanceType(option.type)}>
                                                    <input type="radio" name="goal-type" value={option.type} checked={selected}
                                                        onChange={handleGoalTypeChange} aria-describedby="goal-type-guidance"
                                                        className={styles.visuallyHidden} required />
                                                    <span className={styles.goalTypeName} style={{
                                                        backgroundColor: levelStyles[option.type].color,
                                                        color: getContrastingTextColor(levelStyles[option.type].color),
                                                    }}>{option.label} Goal</span>
                                                </label>
                                                <div className={styles.swatches}>
                                                    <input type="color" value={levelStyles[option.type].color}
                                                        onChange={(event) => handleLevelColorChange(option.type, event.target.value)}
                                                        className={styles.swatchInput} aria-label={`${option.label} color`} />
                                                    <input type="color" value={levelStyles[option.type].secondary_color}
                                                        onChange={(event) => updateLevelStyle(option.type, { secondary_color: event.target.value })}
                                                        className={`${styles.swatchInput} ${styles.swatchInputSecondary}`}
                                                        aria-label={`${option.label} secondary color`} />
                                                </div>
                                                {openIconPickerType === option.type && (
                                                    <div className={styles.shapeTray} role="listbox" aria-label={`${option.label} icon choices`}>
                                                        {ICON_SHAPES.map((shape) => <button type="button" key={shape.value}
                                                            className={`${styles.shapeTrayOption} ${levelStyles[option.type].icon === shape.value ? styles.shapeTrayOptionSelected : ''}`}
                                                            onClick={() => { updateLevelStyle(option.type, { icon: shape.value }); setOpenIconPickerType(null); }}
                                                            aria-label={shape.label} aria-selected={levelStyles[option.type].icon === shape.value} role="option">
                                                            <GoalIcon shape={shape.value} color={levelStyles[option.type].color} size={24} />
                                                        </button>)}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <p id="goal-type-guidance" className={styles.goalTypeGuidance} aria-live="polite"
                                    style={{ borderLeftColor: guidanceAboveRoot ? 'var(--color-text-muted)' : levelStyles[guidanceType]?.color }}>
                                    {guidanceText}
                                </p>
                            </>
                        )}
                      </div>
                      {!parent && (
                        <div className={styles.utilityRow}>
                            <Button type="button" size="sm" variant="secondary" onClick={() => {
                                const colors = createRandomLevelColors(STYLED_LEVELS);
                                setLevelStyles((current) => Object.fromEntries(Object.entries(current).map(([type, style]) => [type, { ...style, ...colors[type] }])));
                            }}
                                className={styles.randomizeButton} aria-label="Randomize all goal level colors">
                                Shuffle Colors
                            </Button>
                            <Button type="button" size="sm" variant="secondary" onClick={() => {
                                const icons = createRandomLevelIcons(STYLED_LEVELS);
                                setLevelStyles((current) => Object.fromEntries(Object.entries(current).map(([type, style]) => [type, { ...style, icon: icons[type] }])));
                            }} className={styles.randomizeButton} aria-label="Randomize all goal level icons">
                                Shuffle Icons
                            </Button>
                            <button type="button"
                                onMouseEnter={() => setPreviewSmart(true)} onMouseLeave={() => setPreviewSmart(false)}
                                onFocus={() => setPreviewSmart(true)} onBlur={() => setPreviewSmart(false)}
                                className={styles.smartPreviewButton} aria-label="Preview SMART goal styling">
                                <SmartBadge color={levelStyles[goalType].color} />
                            </button>
                        </div>
                      )}
                      {!parent && (
                        <div className={styles.rootActions}>
                            <Button type="submit" fullWidth style={{ background: themeColor, color: textColor, borderColor: themeColor }}>
                                Create this Fractal Goal
                            </Button>
                        </div>
                      )}
                    </div>

                    <div className={styles.formColumn}>
                    <div className={styles.formGroup}>
                        <label htmlFor="goal-name" className={styles.label}>Name (Required)</label>
                        <Input
                            id="goal-name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            required
                            autoFocus
                            placeholder="Enter goal name..."
                            fullWidth
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="goal-description" className={styles.label}>
                            Description {!descriptionRequired && <span className={styles.optionalLabel}>Optional</span>}
                            {descriptionRequired && <span style={{ color: 'var(--color-brand-danger)' }}>*</span>}
                        </label>
                        <textarea
                            id="goal-description"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="What is this goal about?"
                            rows={2}
                            className={styles.textarea}
                            required={descriptionRequired}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="goal-relevance" className={styles.label}>
                            Relevance <span className={styles.optionalLabel}>Optional</span>
                        </label>
                        <div className={styles.descriptionLabel}>
                            {!parent
                                ? `Why does ${name || 'this goal'} matter?`
                                : `How does this help achieve "${parent.name}"?`
                            }
                        </div>
                        <textarea
                            id="goal-relevance"
                            value={relevanceStatement}
                            onChange={e => setRelevanceStatement(e.target.value)}
                            placeholder={!parent ? "Explain the significance..." : "Explain the contribution..."}
                            rows={2}
                            className={styles.textarea}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="goal-deadline" className={styles.label}>
                            Deadline <span className={styles.optionalLabel}>Optional</span>
                        </label>
                        <Input
                            type="date"
                            id="goal-deadline"
                            value={deadline}
                            onChange={e => setDeadline(e.target.value)}
                            max={parent?.attributes?.deadline?.split('T')[0] || parent?.deadline?.split('T')[0]}
                            fullWidth
                        />
                    </div>
                    </div>
                  </div>
                </ModalBody>

                {parent && <ModalFooter>
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        type="button"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        style={{
                            background: themeColor,
                            color: textColor,
                            borderColor: themeColor
                        }}
                    >
                        Create
                    </Button>
                </ModalFooter>}
            </form>
        </Modal>
    );
};

const GoalModal = ({ isOpen, onClose, onSubmit, parent }) => {
    if (!isOpen) {
        return null;
    }

    const modalKey = parent ? (parent.attributes?.id || parent.id || 'parent-goal') : 'fractal-root';
    return (
        <GoalModalInner
            key={modalKey}
            onClose={onClose}
            onSubmit={onSubmit}
            parent={parent}
        />
    );
};

export default GoalModal;
