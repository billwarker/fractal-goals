import React, { useState, useEffect } from 'react';
import styles from './TemplateBuilderModal.module.css';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import ActivitySearchWidget from '../common/ActivitySearchWidget';

/**
 * Template Builder Modal - Full-screen modal for creating/editing session templates
 */
function TemplateBuilderModal({
    isOpen,
    onClose,
    onSave,
    editingTemplate,
    activities,
    activityGroups = [] // New prop for grouping
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
    const [selectedGroupId, setSelectedGroupId] = useState(null); // For group selection flow
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

    const handleAddActivities = (newSelectedIds) => {
        const idsToUse = newSelectedIds || selectedActivities;
        if (idsToUse.length === 0) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Please select at least one activity' });
            return;
        }

        const updatedSections = [...currentTemplate.sections];
        const activitiesToAdd = idsToUse.map(actId => {
            const activity = Array.isArray(activities) ? activities.find(a => a.id === actId) : null;
            if (!activity) return null;
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

    const handleMoveActivity = (sectionIndex, activityIndex, direction) => {
        const updatedSections = [...currentTemplate.sections];
        const section = updatedSections[sectionIndex];
        const newActivities = [...section.activities];
        const newIndex = direction === 'up' ? activityIndex - 1 : activityIndex + 1;

        if (newIndex < 0 || newIndex >= newActivities.length) return;

        [newActivities[activityIndex], newActivities[newIndex]] = [newActivities[newIndex], newActivities[activityIndex]];

        updatedSections[sectionIndex] = {
            ...section,
            activities: newActivities
        };

        setCurrentTemplate({
            ...currentTemplate,
            sections: updatedSections
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
        <>
            <Modal
                isOpen={isOpen}
                onClose={handleClose}
                title={editingTemplate ? 'Edit Template' : 'Create Template'}
                size="xl"
            >
                <ModalBody>
                    {/* Content - Scrollable */}
                    <div className={styles.contentArea}>
                        {/* Template Name & Description */}
                        <div className={styles.formGroup}>
                            <Input
                                label="Template Name"
                                value={currentTemplate.name}
                                onChange={(e) => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                                placeholder="e.g., Morning Guitar Practice"
                                fullWidth
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
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleOpenAddSection}
                            >
                                + Add Section
                            </Button>
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
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => handleEditSection(sectionIndex)}
                                                        title="Edit section"
                                                    >
                                                        ✎
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => handleMoveSection(sectionIndex, 'up')}
                                                        disabled={sectionIndex === 0}
                                                    >
                                                        ↑
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => handleMoveSection(sectionIndex, 'down')}
                                                        disabled={sectionIndex === currentTemplate.sections.length - 1}
                                                    >
                                                        ↓
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="danger"
                                                        onClick={() => handleRemoveSection(sectionIndex)}
                                                    >
                                                        ×
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Activities in this section */}
                                            <div className={styles.activitiesList}>
                                                {(section.activities || []).map((activity, activityIndex) => (
                                                    <div
                                                        key={activityIndex}
                                                        className={styles.activityItem}
                                                    >
                                                        <div style={{ flex: 1 }}>
                                                            <div className={styles.activityName}>{activity.name}</div>
                                                            {activity.type && (
                                                                <div className={styles.activityType}>
                                                                    {activity.type}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button
                                                                    className={styles.miniMoveBtn}
                                                                    onClick={(e) => { e.stopPropagation(); handleMoveActivity(sectionIndex, activityIndex, 'up'); }}
                                                                    disabled={activityIndex === 0}
                                                                    title="Move Up"
                                                                >↑</button>
                                                                <button
                                                                    className={styles.miniMoveBtn}
                                                                    onClick={(e) => { e.stopPropagation(); handleMoveActivity(sectionIndex, activityIndex, 'down'); }}
                                                                    disabled={activityIndex === (section.activities || []).length - 1}
                                                                    title="Move Down"
                                                                >↓</button>
                                                            </div>
                                                            <button
                                                                onClick={() => handleRemoveActivity(sectionIndex, activityIndex)}
                                                                className={styles.removeActivityButton}
                                                            >
                                                                ×
                                                            </button>
                                                        </div>
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
                </ModalBody>

                <ModalFooter>
                    <Button
                        variant="secondary"
                        onClick={handleClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="success"
                        onClick={handleSave}
                    >
                        {editingTemplate ? 'Update Template' : 'Save Template'}
                    </Button>
                </ModalFooter>
            </Modal>

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
                            <Input
                                label="Section Name"
                                value={newSection.name}
                                onChange={(e) => setNewSection({ ...newSection, name: e.target.value })}
                                placeholder="e.g., Warm-up"
                                fullWidth
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <Input
                                type="number"
                                label="Duration (minutes)"
                                min="1"
                                value={newSection.duration_minutes}
                                onChange={(e) => setNewSection({ ...newSection, duration_minutes: e.target.value })}
                                fullWidth
                            />
                        </div>

                        <div className={styles.secondaryActions}>
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setShowSectionModal(false);
                                    setEditingSectionIndex(null);
                                    setNewSection({ name: '', duration_minutes: '10', activities: [] });
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="success"
                                onClick={editingSectionIndex !== null ? handleUpdateSection : handleAddSection}
                            >
                                {editingSectionIndex !== null ? 'Update Section' : 'Add Section'}
                            </Button>
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
                        style={{ padding: 0, overflow: 'hidden' }}
                    >
                        <ActivitySearchWidget
                            activities={activities}
                            activityGroups={activityGroups}
                            preSelectedActivityIds={selectedActivities}
                            allowGroupSelection={false}
                            title="Select Activities"
                            confirmText="Add Selected"
                            onConfirm={(newSelectedIds) => {
                                handleAddActivities(newSelectedIds);
                            }}
                            onCancel={() => {
                                setShowActivityModal(false);
                                setSelectedSectionIndex(null);
                                setSelectedActivities([]);
                            }}
                        />
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
                        style={{ width: 'min(400px, 90vw)' }}
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
        </>
    );
}

export default TemplateBuilderModal;
