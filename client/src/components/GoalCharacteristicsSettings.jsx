import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import GoalIcon from './atoms/GoalIcon';
import { ICON_SHAPES, DEADLINE_UNITS } from '../utils/goalCharacteristics';

const GoalCharacteristicsSettings = () => {
    const {
        goalColors,
        setGoalColor,
        resetGoalColors,
        goalCharacteristics,
        setGoalCharacteristic
    } = useTheme();

    const formatGoalType = (type) => {
        return type.replace(/([A-Z])/g, ' $1').trim();
    };

    const handleDeadlineChange = (goalType, type, field, value) => {
        // type: 'min' or 'max', field: 'value' or 'unit'
        const currentDeadlines = { ...goalCharacteristics[goalType].deadlines };
        currentDeadlines[type] = {
            ...currentDeadlines[type],
            [field]: field === 'value' ? parseInt(value) || 0 : value
        };
        setGoalCharacteristic(goalType, 'deadlines', currentDeadlines);
    };

    const handleCompletionChange = (goalType, method, checked) => {
        const currentMethods = { ...goalCharacteristics[goalType].completion_methods };
        currentMethods[method] = checked;
        setGoalCharacteristic(goalType, 'completion_methods', currentMethods);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-16px' }}>
                <button
                    onClick={() => {
                        if (window.confirm('Are you sure you want to reset all goal colors to defaults?')) {
                            resetGoalColors();
                        }
                    }}
                    style={{
                        fontSize: '12px',
                        background: 'transparent',
                        border: '1px solid var(--color-brand-danger, #ef4444)',
                        color: 'var(--color-brand-danger, #ef4444)',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Reset Colors to Defaults
                </button>
            </div>
            {Object.entries(goalCharacteristics).map(([type, char]) => (
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
                        gap: '12px'
                    }}>
                        <GoalIcon
                            shape={char.icon}
                            color={goalColors[type]?.primary || 'var(--color-primary)'}
                            size={24}
                        />
                        {formatGoalType(type)}
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
                                        onClick={() => setGoalCharacteristic(type, 'icon', s.value)}
                                        style={{
                                            padding: '8px',
                                            borderRadius: '4px',
                                            border: '1px solid',
                                            borderColor: char.icon === s.value ? (goalColors[type]?.primary || 'var(--color-brand-primary)') : 'var(--color-border)',
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
                                            color={char.icon === s.value ? (goalColors[type]?.primary || 'var(--color-brand-primary)') : 'var(--color-text-muted)'}
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
                                        value={goalColors[type]?.primary || '#000000'}
                                        onChange={(e) => setGoalColor(type, 'primary', e.target.value)}
                                        style={{ width: '100%', height: '32px', padding: 0, border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px', color: 'var(--color-text-muted)' }}>Secondary</label>
                                    <input
                                        type="color"
                                        value={goalColors[type]?.secondary || '#000000'}
                                        onChange={(e) => setGoalColor(type, 'secondary', e.target.value)}
                                        style={{ width: '100%', height: '32px', padding: 0, border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer' }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Relative Deadlines */}
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

                        {/* Completion Methods */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', marginBottom: '8px', color: 'var(--color-text-secondary)' }}>
                                Valid Completion Methods
                            </label>
                            <div style={{ display: 'flex', gap: '16px' }}>
                                {Object.entries(char.completion_methods).map(([method, enabled]) => (
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
            ))}
        </div>
    );
};

export default GoalCharacteristicsSettings;
