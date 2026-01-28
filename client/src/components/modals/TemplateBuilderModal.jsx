import React, { useState, useEffect } from 'react';
import styles from './TemplateBuilderModal.module.css';

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
        <div className={styles.modalOverlay} onClick={handleClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <h2 className={styles.headerTitle}>
                        {editingTemplate ? 'Edit Template' : 'Create Template'}
                    </h2>
                    <button
                        onClick={handleClose}
                        className={styles.closeButton}
                    >
                        ×
                    </button>
                </div>

                {/* Content - Scrollable */}
                <div className={styles.contentArea}>
                    {/* Template Name & Description */}
                    <div className={styles.formGroup}>
                        <label className={styles.label}>
                            Template Name
                        </label>
                        <input
                            type="text"
                            value={currentTemplate.name}
                            onChange={(e) => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                            placeholder="e.g., Morning Guitar Practice"
                            className={styles.input}
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label className={styles.label}>
                            Description
                        </label>
                        <textarea
                            value={currentTemplate.description}
                            onChange={(e) => setCurrentTemplate({ ...currentTemplate, description: e.target.value })}
                            placeholder="Describe this practice template..."
                            className={styles.textarea}
                        />
                    </div>

                    {/* Duration & Add Section */}
                    <div className={styles.actionBar}>
                        <span className={styles.durationText}>
                            Total Duration: <strong className={styles.durationValue}>{totalDuration} minutes</strong>
                        </span>
                        <button
                            onClick={handleOpenAddSection}
                            className={styles.addSectionButton}
                        >
                            + Add Section
                        </button>
                    </div>

                    {/* Sections List */}
                    <div>
                        <h3 className={styles.sectionListTitle}>
                            Sections
                        </h3>
                        {currentTemplate.sections.length === 0 ? (
                            <div className={styles.emptyState}>
                                No sections yet. Click "Add Section" to start building your template.
                            </div>
                        ) : (
                            <div className={styles.sectionsContainer}>
                                {currentTemplate.sections.map((section, sectionIndex) => (
                                    <div
                                        key={sectionIndex}
                                        className={styles.sectionCard}
                                    >
                                        <div className={styles.sectionHeader}>
                                            <div className={styles.sectionInfo}>
                                                <div className={styles.sectionTitleRow}>
                                                    <strong className={styles.sectionName}>{section.name}</strong>
                                                    <span className={styles.sectionDurationBadge}>
                                                        {section.duration_minutes} min
                                                    </span>
                                                </div>
                                                <p className={styles.sectionMeta}>
                                                    {section.activities?.length || 0} activit{(section.activities?.length || 0) !== 1 ? 'ies' : 'y'}
                                                </p>
                                            </div>
                                            <div className={styles.sectionControls}>
                                                <button
                                                    onClick={() => handleEditSection(sectionIndex)}
                                                    className={`${styles.controlButton} ${styles.editButton}`}
                                                    title="Edit section"
                                                >
                                                    ✎
                                                </button>
                                                <button
                                                    onClick={() => handleMoveSection(sectionIndex, 'up')}
                                                    disabled={sectionIndex === 0}
                                                    className={styles.controlButton}
                                                >
                                                    ↑
                                                </button>
                                                <button
                                                    onClick={() => handleMoveSection(sectionIndex, 'down')}
                                                    disabled={sectionIndex === currentTemplate.sections.length - 1}
                                                    className={styles.controlButton}
                                                >
                                                    ↓
                                                </button>
                                                <button
                                                    onClick={() => handleRemoveSection(sectionIndex)}
                                                    className={`${styles.controlButton} ${styles.deleteButton}`}
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        </div>

                                        {/* Activities in this section */}
                                        <div className={styles.activitiesList}>
                                            {(section.activities || []).map((activity, activityIndex) => (
                                                <div
                                                    key={activityIndex}
                                                    className={styles.activityItem}
                                                >
                                                    <div>
                                                        <div className={styles.activityName}>{activity.name}</div>
                                                        {activity.type && (
                                                            <div className={styles.activityType}>
                                                                {activity.type}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveActivity(sectionIndex, activityIndex)}
                                                        className={styles.removeActivityButton}
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
                                                className={styles.addActivityPrompt}
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
                <div className={styles.footer}>
                    <button
                        onClick={handleClose}
                        className={styles.cancelMainButton}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className={styles.saveMainButton}
                    >
                        {editingTemplate ? 'Update Template' : 'Save Template'}
                    </button>
                </div>
            </div>

            {/* Add/Edit Section Modal */}
            {showSectionModal && (
                <div
                    className={styles.secondaryModalOverlay}
                    onClick={() => {
                        setShowSectionModal(false);
                        setEditingSectionIndex(null);
                        setNewSection({ name: '', duration_minutes: '10', activities: [] });
                    }}
                >
                    <div
                        className={styles.secondaryModalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className={styles.secondaryHeader}>
                            {editingSectionIndex !== null ? 'Edit Section' : 'Add Section'}
                        </h2>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Section Name</label>
                            <input
                                type="text"
                                value={newSection.name}
                                onChange={(e) => setNewSection({ ...newSection, name: e.target.value })}
                                placeholder="e.g., Warm-up"
                                className={styles.input}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label className={styles.label}>Duration (minutes)</label>
                            <input
                                type="number"
                                min="1"
                                value={newSection.duration_minutes}
                                onChange={(e) => setNewSection({ ...newSection, duration_minutes: e.target.value })}
                                className={styles.input}
                            />
                        </div>

                        <div className={styles.secondaryActions}>
                            <button
                                onClick={() => {
                                    setShowSectionModal(false);
                                    setEditingSectionIndex(null);
                                    setNewSection({ name: '', duration_minutes: '10', activities: [] });
                                }}
                                className={styles.secondaryCancel}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={editingSectionIndex !== null ? handleUpdateSection : handleAddSection}
                                className={styles.secondaryConfirm}
                            >
                                {editingSectionIndex !== null ? 'Update Section' : 'Add Section'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Activity Modal */}
            {showActivityModal && (
                <div
                    className={styles.secondaryModalOverlay}
                    onClick={() => {
                        setShowActivityModal(false);
                        setSelectedSectionIndex(null);
                        setSelectedActivities([]);
                    }}
                >
                    <div
                        className={`${styles.secondaryModalContent} ${styles.secondaryModalLarge}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className={styles.secondaryHeader}>Add Activities</h2>

                        {activities.length === 0 ? (
                            <div className={styles.emptyState} style={{ padding: '20px', border: 'none', background: 'transparent' }}>
                                <p>No activities available.</p>
                                <p style={{ fontSize: '14px', marginTop: '8px' }}>Create activities first in the Activities page.</p>
                            </div>
                        ) : (
                            <div className={styles.contentArea} style={{ padding: '0 4px 0 0' }}>
                                <label className={styles.label} style={{ marginBottom: '12px' }}>Select Activities:</label>
                                <div className={styles.activityListContainer}>
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
                                                className={`${styles.activitySelectable} ${isSelected ? styles.selected : ''}`}
                                            >
                                                <div className={styles.checkbox}>
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

                        <div className={styles.secondaryActions}>
                            <button
                                onClick={() => {
                                    setShowActivityModal(false);
                                    setSelectedSectionIndex(null);
                                    setSelectedActivities([]);
                                }}
                                className={styles.secondaryCancel}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddActivities}
                                disabled={selectedActivities.length === 0}
                                className={styles.secondaryConfirm}
                                style={{ opacity: selectedActivities.length === 0 ? 0.5 : 1 }}
                            >
                                Add {selectedActivities.length > 0 ? `(${selectedActivities.length})` : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Alert Modal */}
            {alertModal.show && (
                <div
                    className={styles.secondaryModalOverlay}
                    style={{ zIndex: 2000 }}
                    onClick={() => setAlertModal({ ...alertModal, show: false })}
                >
                    <div
                        className={styles.secondaryModalContent}
                        style={{ maxWidth: '400px' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className={`${styles.alertTitle} ${alertModal.title === 'Error' ? styles.alertError : ''}`}>
                            {alertModal.title}
                        </h2>
                        <p className={styles.alertMessage}>
                            {alertModal.message}
                        </p>
                        <button
                            onClick={() => setAlertModal({ ...alertModal, show: false })}
                            className={styles.alertButton}
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
