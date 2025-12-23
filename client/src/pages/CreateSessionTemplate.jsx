import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import '../App.css';

/**
 * Create Session Template Page - Build reusable practice session templates
 * Templates define sections and exercises for structured practice sessions
 */
function CreateSessionTemplate() {
    const { rootId } = useParams();
    const navigate = useNavigate();

    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentTemplate, setCurrentTemplate] = useState({
        name: '',
        description: '',
        sections: []
    });
    const [showSectionModal, setShowSectionModal] = useState(false);
    const [showExerciseModal, setShowExerciseModal] = useState(false);
    const [selectedSectionIndex, setSelectedSectionIndex] = useState(null);
    const [newSection, setNewSection] = useState({
        name: '',
        duration_minutes: 10,
        exercises: []
    });
    const [newExercise, setNewExercise] = useState({
        name: '',
        description: ''
    });

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchTemplates();
    }, [rootId, navigate]);

    const fetchTemplates = async () => {
        try {
            const res = await fractalApi.getSessionTemplates(rootId);
            setTemplates(res.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch templates", err);
            setLoading(false);
        }
    };

    const handleAddSection = () => {
        if (!newSection.name.trim()) {
            alert('Section name is required');
            return;
        }

        setCurrentTemplate({
            ...currentTemplate,
            sections: [...currentTemplate.sections, { ...newSection }]
        });

        setNewSection({
            name: '',
            duration_minutes: 10,
            exercises: []
        });

        setShowSectionModal(false);
    };

    const handleAddExercise = () => {
        if (!newExercise.name.trim()) {
            alert('Exercise name is required');
            return;
        }

        const updatedSections = [...currentTemplate.sections];
        updatedSections[selectedSectionIndex].exercises.push({ ...newExercise });

        setCurrentTemplate({
            ...currentTemplate,
            sections: updatedSections
        });

        setNewExercise({
            name: '',
            description: ''
        });

        setShowExerciseModal(false);
        setSelectedSectionIndex(null);
    };

    const handleRemoveSection = (index) => {
        setCurrentTemplate({
            ...currentTemplate,
            sections: currentTemplate.sections.filter((_, i) => i !== index)
        });
    };

    const handleRemoveExercise = (sectionIndex, exerciseIndex) => {
        const updatedSections = [...currentTemplate.sections];
        updatedSections[sectionIndex].exercises = updatedSections[sectionIndex].exercises.filter((_, i) => i !== exerciseIndex);

        setCurrentTemplate({
            ...currentTemplate,
            sections: updatedSections
        });
    };

    const handleMoveSection = (index, direction) => {
        const newSections = [...currentTemplate.sections];
        const newIndex = direction === 'up' ? index - 1 : index + 1;

        if (newIndex < 0 || newIndex >= newSections.length) return;

        [newSections[index], newSections[newIndex]] = [newSections[newIndex], newSections[index]];

        setCurrentTemplate({
            ...currentTemplate,
            sections: newSections
        });
    };

    const handleSaveTemplate = async () => {
        if (!currentTemplate.name.trim()) {
            alert('Template name is required');
            return;
        }

        if (currentTemplate.sections.length === 0) {
            alert('Add at least one section to the template');
            return;
        }

        try {
            const totalDuration = currentTemplate.sections.reduce((sum, s) => sum + s.duration_minutes, 0);

            const templateData = {
                sections: currentTemplate.sections,
                total_duration_minutes: totalDuration
            };

            await fractalApi.createSessionTemplate(rootId, {
                name: currentTemplate.name,
                description: currentTemplate.description,
                template_data: templateData
            });

            // Reset current template
            setCurrentTemplate({
                name: '',
                description: '',
                sections: []
            });

            // Refresh templates
            await fetchTemplates();

            alert('Template saved successfully!');
        } catch (err) {
            alert('Error saving template: ' + err.message);
        }
    };

    const handleLoadTemplate = (template) => {
        setCurrentTemplate({
            name: template.name,
            description: template.description,
            sections: template.template_data?.sections || []
        });
    };

    const handleDeleteTemplate = async (templateId) => {
        if (!confirm('Are you sure you want to delete this template?')) {
            return;
        }

        try {
            await fractalApi.deleteSessionTemplate(rootId, templateId);
            await fetchTemplates();
        } catch (err) {
            alert('Error deleting template: ' + err.message);
        }
    };

    const totalDuration = currentTemplate.sections.reduce((sum, s) => sum + s.duration_minutes, 0);

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'white' }}>Loading templates...</div>;
    }

    return (
        <div className="programming-page" style={{ padding: '20px', color: 'white' }}>
            <h1 style={{ fontWeight: 300, borderBottom: '1px solid #444', paddingBottom: '15px', marginBottom: '20px' }}>
                Create Session Template
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
                                placeholder="e.g., Morning Guitar Practice"
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
                                onClick={() => setShowSectionModal(true)}
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
                                + Add Section
                            </button>
                        </div>

                        {/* Sections List */}
                        <div>
                            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Sections</h3>
                            {currentTemplate.sections.length === 0 ? (
                                <p style={{ color: '#666', textAlign: 'center', padding: '20px' }}>
                                    No sections yet. Click "Add Section" to start building your template.
                                </p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {currentTemplate.sections.map((section, sectionIndex) => (
                                        <div
                                            key={sectionIndex}
                                            style={{
                                                background: '#2a2a2a',
                                                border: '1px solid #444',
                                                borderLeft: '4px solid #2196f3',
                                                borderRadius: '4px',
                                                padding: '12px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                        <strong>{section.name}</strong>
                                                        <span style={{ color: '#888', fontSize: '14px' }}>({section.duration_minutes} min)</span>
                                                    </div>
                                                    <p style={{ margin: '4px 0', color: '#aaa', fontSize: '13px' }}>
                                                        {section.exercises.length} exercise{section.exercises.length !== 1 ? 's' : ''}
                                                    </p>
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <button
                                                        onClick={() => handleMoveSection(sectionIndex, 'up')}
                                                        disabled={sectionIndex === 0}
                                                        style={{
                                                            padding: '4px 8px',
                                                            background: '#333',
                                                            border: 'none',
                                                            borderRadius: '3px',
                                                            color: 'white',
                                                            cursor: sectionIndex === 0 ? 'not-allowed' : 'pointer',
                                                            opacity: sectionIndex === 0 ? 0.5 : 1
                                                        }}
                                                    >
                                                        ↑
                                                    </button>
                                                    <button
                                                        onClick={() => handleMoveSection(sectionIndex, 'down')}
                                                        disabled={sectionIndex === currentTemplate.sections.length - 1}
                                                        style={{
                                                            padding: '4px 8px',
                                                            background: '#333',
                                                            border: 'none',
                                                            borderRadius: '3px',
                                                            color: 'white',
                                                            cursor: sectionIndex === currentTemplate.sections.length - 1 ? 'not-allowed' : 'pointer',
                                                            opacity: sectionIndex === currentTemplate.sections.length - 1 ? 0.5 : 1
                                                        }}
                                                    >
                                                        ↓
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveSection(sectionIndex)}
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

                                            {/* Exercises in this section */}
                                            <div style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: '2px solid #444' }}>
                                                {section.exercises.map((exercise, exerciseIndex) => (
                                                    <div
                                                        key={exerciseIndex}
                                                        style={{
                                                            background: '#1e1e1e',
                                                            padding: '8px',
                                                            marginBottom: '6px',
                                                            borderRadius: '3px',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'start'
                                                        }}
                                                    >
                                                        <div>
                                                            <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{exercise.name}</div>
                                                            {exercise.description && (
                                                                <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>
                                                                    {exercise.description}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveExercise(sectionIndex, exerciseIndex)}
                                                            style={{
                                                                padding: '2px 6px',
                                                                background: '#d32f2f',
                                                                border: 'none',
                                                                borderRadius: '2px',
                                                                color: 'white',
                                                                cursor: 'pointer',
                                                                fontSize: '11px'
                                                            }}
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => {
                                                        setSelectedSectionIndex(sectionIndex);
                                                        setShowExerciseModal(true);
                                                    }}
                                                    style={{
                                                        padding: '6px 12px',
                                                        background: '#333',
                                                        border: '1px dashed #666',
                                                        borderRadius: '3px',
                                                        color: '#aaa',
                                                        cursor: 'pointer',
                                                        fontSize: '12px',
                                                        width: '100%'
                                                    }}
                                                >
                                                    + Add Exercise
                                                </button>
                                            </div>
                                        </div>
                                    ))}
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
                                {templates.map(template => {
                                    const totalDur = template.template_data?.total_duration_minutes || 0;
                                    const sectionCount = template.template_data?.sections?.length || 0;

                                    return (
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
                                                {sectionCount} section{sectionCount !== 1 ? 's' : ''} • {totalDur} min
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
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add Section Modal */}
            {showSectionModal && (
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
                    onClick={() => setShowSectionModal(false)}
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
                        <h2 style={{ margin: '0 0 20px 0' }}>Add Section</h2>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', color: '#aaa' }}>Section Name</label>
                            <input
                                type="text"
                                value={newSection.name}
                                onChange={(e) => setNewSection({ ...newSection, name: e.target.value })}
                                placeholder="e.g., Warm-up"
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
                            <label style={{ display: 'block', marginBottom: '6px', color: '#aaa' }}>Duration (minutes)</label>
                            <input
                                type="number"
                                min="1"
                                value={newSection.duration_minutes}
                                onChange={(e) => setNewSection({ ...newSection, duration_minutes: parseInt(e.target.value) || 1 })}
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

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={handleAddSection}
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
                                Add Section
                            </button>
                            <button
                                onClick={() => setShowSectionModal(false)}
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

            {/* Add Exercise Modal */}
            {showExerciseModal && (
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
                    onClick={() => {
                        setShowExerciseModal(false);
                        setSelectedSectionIndex(null);
                    }}
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
                        <h2 style={{ margin: '0 0 20px 0' }}>Add Exercise</h2>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '6px', color: '#aaa' }}>Exercise Name</label>
                            <input
                                type="text"
                                value={newExercise.name}
                                onChange={(e) => setNewExercise({ ...newExercise, name: e.target.value })}
                                placeholder="e.g., Chromatic scales"
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
                                value={newExercise.description}
                                onChange={(e) => setNewExercise({ ...newExercise, description: e.target.value })}
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
                                onClick={handleAddExercise}
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
                                Add Exercise
                            </button>
                            <button
                                onClick={() => {
                                    setShowExerciseModal(false);
                                    setSelectedSectionIndex(null);
                                }}
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

export default CreateSessionTemplate;
