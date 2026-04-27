import React, { useState } from 'react';

import styles from './TemplateBuilderModal.module.css';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';
import Input from '../atoms/Input';
import Select from '../atoms/Select';
import TextArea from '../atoms/TextArea';
import ActivitySelectorPanel from '../common/ActivitySelectorPanel';

import EmptyState from '../common/EmptyState';
import SectionHeader from '../common/SectionHeader';
import SessionTemplateNameBadge from '../common/SessionTemplateNameBadge';
import SessionTemplateTypePill from '../common/SessionTemplateTypePill';

import {
    DEFAULT_TEMPLATE_COLOR,
    SESSION_TYPE_NORMAL,
    SESSION_TYPE_QUICK,
    getSessionRuntimeType,
    getTemplateColor,
} from '../../utils/sessionRuntime';

const EMPTY_TEMPLATE = {
    name: '',
    description: '',
    sessionType: SESSION_TYPE_NORMAL,
    templateColor: DEFAULT_TEMPLATE_COLOR,
    sections: [],
    quickActivities: [],
};

function buildActivityPreview(activity) {
    return {
        activity_id: activity.id,
        name: activity.name,
        type: activity.type,
    };
}

function buildInitialTemplate(editingTemplate) {
    if (!editingTemplate) {
        return {
            ...EMPTY_TEMPLATE,
            sections: [],
            quickActivities: [],
        };
    }

    const sections = (editingTemplate.template_data?.sections || []).map((section) => ({
        ...section,
        activities: (section.activities || section.exercises || []).map((activity) => ({
            ...activity,
        })),
    }));

    return {
        name: editingTemplate.name || '',
        description: editingTemplate.description || '',
        sessionType: getSessionRuntimeType(editingTemplate),
        templateColor: getTemplateColor(editingTemplate),
        sections,
        quickActivities: (editingTemplate.template_data?.activities || []).map((activity) => ({
            ...activity,
        })),
    };
}

