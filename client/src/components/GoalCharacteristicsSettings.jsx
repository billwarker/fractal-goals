import React, { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useGoals } from '../contexts/GoalsContext';
import GoalIcon from './atoms/GoalIcon';
import { ICON_SHAPES, DEADLINE_UNITS } from '../utils/goalCharacteristics';

const GoalCharacteristicsSettings = ({ scope = 'default' }) => {
    const {
        goalColors,
        setGoalColor,
        resetGoalColors,
        goalCharacteristics,
        setGoalCharacteristic,
        resetGoalCharacteristics
    } = useTheme();

    const { fractals } = useGoals();

    const activeFractalName = React.useMemo(() => {
        if (scope === 'default') return 'Global Defaults';
        const f = fractals.find(fr => fr.id === scope);
        return f ? f.name : 'This Fractal';
    }, [scope, fractals]);

    // Helper to get data for current scope with fallback to default
    const getDisplayData = (goalType) => {
        const defaultChar = goalCharacteristics.default[goalType];
        const defaultColor = goalColors.default[goalType];

        if (scope === 'default') {
            return { char: defaultChar, color: defaultColor, isOverridden: false };
        }

        const scopedChar = goalCharacteristics.fractals[scope]?.[goalType];
        const scopedColor = goalColors.fractals[scope]?.[goalType];

        return {
            char: scopedChar ? { ...defaultChar, ...scopedChar } : defaultChar,
            color: scopedColor ? { ...defaultColor, ...scopedColor } : defaultColor,
            isOverridden: !!(scopedChar || scopedColor)
        };
    };

    const formatGoalType = (type) => {
        return type.replace(/([A-Z])/g, ' $1').trim();
    };

    const handleDeadlineChange = (goalType, type, field, value) => {
        // type: 'min' or 'max', field: 'value' or 'unit'
        const baseChar = goalCharacteristics.fractals[scope]?.[goalType] || goalCharacteristics.default[goalType];
        const currentDeadlines = { ...baseChar.deadlines };
        currentDeadlines[type] = {
            ...currentDeadlines[type],
            [field]: field === 'value' ? parseInt(value) || 0 : value
        };
        setGoalCharacteristic(goalType, 'deadlines', currentDeadlines, scope);
    };

    const handleCompletionChange = (goalType, method, checked) => {
        const baseChar = goalCharacteristics.fractals[scope]?.[goalType] || goalCharacteristics.default[goalType];
        const currentMethods = { ...baseChar.completion_methods };
        currentMethods[method] = checked;
        setGoalCharacteristic(goalType, 'completion_methods', currentMethods, scope);
    };

    const GOAL_TYPE_ORDER = [
        'UltimateGoal',
        'LongTermGoal',
        'MidTermGoal',
        'ShortTermGoal',
        'ImmediateGoal',
        'MicroGoal',
        'NanoGoal'
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {scope !== 'default' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={() => {
                            if (window.confirm(`Reset overrides for this fractal and inherit from Global Defaults?`)) {
                                resetGoalColors(scope);
                                resetGoalCharacteristics(scope);
                            }
                        }}
                        style={{
                            fontSize: '12px',
                            background: 'var(--color-bg-input)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-primary)',
                            padding: '6px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <span style={{ color: 'var(--color-brand-danger)' }}>↺</span> Reset to Defaults
                    </button>
                </div>
            )}

            {GOAL_TYPE_ORDER.map((type) => {
                const { char, color, isOverridden } = getDisplayData(type);
                if (!char) return null;
                return (
                    <div
                        key={type}
                        style={{
                            padding: '16px',
                            border: '1px solid var(--color-border)',
                            borderRadius: '8px',
                            backgroundColor: 'var(--color-bg-card-alt)'
                        }}
                    >
                        <div style={{
                            marginBottom: '16px',
                            fontWeight: 'bold',
                            color: 'var(--color-text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <GoalIcon
                                    shape={char.icon}
                                    color={color?.primary || 'var(--color-primary)'}
                                    size={24}
                                />
                                {formatGoalType(type)}
                            </div>
                            {scope !== 'default' && (
                                <span style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    borderRadius: '10px',
                                    backgroundColor: isOverridden ? 'rgba(58, 134, 255, 0.1)' : 'rgba(0,0,0,0.05)',
                                    color: isOverridden ? 'var(--color-brand-primary)' : 'var(--color-text-muted)',
                                    border: `1px solid ${isOverridden ? 'var(--color-brand-primary)' : 'var(--color-border)'}`
                                }}>
                                    {isOverridden ? 'Override' : 'Inherited'}
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Icon Selection */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                                    Shape
                                </label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {ICON_SHAPES.map(s => (
                                        <button
                                            key={s.value}
                                            onClick={() => setGoalCharacteristic(type, 'icon', s.value, scope)}
                                            style={{
                                                padding: '8px',
                                                borderRadius: '4px',
                                                border: '1px solid',
                                                borderColor: char.icon === s.value ? (color?.primary || 'var(--color-brand-primary)') : 'var(--color-border)',
                                                backgroundColor: char.icon === s.value ? 'rgba(0,0,0,0.1)' : 'transparent',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                            title={s.label}
                                        >
                                            <GoalIcon
                                                shape={s.value}
                                                color={char.icon === s.value ? (color?.primary || 'var(--color-brand-primary)') : 'var(--color-text-muted)'}
                                                size={20}
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Colors */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                                    Colors
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: 'var(--color-text-muted)' }}>Primary</label>
                                        <input
                                            type="color"
                                            value={color?.primary || '#000000'}
                                            onChange={(e) => setGoalColor(type, 'primary', e.target.value, scope)}
                                            style={{ width: '100%', height: '32px', padding: 0, border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: 'var(--color-text-muted)' }}>Secondary</label>
                                        <input
                                            type="color"
                                            value={color?.secondary || '#000000'}
                                            onChange={(e) => setGoalColor(type, 'secondary', e.target.value, scope)}
                                            style={{ width: '100%', height: '32px', padding: 0, border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Relative Deadlines */}
                            {type !== 'MicroGoal' && type !== 'NanoGoal' ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    {['min', 'max'].map(limitType => (
                                        <div key={limitType}>
                                            <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                                                {limitType.charAt(0).toUpperCase() + limitType.slice(1)} Relative Deadline
                                            </label>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <input
                                                    type="number"
                                                    value={char.deadlines[limitType].value}
                                                    onChange={(e) => handleDeadlineChange(type, limitType, 'value', e.target.value)}
                                                    style={{
                                                        width: '60px',
                                                        padding: '6px',
                                                        borderRadius: '4px',
                                                        border: '1px solid var(--color-border)',
                                                        backgroundColor: 'var(--color-bg-input)',
                                                        color: 'var(--color-text-primary)'
                                                    }}
                                                />
                                                <select
                                                    value={char.deadlines[limitType].unit}
                                                    onChange={(e) => handleDeadlineChange(type, limitType, 'unit', e.target.value)}
                                                    style={{
                                                        flex: 1,
                                                        padding: '6px',
                                                        borderRadius: '4px',
                                                        border: '1px solid var(--color-border)',
                                                        backgroundColor: 'var(--color-bg-input)',
                                                        color: 'var(--color-text-primary)'
                                                    }}
                                                >
                                                    {DEADLINE_UNITS.map(u => (
                                                        <option key={u.value} value={u.value}>{u.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{
                                    padding: '8px 12px',
                                    backgroundColor: 'var(--color-bg-primary)',
                                    border: '1px dashed var(--color-border)',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    color: 'var(--color-text-muted)',
                                    fontStyle: 'italic'
                                }}>
                                    Ephemeral Goal: Deadlines are not applicable to {formatGoalType(type)}s.
                                </div>
                            )}

                            {/* Completion Methods */}
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                                    Valid Completion Methods
                                </label>
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    {Object.entries(char.completion_methods)
                                        .filter(([method]) => {
                                            if (type === 'NanoGoal') return method === 'manual';
                                            if (type === 'MicroGoal') return method !== 'children';
                                            return true;
                                        })
                                        .map(([method, enabled]) => (
                                            <label key={method} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={enabled}
                                                    onChange={(e) => handleCompletionChange(type, method, e.target.checked)}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                {method.charAt(0).toUpperCase() + method.slice(1)}
                                            </label>
                                        ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })}
        </div>
    );
};

export default GoalCharacteristicsSettings;
