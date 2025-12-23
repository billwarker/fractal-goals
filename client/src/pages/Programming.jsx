import React, { useState } from 'react';
import '../App.css';

/**
 * Programming Page - Create composable fractal practice session templates
 * Builds JSON data structures for practice session templates
 */
function Programming() {
    const [templates, setTemplates] = useState([]);
    const [currentTemplate, setCurrentTemplate] = useState({
        name: '',
        description: '',
        duration: 30, // minutes
        components: []
    });
    const [showComponentModal, setShowComponentModal] = useState(false);
    const [newComponent, setNewComponent] = useState({
        name: '',
        duration: 5,
        type: 'warmup', // warmup, drill, practice, cooldown
        description: ''
    });

    const componentTypes = [
        { value: 'warmup', label: 'Warm-up', color: '#ff9800' },
        { value: 'drill', label: 'Drill', color: '#2196f3' },
        { value: 'practice', label: 'Practice', color: '#4caf50' },
        { value: 'cooldown', label: 'Cool-down', color: '#9c27b0' }
    ];

    const handleAddComponent = () => {
        if (!newComponent.name.trim()) {
            alert('Component name is required');
            return;
        }

        setCurrentTemplate({
            ...currentTemplate,
            components: [...currentTemplate.components, { ...newComponent, id: Date.now() }]
        });

        setNewComponent({
            name: '',
            duration: 5,
            type: 'warmup',
            description: ''
        });

        setShowComponentModal(false);
    };

    const handleRemoveComponent = (componentId) => {
        setCurrentTemplate({
            ...currentTemplate,
            components: currentTemplate.components.filter(c => c.id !== componentId)
        });
    };

    const handleMoveComponent = (index, direction) => {
        const newComponents = [...currentTemplate.components];
        const newIndex = direction === 'up' ? index - 1 : index + 1;

        if (newIndex < 0 || newIndex >= newComponents.length) return;

        [newComponents[index], newComponents[newIndex]] = [newComponents[newIndex], newComponents[index]];

        setCurrentTemplate({
            ...currentTemplate,
            components: newComponents
        });
    };

    const handleSaveTemplate = () => {
        if (!currentTemplate.name.trim()) {
            alert('Template name is required');
            return;
        }

        if (currentTemplate.components.length === 0) {
            alert('Add at least one component to the template');
            return;
        }

        setTemplates([...templates, { ...currentTemplate, id: Date.now() }]);

        // Reset current template
        setCurrentTemplate({
            name: '',
            description: '',
            duration: 30,
            components: []
        });

        alert('Template saved successfully!');
    };

    const handleLoadTemplate = (template) => {
        setCurrentTemplate({
            ...template,
            components: template.components.map(c => ({ ...c, id: Date.now() + Math.random() }))
        });
    };

    const handleDeleteTemplate = (templateId) => {
        if (confirm('Are you sure you want to delete this template?')) {
            setTemplates(templates.filter(t => t.id !== templateId));
        }
    };

    const handleExportJSON = () => {
        const json = JSON.stringify(currentTemplate, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentTemplate.name || 'template'}.json`;
        a.click();
    };

    const totalDuration = currentTemplate.components.reduce((sum, c) => sum + c.duration, 0);

    return (
        <div className="programming-page" style={{ padding: '20px', color: 'white' }}>
            <h1 style={{ fontWeight: 300, borderBottom: '1px solid #444', paddingBottom: '15px', marginBottom: '20px' }}>
                Practice Session Programming
            </h1>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
                {/* Template Builder */}
                <div>
                    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
                        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Template Builder</h2>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', color: '#aaa' }}>Template Name</label>
                            <input
                                type="text"
                                value={currentTemplate.name}
                                onChange={(e) => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                                placeholder="e.g., Morning Practice Routine"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: 'white'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', color: '#aaa' }}>Description</label>
                            <textarea
                                value={currentTemplate.description}
                                onChange={(e) => setCurrentTemplate({ ...currentTemplate, description: e.target.value })}
                                placeholder="Describe this practice template..."
                                style={{
                                    width: '100%',
                                    minHeight: '80px',
                                    padding: '10px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontFamily: 'inherit',
                                    resize: 'vertical'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <span style={{ color: '#aaa' }}>
                                Total Duration: <strong style={{ color: 'white' }}>{totalDuration} minutes</strong>
                            </span>
                            <button
                                onClick={() => setShowComponentModal(true)}
                                style={{
                                    padding: '10px 16px',
                                    background: '#2196f3',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                + Add Component
                            </button>
                        </div>

                        {/* Components List */}
                        <div>
                            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Components</h3>
                            {currentTemplate.components.length === 0 ? (
                                <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                                    No components yet. Click "Add Component" to start building your template.
                                </p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {currentTemplate.components.map((component, index) => {
                                        const typeInfo = componentTypes.find(t => t.value === component.type);
                                        return (
                                            <div
                                                key={component.id}
                                                style={{
                                                    background: '#2a2a2a',
                                                    border: '1px solid #444',
                                                    borderLeft: `4px solid ${typeInfo?.color || '#666'}`,
                                                    borderRadius: '4px',
                                                    padding: '12px',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                        <span style={{
                                                            background: typeInfo?.color,
                                                            padding: '2px 8px',
                                                            borderRadius: '3px',
                                                            fontSize: '11px',
                                                            fontWeight: 'bold'
                                                        }}>
                                                            {typeInfo?.label}
                                                        </span>
                                                        <strong>{component.name}</strong>
                                                        <span style={{ color: '#888', fontSize: '14px' }}>({component.duration} min)</span>
                                                    </div>
                                                    {component.description && (
                                                        <p style={{ margin: 0, color: '#aaa', fontSize: '13px' }}>
                                                            {component.description}
                                                        </p>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button
                                                        onClick={() => handleMoveComponent(index, 'up')}
                                                        disabled={index === 0}
                                                        style={{
                                                            padding: '4px 8px',
                                                            background: '#333',
                                                            border: 'none',
                                                            borderRadius: '3px',
                                                            color: 'white',
                                                            cursor: index === 0 ? 'not-allowed' : 'pointer',
                                                            opacity: index === 0 ? 0.5 : 1
                                                        }}
                                                    >
                                                        ↑
                                                    </button>
                                                    <button
                                                        onClick={() => handleMoveComponent(index, 'down')}
                                                        disabled={index === currentTemplate.components.length - 1}
                                                        style={{
                                                            padding: '4px 8px',
                                                            background: '#333',
                                                            border: 'none',
                                                            borderRadius: '3px',
                                                            color: 'white',
                                                            cursor: index === currentTemplate.components.length - 1 ? 'not-allowed' : 'pointer',
                                                            opacity: index === currentTemplate.components.length - 1 ? 0.5 : 1
                                                        }}
                                                    >
                                                        ↓
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveComponent(component.id)}
                                                        style={{
                                                            padding: '4px 8px',
                                                            background: '#d32f2f',
                                                            border: 'none',
                                                            borderRadius: '3px',
                                                            color: 'white',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                            <button
                                onClick={handleSaveTemplate}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: '#4caf50',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                Save Template
                            </button>
                            <button
                                onClick={handleExportJSON}
                                disabled={currentTemplate.components.length === 0}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: currentTemplate.components.length === 0 ? '#333' : '#2196f3',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    cursor: currentTemplate.components.length === 0 ? 'not-allowed' : 'pointer'
                                }}
                            >
                                Export JSON
                            </button>
                        </div>
                    </div>
                </div>

                {/* Saved Templates */}
                <div>
                    <div style={{ background: '#1e1e1e', border: '1px solid #333', borderRadius: '8px', padding: '20px' }}>
                        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Saved Templates</h2>

                        {templates.length === 0 ? (
                            <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                                No saved templates yet
                            </p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {templates.map(template => (
                                    <div
                                        key={template.id}
                                        style={{
                                            background: '#2a2a2a',
                                            border: '1px solid #444',
                                            borderRadius: '4px',
                                            padding: '12px'
                                        }}
                                    >
                                        <h3 style={{ fontSize: '16px', margin: '0 0 8px 0' }}>{template.name}</h3>
                                        <p style={{ margin: '0 0 8px 0', color: '#aaa', fontSize: '13px' }}>
                                            {template.components.length} components • {template.components.reduce((sum, c) => sum + c.duration, 0)} min
                                        </p>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => handleLoadTemplate(template)}
                                                style={{
                                                    flex: 1,
                                                    padding: '6px',
                                                    background: '#2196f3',
                                                    border: 'none',
                                                    borderRadius: '3px',
                                                    color: 'white',
                                                    fontSize: '12px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Load
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTemplate(template.id)}
                                                style={{
                                                    padding: '6px 12px',
                                                    background: '#d32f2f',
                                                    border: 'none',
                                                    borderRadius: '3px',
                                                    color: 'white',
                                                    fontSize: '12px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add Component Modal */}
            {showComponentModal && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000
                    }}
                    onClick={() => setShowComponentModal(false)}
                >
                    <div
                        style={{
                            background: '#1e1e1e',
                            border: '1px solid #444',
                            borderRadius: '8px',
                            padding: '24px',
                            maxWidth: '500px',
                            width: '90%'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 style={{ margin: '0 0 20px 0' }}>Add Component</h2>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', color: '#aaa' }}>Component Name</label>
                            <input
                                type="text"
                                value={newComponent.name}
                                onChange={(e) => setNewComponent({ ...newComponent, name: e.target.value })}
                                placeholder="e.g., Scales Practice"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: 'white'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', color: '#aaa' }}>Type</label>
                            <select
                                value={newComponent.type}
                                onChange={(e) => setNewComponent({ ...newComponent, type: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: 'white'
                                }}
                            >
                                {componentTypes.map(type => (
                                    <option key={type.value} value={type.value}>{type.label}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', color: '#aaa' }}>Duration (minutes)</label>
                            <input
                                type="number"
                                min="1"
                                value={newComponent.duration}
                                onChange={(e) => setNewComponent({ ...newComponent, duration: parseInt(e.target.value) || 1 })}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: 'white'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', color: '#aaa' }}>Description (Optional)</label>
                            <textarea
                                value={newComponent.description}
                                onChange={(e) => setNewComponent({ ...newComponent, description: e.target.value })}
                                placeholder="Additional details..."
                                style={{
                                    width: '100%',
                                    minHeight: '80px',
                                    padding: '10px',
                                    background: '#2a2a2a',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontFamily: 'inherit',
                                    resize: 'vertical'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={handleAddComponent}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: '#4caf50',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                Add Component
                            </button>
                            <button
                                onClick={() => setShowComponentModal(false)}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: '#666',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Programming;
