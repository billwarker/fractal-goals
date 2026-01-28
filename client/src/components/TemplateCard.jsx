import React from 'react';

/**
 * Template Card - Display card for session templates in grid view
 */
function TemplateCard({ template, onEdit, onDelete, onDuplicate }) {
    const totalDuration = template.template_data?.total_duration_minutes || 0;
    const sectionCount = template.template_data?.sections?.length || 0;
    const activityCount = template.template_data?.sections?.reduce(
        (sum, section) => sum + (section.activities?.length || section.exercises?.length || 0),
        0
    ) || 0;

    return (
        <div
            style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border-card)',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'all 0.2s',
                cursor: 'pointer'
            }}
            onClick={() => onEdit(template)}
            className="template-card hover-glow"
        >
            {/* Template Name */}
            <div>
                <h3 style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    margin: 0,
                    color: 'var(--color-text-primary)'
                }}>
                    {template.name}
                </h3>
                {template.description && (
                    <p style={{
                        fontSize: '13px',
                        color: 'var(--color-text-secondary)',
                        margin: '6px 0 0 0',
                        lineHeight: '1.4',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                    }}>
                        {template.description}
                    </p>
                )}
            </div>

            {/* Stats Row */}
            <div style={{
                display: 'flex',
                gap: '16px',
                color: 'var(--color-text-muted)',
                fontSize: '13px'
            }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--color-brand-primary)' }}>⏱</span>
                    {totalDuration} min
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: 'var(--color-brand-success)' }}>§</span>
                    {sectionCount} section{sectionCount !== 1 ? 's' : ''}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#ff9800' }}>◆</span>
                    {activityCount} activit{activityCount !== 1 ? 'ies' : 'y'}
                </span>
            </div>

            {/* Sections Preview */}
            {template.template_data?.sections && template.template_data.sections.length > 0 && (
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px'
                }}>
                    {template.template_data.sections.slice(0, 4).map((section, idx) => (
                        <span
                            key={idx}
                            style={{
                                padding: '4px 8px',
                                background: 'var(--color-bg-input)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                color: 'var(--color-text-secondary)',
                                border: '1px solid var(--color-border)'
                            }}
                        >
                            {section.name}
                        </span>
                    ))}
                    {template.template_data.sections.length > 4 && (
                        <span style={{
                            padding: '4px 8px',
                            background: 'transparent',
                            fontSize: '11px',
                            color: 'var(--color-text-muted)'
                        }}>
                            +{template.template_data.sections.length - 4} more
                        </span>
                    )}
                </div>
            )}

            {/* Action Buttons */}
            <div style={{
                display: 'flex',
                gap: '8px',
                marginTop: 'auto',
                paddingTop: '8px',
                borderTop: '1px solid var(--color-border)'
            }}>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit(template);
                    }}
                    style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: 'var(--color-brand-primary)',
                        border: '1px solid var(--color-border-btn)',
                        borderRadius: '4px',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                    }}
                    className="hover-brighten"
                >
                    Edit
                </button>
                {onDuplicate && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDuplicate(template);
                        }}
                        style={{
                            padding: '8px 12px',
                            background: 'var(--color-bg-input)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            color: 'var(--color-text-secondary)',
                            fontSize: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        className="hover-brighten"
                    >
                        Duplicate
                    </button>
                )}
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(template);
                    }}
                    style={{
                        padding: '8px 12px',
                        background: 'transparent',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        color: 'var(--color-text-muted)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#d32f2f';
                        e.currentTarget.style.color = '#d32f2f';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--color-border)';
                        e.currentTarget.style.color = 'var(--color-text-muted)';
                    }}
                >
                    Delete
                </button>
            </div>
        </div>
    );
}

export default TemplateCard;
