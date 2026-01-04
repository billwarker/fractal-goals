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
                background: '#1e1e1e',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'all 0.2s',
                cursor: 'pointer'
            }}
            onClick={() => onEdit(template)}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#2196f3';
                e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#333';
                e.currentTarget.style.transform = 'translateY(0)';
            }}
        >
            {/* Template Name */}
            <div>
                <h3 style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    margin: 0,
                    color: '#fff'
                }}>
                    {template.name}
                </h3>
                {template.description && (
                    <p style={{
                        fontSize: '13px',
                        color: '#888',
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
                color: '#aaa',
                fontSize: '13px'
            }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#2196f3' }}>⏱</span>
                    {totalDuration} min
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#4caf50' }}>§</span>
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
                                background: '#2a2a2a',
                                borderRadius: '4px',
                                fontSize: '11px',
                                color: '#ccc',
                                border: '1px solid #333'
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
                            color: '#666'
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
                borderTop: '1px solid #333'
            }}>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit(template);
                    }}
                    style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: '#2196f3',
                        border: 'none',
                        borderRadius: '4px',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#1976d2'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#2196f3'}
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
                            background: '#333',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            color: '#ccc',
                            fontSize: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#444';
                            e.currentTarget.style.color = 'white';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#333';
                            e.currentTarget.style.color = '#ccc';
                        }}
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
                        border: '1px solid #444',
                        borderRadius: '4px',
                        color: '#aaa',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#d32f2f';
                        e.currentTarget.style.color = '#d32f2f';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#444';
                        e.currentTarget.style.color = '#aaa';
                    }}
                >
                    Delete
                </button>
            </div>
        </div>
    );
}

export default TemplateCard;
