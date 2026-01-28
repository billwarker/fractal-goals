import React from 'react';
import { useNavigate } from 'react-router-dom';
import StepHeader from './StepHeader';

/**
 * Step 1 (Template Mode): Select a Template
 * Grid display of available session templates
 */
function TemplatePicker({ templates, selectedTemplate, rootId, onSelectTemplate }) {
    const navigate = useNavigate();

    return (
        <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '24px'
        }}>
            <StepHeader stepNumber={1} title="Select a Template" />

            {templates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>No templates available</p>
                    <button
                        onClick={() => navigate(`/${rootId}/manage-session-templates`)}
                        style={{
                            padding: '10px 20px',
                            background: '#2196f3',
                            border: 'none',
                            borderRadius: '4px',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        Create a Template
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                    {templates.map(template => {
                        const isSelected = selectedTemplate?.id === template.id;
                        const sectionCount = template.template_data?.sections?.length || 0;
                        const duration = template.template_data?.total_duration_minutes || 0;

                        return (
                            <div
                                key={template.id}
                                onClick={() => onSelectTemplate(template)}
                                style={{
                                    background: isSelected ? 'var(--color-bg-card-hover)' : 'var(--color-bg-input)',
                                    border: `2px solid ${isSelected ? '#4caf50' : 'var(--color-border)'}`,
                                    borderRadius: '6px',
                                    padding: '16px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '8px', color: 'var(--color-text-primary)' }}>
                                    {template.name}
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                                    {sectionCount} section{sectionCount !== 1 ? 's' : ''} • {duration} min
                                </div>
                                {template.description && (
                                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                                        {template.description}
                                    </div>
                                )}
                                {isSelected && (
                                    <div style={{
                                        marginTop: '8px',
                                        color: '#4caf50',
                                        fontSize: '12px',
                                        fontWeight: 'bold'
                                    }}>
                                        ✓ Selected
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default TemplatePicker;
