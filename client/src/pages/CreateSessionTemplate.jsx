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
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null); // Track which template we're editing
    const [currentTemplate, setCurrentTemplate] = useState({
        name: '',
        description: '',
        sections: []
    });
    const [showSectionModal, setShowSectionModal] = useState(false);
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [selectedSectionIndex, setSelectedSectionIndex] = useState(null);
    const [newSection, setNewSection] = useState({
        name: '',
        duration_minutes: 10,
        activities: []
    });
    const [selectedActivities, setSelectedActivities] = useState([]);
    // Custom modal state
    const [modal, setModal] = useState({ show: false, type: 'alert', title: '', message: '', onConfirm: null });

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchTemplates();
    }, [rootId, navigate]);

    const fetchTemplates = async () => {
        try {
            const [templatesRes, activitiesRes] = await Promise.all([
                fractalApi.getSessionTemplates(rootId),
                fractalApi.getActivities(rootId)
            ]);
            setTemplates(templatesRes.data);
            setActivities(activitiesRes.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch templates", err);
            setLoading(false);
        }
    };

    const handleAddSection = () => {
        if (!newSection.name.trim()) {
            setModal({ show: true, type: 'alert', title: 'Validation Error', message: 'Section name is required', onConfirm: null });
            return;
        }

        setCurrentTemplate({
            ...currentTemplate,
            sections: [...currentTemplate.sections, { ...newSection }]
        });

        setNewSection({
            name: '',
            duration_minutes: 10,
            activities: []
        });

        setShowSectionModal(false);
    };

    const handleAddActivities = () => {
        if (selectedActivities.length === 0) {
            setModal({ show: true, type: 'alert', title: 'Validation Error', message: 'Please select at least one activity', onConfirm: null });
            return;
        }

        const updatedSections = [...currentTemplate.sections];
        // Add selected activities to the section
        const activitiesToAdd = selectedActivities.map(actId => {
            const activity = activities.find(a => a.id === actId);
            return {
                activity_id: activity.id,
                name: activity.name,
                type: activity.type
            };
        });

        updatedSections[selectedSectionIndex].activities = [
            ...updatedSections[selectedSectionIndex].activities,
            ...activitiesToAdd
        ];

        setCurrentTemplate({
            ...currentTemplate,
            sections: updatedSections
        });

        setSelectedActivities([]);
        setShowActivityModal(false);
        setSelectedSectionIndex(null);
    };

    const handleRemoveSection = (index) => {
        setCurrentTemplate({
            ...currentTemplate,
            sections: currentTemplate.sections.filter((_, i) => i !== index)
        });
    };

    const handleRemoveActivity = (sectionIndex, activityIndex) => {
        const updatedSections = [...currentTemplate.sections];
        updatedSections[sectionIndex].activities = updatedSections[sectionIndex].activities.filter((_, i) => i !== activityIndex);

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
            setModal({ show: true, type: 'alert', title: 'Validation Error', message: 'Template name is required', onConfirm: null });
            return;
        }

        if (currentTemplate.sections.length === 0) {
            setModal({ show: true, type: 'alert', title: 'Validation Error', message: 'Add at least one section to the template', onConfirm: null });
            return;
        }

        try {
            const totalDuration = currentTemplate.sections.reduce((sum, s) => sum + s.duration_minutes, 0);

            const templateData = {
                sections: currentTemplate.sections,
                total_duration_minutes: totalDuration
            };

            const payload = {
                name: currentTemplate.name,
                description: currentTemplate.description,
                template_data: templateData
            };

            // Update existing template or create new one
            if (editingId) {
                await fractalApi.updateSessionTemplate(rootId, editingId, payload);
            } else {
                await fractalApi.createSessionTemplate(rootId, payload);
            }

            // Reset current template and editing state
            setCurrentTemplate({
                name: '',
                description: '',
                sections: []
            });
            setEditingId(null);

            // Refresh templates
            await fetchTemplates();

            setModal({ show: true, type: 'alert', title: 'Success', message: 'Template saved successfully!', onConfirm: null });
        } catch (err) {
            setModal({ show: true, type: 'alert', title: 'Error', message: 'Error saving template: ' + err.message, onConfirm: null });
        }
    };

    const handleLoadTemplate = (template) => {
        // Migrate old 'exercises' to 'activities' for backward compatibility
        const sections = (template.template_data?.sections || []).map(section => ({
            ...section,
            activities: section.activities || section.exercises || []
        }));

        setCurrentTemplate({
            name: template.name,
            description: template.description,
            sections
        });
        setEditingId(template.id); // Store the template ID for updating
    };

    const handleDeleteTemplate = async (templateId) => {
        setModal({
            show: true,
            type: 'confirm',
            title: 'Delete Template',
            message: 'Are you sure you want to delete this template? This action cannot be undone.',
            onConfirm: async () => {
                try {
                    await fractalApi.deleteSessionTemplate(rootId, templateId);
                    await fetchTemplates();
                    setModal({ show: false, type: 'alert', title: '', message: '', onConfirm: null });
                } catch (err) {
                    setModal({ show: true, type: 'alert', title: 'Error', message: 'Error deleting template: ' + err.message, onConfirm: null });
                }
            }
        });
    };

    const totalDuration = currentTemplate.sections.reduce((sum, s) => sum + s.duration_minutes, 0);

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'white' }}>Loading templates...</div>;
    }

    return (
        <div className="page-container" style={{ color: 'white' }}>
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
                                                        {section.activities?.length || 0} activit{(section.activities?.length || 0) !== 1 ? 'ies' : 'y'}
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

                                            {/* Activities in this section */}
                                            <div style={{ marginTop: '8px', paddingLeft: '12px', borderLeft: '2px solid #444' }}>
                                                {(section.activities || []).map((activity, activityIndex) => (
                                                    <div
                                                        key={activityIndex}
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
                                                            <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{activity.name}</div>
                                                            {activity.type && (
                                                                <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>
                                                                    {activity.type}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveActivity(sectionIndex, activityIndex)}
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
                                                        setSelectedActivities([]);
                                                        setShowActivityModal(true);
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
                                                    + Add Activity
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
                                {editingId ? 'Update Template' : 'Save Template'}
                            </button>
                            {editingId && (
                                <button
                                    onClick={() => {
                                        setCurrentTemplate({ name: '', description: '', sections: [] });
                                        setEditingId(null);
                                    }}
                                    style={{
                                        padding: '12px 20px',
                                        background: '#666',
                                        border: 'none',
                                        borderRadius: '4px',
                                        color: 'white',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancel Edit
                                </button>
                            )}
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

            {/* Add Activity Modal */}
            {showActivityModal && (
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
                        setShowActivityModal(false);
                        setSelectedSectionIndex(null);
                        setSelectedActivities([]);
                    }}
                >
                    <div
                        style={{
                            background: '#1e1e1e',
                            border: '1px solid #444',
                            borderRadius: '8px',
                            padding: '24px',
                            maxWidth: '600px',
                            width: '90%',
                            maxHeight: '80vh',
                            overflow: 'auto'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 style={{ margin: '0 0 20px 0' }}>Add Activities</h2>

                        {activities.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                <p>No activities available.</p>
                                <p style={{ fontSize: '14px', marginTop: '8px' }}>Create activities first in the Activities page.</p>
                            </div>
                        ) : (
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '12px', color: '#aaa' }}>Select Activities:</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {activities.map(activity => {
                                        const isSelected = selectedActivities.includes(activity.id);
                                        return (
                                            <div
                                                key={activity.id}
                                                onClick={() => {
                                                    if (isSelected) {
                                                        setSelectedActivities(selectedActivities.filter(id => id !== activity.id));
                                                    } else {
                                                        setSelectedActivities([...selectedActivities, activity.id]);
                                                    }
                                                }}
                                                style={{
                                                    background: isSelected ? '#2a4a2a' : '#2a2a2a',
                                                    border: `2px solid ${isSelected ? '#4caf50' : '#444'}`,
                                                    borderRadius: '6px',
                                                    padding: '12px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <div style={{
                                                    width: '20px',
                                                    height: '20px',
                                                    borderRadius: '4px',
                                                    border: `2px solid ${isSelected ? '#4caf50' : '#666'}`,
                                                    background: isSelected ? '#4caf50' : 'transparent',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'white',
                                                    fontSize: '14px',
                                                    fontWeight: 'bold',
                                                    flexShrink: 0
                                                }}>
                                                    {isSelected && '✓'}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
                                                        {activity.name}
                                                    </div>
                                                    {activity.type && (
                                                        <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                                                            {activity.type}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button
                                onClick={handleAddActivities}
                                disabled={selectedActivities.length === 0}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    background: selectedActivities.length === 0 ? '#666' : '#4caf50',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    cursor: selectedActivities.length === 0 ? 'not-allowed' : 'pointer',
                                    opacity: selectedActivities.length === 0 ? 0.5 : 1
                                }}
                            >
                                Add {selectedActivities.length > 0 ? `(${selectedActivities.length})` : ''}
                            </button>
                            <button
                                onClick={() => {
                                    setShowActivityModal(false);
                                    setSelectedSectionIndex(null);
                                    setSelectedActivities([]);
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

            {/* Custom Modal */}
            {modal.show && (
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
                        zIndex: 2000
                    }}
                    onClick={() => modal.type === 'alert' && setModal({ ...modal, show: false })}
                >
                    <div
                        style={{
                            background: '#1e1e1e',
                            border: '1px solid #444',
                            borderRadius: '8px',
                            padding: '24px',
                            maxWidth: '500px',
                            width: '90%',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', color: modal.type === 'alert' && modal.title === 'Error' ? '#f44336' : 'white' }}>
                            {modal.title}
                        </h2>
                        <p style={{ margin: '0 0 24px 0', color: '#ccc', lineHeight: '1.5' }}>
                            {modal.message}
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            {modal.type === 'confirm' && (
                                <button
                                    onClick={() => setModal({ ...modal, show: false })}
                                    style={{
                                        padding: '10px 20px',
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
                            )}
                            <button
                                onClick={() => {
                                    if (modal.type === 'confirm' && modal.onConfirm) {
                                        modal.onConfirm();
                                    } else {
                                        setModal({ ...modal, show: false });
                                    }
                                }}
                                style={{
                                    padding: '10px 20px',
                                    background: modal.type === 'confirm' ? '#f44336' : '#2196f3',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                }}
                            >
                                {modal.type === 'confirm' ? 'Delete' : 'OK'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CreateSessionTemplate;
