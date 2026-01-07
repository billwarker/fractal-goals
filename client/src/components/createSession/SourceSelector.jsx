import React from 'react';
import StepHeader from './StepHeader';

/**
 * Step 0b: Choose Session Source
 * Displayed when single program AND templates are both available
 */
function SourceSelector({ sessionSource, onSelectSource }) {
    return (
        <div style={{
            background: '#1e1e1e',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '24px'
        }}>
            <StepHeader stepNumber={0} title="Choose Session Source" />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <SourceCard
                    icon="📅"
                    title="From Active Program"
                    description="Select a day from your current training program"
                    isSelected={sessionSource === 'program'}
                    onClick={() => onSelectSource('program')}
                />
                <SourceCard
                    icon="📋"
                    title="From Template"
                    description="Choose any template manually"
                    isSelected={sessionSource === 'template'}
                    onClick={() => onSelectSource('template')}
                />
            </div>
        </div>
    );
}

function SourceCard({ icon, title, description, isSelected, onClick }) {
    return (
        <div
            onClick={onClick}
            style={{
                background: isSelected ? '#2a4a2a' : '#2a2a2a',
                border: `2px solid ${isSelected ? '#4caf50' : '#444'}`,
                borderRadius: '8px',
                padding: '24px',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
                if (!isSelected) {
                    e.currentTarget.style.borderColor = '#4caf50';
                }
            }}
            onMouseLeave={(e) => {
                if (!isSelected) {
                    e.currentTarget.style.borderColor = '#444';
                }
            }}
        >
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>{icon}</div>
            <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '8px' }}>
                {title}
            </div>
            <div style={{ fontSize: '13px', color: '#aaa' }}>
                {description}
            </div>
            {isSelected && (
                <div style={{
                    marginTop: '12px',
                    color: '#4caf50',
                    fontSize: '12px',
                    fontWeight: 'bold'
                }}>
                    ✓ Selected
                </div>
            )}
        </div>
    );
}

export default SourceSelector;
