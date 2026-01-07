import React from 'react';
import StepHeader from './StepHeader';

/**
 * Step 0a: Choose Program
 * Displayed when multiple active programs are available
 */
function ProgramSelector({
    programsByName,
    selectedProgram,
    onSelectProgram,
    hasTemplates,
    sessionSource,
    onSelectTemplateSource
}) {
    const programNames = Object.keys(programsByName);

    return (
        <div style={{
            background: '#1e1e1e',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '24px'
        }}>
            <StepHeader stepNumber={0} title="Choose a Program" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {programNames.map(programName => {
                    const program = programsByName[programName];
                    const isSelected = selectedProgram === programName;
                    const dayCount = program.days.length;

                    return (
                        <div
                            key={programName}
                            onClick={() => onSelectProgram(programName)}
                            style={{
                                background: isSelected ? '#2a4a2a' : '#2a2a2a',
                                border: `2px solid ${isSelected ? '#4caf50' : '#444'}`,
                                borderRadius: '6px',
                                padding: '16px 20px',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
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
                            <div>
                                <div style={{ fontSize: '48px', marginRight: '16px', display: 'inline' }}>📅</div>
                                <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '18px' }}>
                                        {programName}
                                    </div>
                                    <div style={{ fontSize: '13px', color: '#aaa', marginTop: '4px' }}>
                                        {dayCount} active day{dayCount !== 1 ? 's' : ''} available
                                    </div>
                                </div>
                            </div>
                            {isSelected && (
                                <div style={{
                                    color: '#4caf50',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }}>
                                    ✓ Selected
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {hasTemplates && (
                <div style={{ marginTop: '16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>or</div>
                    <button
                        onClick={onSelectTemplateSource}
                        style={{
                            padding: '10px 20px',
                            background: sessionSource === 'template' ? '#2196f3' : 'transparent',
                            border: '1px solid #2196f3',
                            borderRadius: '4px',
                            color: sessionSource === 'template' ? 'white' : '#2196f3',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '14px',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            if (sessionSource !== 'template') {
                                e.currentTarget.style.background = 'rgba(76, 175, 80, 0.1)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (sessionSource !== 'template') {
                                e.currentTarget.style.background = 'transparent';
                            }
                        }}
                    >
                        📋 Select Template Manually Instead
                    </button>
                </div>
            )}
        </div>
    );
}

export default ProgramSelector;
