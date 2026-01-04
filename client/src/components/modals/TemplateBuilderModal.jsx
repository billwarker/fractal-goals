import React, { useState, useEffect } from 'react';

/**
 * Template Builder Modal - Full-screen modal for creating/editing session templates
 */
function TemplateBuilderModal({
    isOpen,
    onClose,
    onSave,
    editingTemplate,
    activities,
    rootId
}) {
    const [currentTemplate, setCurrentTemplate] = useState({
        name: '',
        description: '',
        sections: []
    });
    const [showSectionModal, setShowSectionModal] = useState(false);
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [selectedSectionIndex, setSelectedSectionIndex] = useState(null);
    const [editingSectionIndex, setEditingSectionIndex] = useState(null); // For editing existing sections
    const [newSection, setNewSection] = useState({
        name: '',
        duration_minutes: '10',
        activities: []
    });
    const [selectedActivities, setSelectedActivities] = useState([]);
    const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '' });

    // Load editing template when modal opens
    useEffect(() => {
        if (isOpen && editingTemplate) {
            // Migrate old 'exercises' to 'activities' for backward compatibility
            const sections = (editingTemplate.template_data?.sections || []).map(section => ({
                ...section,
                activities: section.activities || section.exercises || []
            }));

            setCurrentTemplate({
                name: editingTemplate.name,
                description: editingTemplate.description || '',
                sections
            });
        } else if (isOpen && !editingTemplate) {
            // Reset for new template
            setCurrentTemplate({
                name: '',
                description: '',
                sections: []
            });
        }
    }, [isOpen, editingTemplate]);

    const handleAddSection = () => {
        if (!newSection.name.trim()) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Section name is required' });
            return;
        }

        const duration = parseInt(newSection.duration_minutes) || 10;
        if (duration < 1) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Duration must be at least 1 minute' });
            return;
        }

        setCurrentTemplate({
            ...currentTemplate,
            sections: [...currentTemplate.sections, { ...newSection, duration_minutes: duration }]
        });

        setNewSection({
            name: '',
            duration_minutes: '10',
            activities: []
        });

        setShowSectionModal(false);
    };

    const handleEditSection = (index) => {
        const section = currentTemplate.sections[index];
        setNewSection({
            name: section.name,
            duration_minutes: String(section.duration_minutes),
            activities: section.activities || []
        });
        setEditingSectionIndex(index);
        setShowSectionModal(true);
    };

    const handleUpdateSection = () => {
        if (!newSection.name.trim()) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Section name is required' });
            return;
        }

        const duration = parseInt(newSection.duration_minutes) || 10;
        if (duration < 1) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Duration must be at least 1 minute' });
            return;
        }

        const updatedSections = [...currentTemplate.sections];
        updatedSections[editingSectionIndex] = {
            ...updatedSections[editingSectionIndex],
            name: newSection.name,
            duration_minutes: duration
        };

        setCurrentTemplate({
            ...currentTemplate,
            sections: updatedSections
        });

        setNewSection({
            name: '',
            duration_minutes: '10',
            activities: []
        });
        setEditingSectionIndex(null);
        setShowSectionModal(false);
    };

    const handleOpenAddSection = () => {
        setNewSection({ name: '', duration_minutes: '10', activities: [] });
        setEditingSectionIndex(null);
        setShowSectionModal(true);
    };

    const handleAddActivities = () => {
        if (selectedActivities.length === 0) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Please select at least one activity' });
            return;
        }

        const updatedSections = [...currentTemplate.sections];
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

    const handleSave = () => {
        if (!currentTemplate.name.trim()) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Template name is required' });
            return;
        }

        if (currentTemplate.sections.length === 0) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Add at least one section to the template' });
            return;
        }

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

        onSave(payload, editingTemplate?.id);
    };

    const handleClose = () => {
        setCurrentTemplate({ name: '', description: '', sections: [] });
        onClose();
    };

    const totalDuration = currentTemplate.sections.reduce((sum, s) => sum + s.duration_minutes, 0);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
            }}
            onClick={handleClose}
        >
            <div
                style={{
                    background: '#1a1a1a',
                    border: '1px solid #333',
                    borderRadius: '12px',
                    width: '90%',
                    maxWidth: '900px',
                    maxHeight: '90vh',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 400 }}>
                        {editingTemplate ? 'Edit Template' : 'Create Template'}
                    </h2>
                    <button
                        onClick={handleClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#888',
                            fontSize: '24px',
                            cursor: 'pointer',
                            padding: '4px 8px'
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '24px'
                }}>
                    {/* Template Name & Description */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', color: '#aaa', fontSize: '13px' }}>
                            Template Name
                        </label>
                        <input
                            type="text"
                            value={currentTemplate.name}
                            onChange={(e) => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                            placeholder="e.g., Morning Guitar Practice"
                            style={{
                                width: '100%',
                                padding: '12px',
                                background: '#2a2a2a',
                                border: '1px solid #444',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '15px'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', color: '#aaa', fontSize: '13px' }}>
                            Description
                        </label>
                        <textarea
                            value={currentTemplate.description}
                            onChange={(e) => setCurrentTemplate({ ...currentTemplate, description: e.target.value })}
                            placeholder="Describe this practice template..."
                            style={{
                                width: '100%',
                                minHeight: '80px',
                                padding: '12px',
                                background: '#2a2a2a',
                                border: '1px solid #444',
                                borderRadius: '6px',
                                color: 'white',
                                fontFamily: 'inherit',
                                fontSize: '14px',
                                resize: 'vertical'
                            }}
                        />
                    </div>

                    {/* Duration & Add Section */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '20px',
                        padding: '12px 16px',
                        background: '#252525',
                        borderRadius: '6px'
                    }}>
                        <span style={{ color: '#aaa' }}>
                            Total Duration: <strong style={{ color: 'white', fontSize: '16px' }}>{totalDuration} minutes</strong>
                        </span>
                        <button
                            onClick={handleOpenAddSection}
                            style={{
                                padding: '10px 16px',
                                background: '#2196f3',
                                border: 'none',
                                borderRadius: '6px',
                                color: 'white',
                                cursor: 'pointer',
                                fontWeight: 600,
                                fontSize: '13px'
                            }}
                        >
                            + Add Section
                        </button>
                    </div>

                    {/* Sections List */}
                    <div>
                        <h3 style={{ fontSize: '15px', marginBottom: '12px', color: '#888', fontWeight: 500 }}>
                            Sections
                        </h3>
                        {currentTemplate.sections.length === 0 ? (
                            <div style={{
                                padding: '40px',
                                textAlign: 'center',
                                color: '#555',
                                border: '1px dashed #333',
                                borderRadius: '8px'
                            }}>
                                No sections yet. Click "Add Section" to start building your template.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {currentTemplate.sections.map((section, sectionIndex) => (
                                    <div
                                        key={sectionIndex}
                                        style={{
                                            background: '#222',
                                            border: '1px solid #333',
                                            borderLeft: '4px solid #2196f3',
                                            borderRadius: '6px',
                                            padding: '16px'
                                        }}
                                    >
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'start',
                                            marginBottom: '12px'
                                        }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                                                    <strong style={{ fontSize: '15px' }}>{section.name}</strong>
                                                    <span style={{
                                                        padding: '2px 8px',
                                                        background: '#333',
                                                        borderRadius: '4px',
                                                        color: '#888',
                                                        fontSize: '12px'
                                                    }}>
                                                        {section.duration_minutes} min
                                                    </span>
                                                </div>
                                                <p style={{ margin: 0, color: '#888', fontSize: '13px' }}>
                                                    {section.activities?.length || 0} activit{(section.activities?.length || 0) !== 1 ? 'ies' : 'y'}
                                                </p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                    onClick={() => handleEditSection(sectionIndex)}
                                                    style={{
                                                        padding: '6px 10px',
                                                        background: '#333',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        color: '#2196f3',
                                                        cursor: 'pointer',
                                                        fontSize: '12px'
                                                    }}
                                                    title="Edit section"
                                                >
                                                    ✎
                                                </button>
                                                <button
                                                    onClick={() => handleMoveSection(sectionIndex, 'up')}
                                                    disabled={sectionIndex === 0}
                                                    style={{
                                                        padding: '6px 10px',
                                                        background: '#333',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        color: sectionIndex === 0 ? '#555' : '#aaa',
                                                        cursor: sectionIndex === 0 ? 'not-allowed' : 'pointer'
                                                    }}
                                                >
                                                    ↑
                                                </button>
                                                <button
                                                    onClick={() => handleMoveSection(sectionIndex, 'down')}
                                                    disabled={sectionIndex === currentTemplate.sections.length - 1}
                                                    style={{
                                                        padding: '6px 10px',
                                                        background: '#333',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        color: sectionIndex === currentTemplate.sections.length - 1 ? '#555' : '#aaa',
                                                        cursor: sectionIndex === currentTemplate.sections.length - 1 ? 'not-allowed' : 'pointer'
                                                    }}
                                                >
                                                    ↓
                                                </button>
                                                <button
                                                    onClick={() => handleRemoveSection(sectionIndex)}
                                                    style={{
                                                        padding: '6px 10px',
                                                        background: '#d32f2f',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        color: 'white',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        </div>

                                        {/* Activities in this section */}
                                        <div style={{
                                            marginTop: '8px',
                                            paddingLeft: '12px',
                                            borderLeft: '2px solid #333'
                                        }}>
                                            {(section.activities || []).map((activity, activityIndex) => (
                                                <div
                                                    key={activityIndex}
                                                    style={{
                                                        background: '#1a1a1a',
                                                        padding: '10px 12px',
                                                        marginBottom: '8px',
                                                        borderRadius: '4px',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center'
                                                    }}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{activity.name}</div>
                                                        {activity.type && (
                                                            <div style={{ color: '#666', fontSize: '11px', marginTop: '2px' }}>
                                                                {activity.type}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveActivity(sectionIndex, activityIndex)}
                                                        style={{
                                                            padding: '4px 8px',
                                                            background: '#d32f2f',
                                                            border: 'none',
                                                            borderRadius: '3px',
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
                                                    padding: '8px 12px',
                                                    background: 'transparent',
                                                    border: '1px dashed #444',
                                                    borderRadius: '4px',
                                                    color: '#888',
                                                    cursor: 'pointer',
                                                    fontSize: '12px',
                                                    width: '100%',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={(e) => {
                                                    e.currentTarget.style.borderColor = '#666';
                                                    e.currentTarget.style.color = '#aaa';
                                                }}
                                                onMouseLeave={(e) => {
                                                    e.currentTarget.style.borderColor = '#444';
                                                    e.currentTarget.style.color = '#888';
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
                </div>

                {/* Footer Actions */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #333',
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'flex-end'
                }}>
                    <button
                        onClick={handleClose}
                        style={{
                            padding: '12px 24px',
                            background: '#333',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#ccc',
                            fontWeight: 500,
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        style={{
                            padding: '12px 32px',
                            background: '#4caf50',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        {editingTemplate ? 'Update Template' : 'Save Template'}
                    </button>
                </div>
            </div>

            {/* Add/Edit Section Modal */}
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
                        zIndex: 1100
                    }}
                    onClick={() => {
                        setShowSectionModal(false);
                        setEditingSectionIndex(null);
                        setNewSection({ name: '', duration_minutes: '10', activities: [] });
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
                        <h2 style={{ margin: '0 0 20px 0' }}>
                            {editingSectionIndex !== null ? 'Edit Section' : 'Add Section'}
                        </h2>

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
                                onChange={(e) => setNewSection({ ...newSection, duration_minutes: e.target.value })}
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
                                onClick={editingSectionIndex !== null ? handleUpdateSection : handleAddSection}
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
                                {editingSectionIndex !== null ? 'Update Section' : 'Add Section'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowSectionModal(false);
                                    setEditingSectionIndex(null);
                                    setNewSection({ name: '', duration_minutes: '10', activities: [] });
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
                        zIndex: 1100
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

            {/* Alert Modal */}
            {alertModal.show && (
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
                    onClick={() => setAlertModal({ ...alertModal, show: false })}
                >
                    <div
                        style={{
                            background: '#1e1e1e',
                            border: '1px solid #444',
                            borderRadius: '8px',
                            padding: '24px',
                            maxWidth: '400px',
                            width: '90%'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 style={{
                            margin: '0 0 16px 0',
                            fontSize: '18px',
                            color: alertModal.title === 'Error' ? '#f44336' : 'white'
                        }}>
                            {alertModal.title}
                        </h2>
                        <p style={{ margin: '0 0 20px 0', color: '#ccc' }}>
                            {alertModal.message}
                        </p>
                        <button
                            onClick={() => setAlertModal({ ...alertModal, show: false })}
                            style={{
                                width: '100%',
                                padding: '12px',
                                background: '#2196f3',
                                border: 'none',
                                borderRadius: '4px',
                                color: 'white',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TemplateBuilderModal;