function TemplateBuilderModalContent({
    onClose,
    onSave,
    editingTemplate,
    activities,
    activityGroups = [],
    initialTemplate,
}) {
    const [currentTemplate, setCurrentTemplate] = useState(initialTemplate);
    const [showSectionModal, setShowSectionModal] = useState(false);
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [selectedSectionIndex, setSelectedSectionIndex] = useState(null);
    const [editingSectionIndex, setEditingSectionIndex] = useState(null);
    const [newSection, setNewSection] = useState({
        name: '',
        duration_minutes: '10',
        activities: [],
    });
    const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '' });

    const isExistingTemplate = Boolean(editingTemplate?.id);
    const isQuickTemplate = currentTemplate.sessionType === SESSION_TYPE_QUICK;
    const totalDuration = currentTemplate.sections.reduce((sum, section) => sum + section.duration_minutes, 0);

    const resetSectionEditor = () => {
        setEditingSectionIndex(null);
        setNewSection({ name: '', duration_minutes: '10', activities: [] });
        setShowSectionModal(false);
    };

    const resetActivityPicker = () => {
        setShowActivityModal(false);
        setSelectedSectionIndex(null);
    };

    const handleAddSection = () => {
        if (!newSection.name.trim()) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Section name is required' });
            return;
        }

        const duration = parseInt(newSection.duration_minutes, 10) || 10;
        if (duration < 1) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Duration must be at least 1 minute' });
            return;
        }

        setCurrentTemplate((previous) => ({
            ...previous,
            sections: [...previous.sections, { ...newSection, duration_minutes: duration }],
        }));
        resetSectionEditor();
    };

    const handleEditSection = (index) => {
        const section = currentTemplate.sections[index];
        if (!section) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Unable to edit this section.' });
            return;
        }

        setNewSection({
            name: section.name || '',
            duration_minutes: String(section.duration_minutes || 10),
            activities: section.activities || [],
        });
        setEditingSectionIndex(index);
        setShowSectionModal(true);
    };

    const handleUpdateSection = () => {
        if (!newSection.name.trim()) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Section name is required' });
            return;
        }

        const duration = parseInt(newSection.duration_minutes, 10) || 10;
        if (duration < 1 || editingSectionIndex === null) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Duration must be at least 1 minute' });
            return;
        }

        setCurrentTemplate((previous) => {
            const updatedSections = [...previous.sections];
            updatedSections[editingSectionIndex] = {
                ...updatedSections[editingSectionIndex],
                name: newSection.name,
                duration_minutes: duration,
            };
            return {
                ...previous,
                sections: updatedSections,
            };
        });
        resetSectionEditor();
    };

    const handleOpenAddSection = () => {
        setNewSection({ name: '', duration_minutes: '10', activities: [] });
        setEditingSectionIndex(null);
        setShowSectionModal(true);
    };

    const handleAddActivity = (activity) => {
        const activityToAdd = buildActivityPreview(activity);
        if (isQuickTemplate) {
            setCurrentTemplate((previous) => {
                const existingIds = new Set(previous.quickActivities.map((activity) => activity.activity_id));
                const nextActivities = [...previous.quickActivities];

                if (!existingIds.has(activityToAdd.activity_id)) {
                    nextActivities.push(activityToAdd);
                    existingIds.add(activityToAdd.activity_id);
                }

                if (nextActivities.length > 5) {
                    setAlertModal({ show: true, title: 'Validation Error', message: 'Quick sessions are limited to 5 activities.' });
                    return previous;
                }

                return {
                    ...previous,
                    quickActivities: nextActivities,
                };
            });
            resetActivityPicker();
            return;
        }

        setCurrentTemplate((previous) => {
            const updatedSections = [...previous.sections];
            const targetSection = updatedSections[selectedSectionIndex];
            if (!targetSection) {
                return previous;
            }

            updatedSections[selectedSectionIndex] = {
                ...targetSection,
                activities: [
                    ...(targetSection.activities || []),
                    activityToAdd,
                ],
            };

            return {
                ...previous,
                sections: updatedSections,
            };
        });
        resetActivityPicker();
    };

    const handleRemoveSection = (index) => {
        setCurrentTemplate((previous) => ({
            ...previous,
            sections: previous.sections.filter((_, currentIndex) => currentIndex !== index),
        }));
    };

    const handleRemoveActivity = (sectionIndex, activityIndex) => {
        setCurrentTemplate((previous) => {
            const updatedSections = [...previous.sections];
            const targetSection = updatedSections[sectionIndex];
            if (!targetSection) {
                return previous;
            }

            updatedSections[sectionIndex] = {
                ...targetSection,
                activities: (targetSection.activities || []).filter(
                (_, currentIndex) => currentIndex !== activityIndex
                ),
            };
            return {
                ...previous,
                sections: updatedSections,
            };
        });
    };

    const handleRemoveQuickActivity = (activityIndex) => {
        setCurrentTemplate((previous) => ({
            ...previous,
            quickActivities: previous.quickActivities.filter((_, currentIndex) => currentIndex !== activityIndex),
        }));
    };

    const handleMoveSection = (index, direction) => {
        setCurrentTemplate((previous) => {
            const newSections = [...previous.sections];
            const newIndex = direction === 'up' ? index - 1 : index + 1;

            if (newIndex < 0 || newIndex >= newSections.length) {
                return previous;
            }

            [newSections[index], newSections[newIndex]] = [newSections[newIndex], newSections[index]];
            return {
                ...previous,
                sections: newSections,
            };
        });
    };

    const handleMoveActivity = (sectionIndex, activityIndex, direction) => {
        setCurrentTemplate((previous) => {
            const updatedSections = [...previous.sections];
            const section = updatedSections[sectionIndex];
            const newActivities = [...section.activities];
            const newIndex = direction === 'up' ? activityIndex - 1 : activityIndex + 1;

            if (newIndex < 0 || newIndex >= newActivities.length) {
                return previous;
            }

            [newActivities[activityIndex], newActivities[newIndex]] = [newActivities[newIndex], newActivities[activityIndex]];
            updatedSections[sectionIndex] = { ...section, activities: newActivities };
            return {
                ...previous,
                sections: updatedSections,
            };
        });
    };

    const handleMoveQuickActivity = (activityIndex, direction) => {
        setCurrentTemplate((previous) => {
            const nextActivities = [...previous.quickActivities];
            const newIndex = direction === 'up' ? activityIndex - 1 : activityIndex + 1;
            if (newIndex < 0 || newIndex >= nextActivities.length) {
                return previous;
            }

            [nextActivities[activityIndex], nextActivities[newIndex]] = [nextActivities[newIndex], nextActivities[activityIndex]];
            return {
                ...previous,
                quickActivities: nextActivities,
            };
        });
    };

    const handleSave = () => {
        if (!currentTemplate.name.trim()) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Template name is required' });
            return;
        }

        if (isQuickTemplate) {
            if (currentTemplate.quickActivities.length === 0) {
                setAlertModal({ show: true, title: 'Validation Error', message: 'Quick sessions must include at least one activity.' });
                return;
            }
            if (currentTemplate.quickActivities.length > 5) {
                setAlertModal({ show: true, title: 'Validation Error', message: 'Quick sessions are limited to 5 activities.' });
                return;
            }
        } else if (currentTemplate.sections.length === 0) {
            setAlertModal({ show: true, title: 'Validation Error', message: 'Add at least one section to the template.' });
            return;
        }

        const templateData = isQuickTemplate
            ? {
                session_type: SESSION_TYPE_QUICK,
                template_color: currentTemplate.templateColor,
                activities: currentTemplate.quickActivities,
            }
            : {
                session_type: SESSION_TYPE_NORMAL,
                template_color: currentTemplate.templateColor,
                sections: currentTemplate.sections,
                total_duration_minutes: totalDuration,
            };

        onSave({
            name: currentTemplate.name,
            description: currentTemplate.description,
            template_data: templateData,
        }, editingTemplate?.id);
    };

    const handleClose = () => {
        resetSectionEditor();
        resetActivityPicker();
        onClose();
    };

    return (
        <>
            <Modal
                isOpen={true}
                onClose={handleClose}
                title={isExistingTemplate ? 'Edit Template' : 'Create Template'}
                size="xl"
            >
                <ModalBody>
                    <div className={styles.contentArea}>
                        <div className={styles.formGroup}>
                            <Input
                                label="Template Name"
                                value={currentTemplate.name}
                                onChange={(event) => setCurrentTemplate((previous) => ({ ...previous, name: event.target.value }))}
                                placeholder="e.g., Morning Guitar Practice"
                                fullWidth
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <TextArea
                                label="Description"
                                value={currentTemplate.description}
                                onChange={(event) => setCurrentTemplate((previous) => ({ ...previous, description: event.target.value }))}
                                placeholder="Describe this practice template..."
                                fullWidth
                            />
                        </div>

                        <div className={styles.sessionMetaGrid}>
                            <div className={styles.formGroup}>
                                <Select
                                    label="Session Type"
                                    value={currentTemplate.sessionType}
                                    onChange={(event) => setCurrentTemplate((previous) => ({
                                        ...previous,
                                        sessionType: event.target.value,
                                    }))}
                                    fullWidth
                                >
                                    <option value={SESSION_TYPE_NORMAL}>Normal Session</option>
                                    <option value={SESSION_TYPE_QUICK}>Quick Session</option>
                                </Select>
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Template Color</label>
                                <div className={styles.colorRow}>
                                    <input
                                        type="color"
                                        value={currentTemplate.templateColor}
                                        onChange={(event) => setCurrentTemplate((previous) => ({
                                            ...previous,
                                            templateColor: event.target.value,
                                        }))}
                                        className={styles.colorInput}
                                    />
                                    <span className={styles.colorValue}>{currentTemplate.templateColor}</span>
                                </div>
                            </div>
                        </div>

                        <div className={styles.previewRow}>
                            <span className={styles.label}>Preview</span>
                            <div className={styles.previewStack}>
                                <SessionTemplateNameBadge
                                    name={currentTemplate.name || 'Template Name'}
                                    color={currentTemplate.templateColor}
                                    size="md"
                                />
                                <SessionTemplateTypePill sessionType={currentTemplate.sessionType} size="sm" />
                            </div>
                        </div>

                        {isQuickTemplate ? (
                            <div>
                                <div className={styles.actionBar}>
                                    <span className={styles.durationText}>
                                        Quick Session: <strong className={styles.durationValue}>{currentTemplate.quickActivities.length}</strong> activit{currentTemplate.quickActivities.length === 1 ? 'y' : 'ies'}
                                    </span>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => {
                                            setShowActivityModal(true);
                                        }}
                                    >
                                        + Add Activity
                                    </Button>
                                </div>

                                <div>
                                    <h3 className={styles.sectionListTitle}>Activities</h3>
                                    {currentTemplate.quickActivities.length === 0 ? (
                                        <EmptyState
                                            className={styles.emptyState}
                                            description="Add between 1 and 5 activities for this quick session template."
                                        />
                                    ) : (
                                        <div className={styles.sectionsContainer}>
                                            {currentTemplate.quickActivities.map((activity, activityIndex) => (
                                                <div key={`${activity.activity_id}-${activityIndex}`} className={styles.sectionCard}>
                                                    <SectionHeader
                                                        className={styles.sectionHeader}
                                                        contentClassName={styles.sectionInfo}
                                                        title={(
                                                            <div className={styles.sectionTitleRow}>
                                                                <strong className={styles.sectionName}>{activity.name}</strong>
                                                            </div>
                                                        )}
                                                        meta={(
                                                            <p className={styles.sectionMeta}>
                                                                {activity.type || 'Activity'}
                                                            </p>
                                                        )}
                                                        actions={(
                                                            <div className={styles.sectionControls}>
                                                                <Button
                                                                    size="sm"
                                                                    variant="secondary"
                                                                    onClick={() => handleMoveQuickActivity(activityIndex, 'up')}
                                                                    disabled={activityIndex === 0}
                                                                >
                                                                    ↑
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="secondary"
                                                                    onClick={() => handleMoveQuickActivity(activityIndex, 'down')}
                                                                    disabled={activityIndex === currentTemplate.quickActivities.length - 1}
                                                                >
                                                                    ↓
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="danger"
                                                                    onClick={() => handleRemoveQuickActivity(activityIndex)}
                                                                >
                                                                    ×
                                                                </Button>
                                                            </div>
                                                        )}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {showActivityModal && (
                                        <div className={styles.inlineActivitySelector}>
                                            <ActivitySelectorPanel
                                                activities={activities}
                                                activityGroups={activityGroups}
                                                onClose={resetActivityPicker}
                                                onSelectActivity={handleAddActivity}
                                                closeOnSelect={true}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div>
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

                                <div>
                                    <h3 className={styles.sectionListTitle}>Sections</h3>
                                    {currentTemplate.sections.length === 0 ? (
                                        <EmptyState
                                            className={styles.emptyState}
                                            description='No sections yet. Click "Add Section" to start building your template.'
                                        />
                                    ) : (
                                        <div className={styles.sectionsContainer}>
                                            {currentTemplate.sections.map((section, sectionIndex) => (
                                                <div key={sectionIndex} className={styles.sectionCard}>
                                                    <SectionHeader
                                                        className={styles.sectionHeader}
                                                        contentClassName={styles.sectionInfo}
                                                        title={(
                                                            <div className={styles.sectionTitleRow}>
                                                                <strong className={styles.sectionName}>{section.name}</strong>
                                                                <span className={styles.sectionDurationBadge}>
                                                                    {section.duration_minutes} min
                                                                </span>
                                                            </div>
                                                        )}
                                                        meta={(
                                                            <p className={styles.sectionMeta}>
                                                                {section.activities?.length || 0} activit{(section.activities?.length || 0) !== 1 ? 'ies' : 'y'}
                                                            </p>
                                                        )}
                                                        actions={(
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
                                                        )}
                                                    />

                                                    <div className={styles.activitiesList}>
                                                        {(section.activities || []).map((activity, activityIndex) => (
                                                            <div
                                                                key={`${activity.activity_id || activity.name}-${activityIndex}`}
                                                                className={styles.activityItem}
                                                            >
                                                                <div className={styles.activityInfo}>
                                                                    <div className={styles.activityName}>{activity.name}</div>
                                                                    {activity.type && (
                                                                        <div className={styles.activityType}>
                                                                            {activity.type}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className={styles.activityActions}>
                                                                    <div className={styles.miniMoveGroup}>
                                                                        <button
                                                                            type="button"
                                                                            className={styles.miniMoveBtn}
                                                                            onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                handleMoveActivity(sectionIndex, activityIndex, 'up');
                                                                            }}
                                                                            disabled={activityIndex === 0}
                                                                            title="Move Up"
                                                                        >
                                                                            ↑
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className={styles.miniMoveBtn}
                                                                            onClick={(event) => {
                                                                                event.stopPropagation();
                                                                                handleMoveActivity(sectionIndex, activityIndex, 'down');
                                                                            }}
                                                                            disabled={activityIndex === (section.activities || []).length - 1}
                                                                            title="Move Down"
                                                                        >
                                                                            ↓
                                                                        </button>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveActivity(sectionIndex, activityIndex)}
                                                                        className={styles.removeActivityButton}
                                                                        aria-label="Remove activity"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedSectionIndex(sectionIndex);
                                                                setShowActivityModal(true);
                                                            }}
                                                            className={styles.addActivityPrompt}
                                                        >
                                                            + Add Activity
                                                        </button>

                                                        {showActivityModal && selectedSectionIndex === sectionIndex && (
                                                            <div className={styles.inlineActivitySelector}>
                                                                <ActivitySelectorPanel
                                                                    activities={activities}
                                                                    activityGroups={activityGroups}
                                                                    onClose={resetActivityPicker}
                                                                    onSelectActivity={handleAddActivity}
                                                                    closeOnSelect={true}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </ModalBody>

                <ModalFooter>
                    <Button variant="secondary" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button variant="success" onClick={handleSave}>
                        {isExistingTemplate ? 'Update Template' : 'Save Template'}
                    </Button>
                </ModalFooter>
            </Modal>

            {showSectionModal && (
                <div
                    className={styles.secondaryModalOverlay}
                    onClick={resetSectionEditor}
                >
                    <div
                        className={styles.secondaryModalContent}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2 className={styles.secondaryHeader}>
                            {editingSectionIndex !== null ? 'Edit Section' : 'Add Section'}
                        </h2>

                        <div className={styles.formGroup}>
                            <Input
                                label="Section Name"
                                value={newSection.name}
                                onChange={(event) => setNewSection({ ...newSection, name: event.target.value })}
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
                                onChange={(event) => setNewSection({ ...newSection, duration_minutes: event.target.value })}
                                fullWidth
                            />
                        </div>

                        <div className={styles.secondaryActions}>
                            <Button variant="secondary" onClick={resetSectionEditor}>
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

            {alertModal.show && (
                <div
                    className={styles.secondaryModalOverlay}
                    style={{ zIndex: 3400 }}
                    onClick={() => setAlertModal((previous) => ({ ...previous, show: false }))}
                >
                    <div
                        className={styles.secondaryModalContent}
                        style={{ width: 'min(400px, 90vw)' }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2 className={`${styles.alertTitle} ${alertModal.title === 'Error' ? styles.alertError : ''}`}>
                            {alertModal.title}
                        </h2>
                        <p className={styles.alertMessage}>
                            {alertModal.message}
                        </p>
                        <button
                            type="button"
                            onClick={() => setAlertModal((previous) => ({ ...previous, show: false }))}
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

function TemplateBuilderModal(props) {
    const { isOpen, editingTemplate } = props;
    if (!isOpen) {
        return null;
    }

    const modalKey = editingTemplate?.id ? `editing-${editingTemplate.id}` : 'new-template';

    return (
        <TemplateBuilderModalContent
            key={modalKey}
            {...props}
            initialTemplate={buildInitialTemplate(editingTemplate)}
        />
    );
}

export default TemplateBuilderModal;
