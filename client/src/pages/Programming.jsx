import React, { useState } from 'react';
import '../App.css';
import styles from './Programming.module.css';
import AlertModal from '../components/modals/AlertModal';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';

/**
 * Programming Page - Create composable fractal session templates
 * Builds JSON data structures for session templates
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

    const [alertData, setAlertData] = useState({ isOpen: false, title: '', message: '' });
    const [templateToDelete, setTemplateToDelete] = useState(null);

    const componentTypes = [
        { value: 'warmup', label: 'Warm-up', color: '#ff9800' },
        { value: 'drill', label: 'Drill', color: '#2196f3' },
        { value: 'practice', label: 'Practice', color: '#4caf50' },
        { value: 'cooldown', label: 'Cool-down', color: '#9c27b0' }
    ];

    const handleAddComponent = () => {
        if (!newComponent.name.trim()) {
            setAlertData({ isOpen: true, title: 'Validation Error', message: 'Component name is required' });
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
            setAlertData({ isOpen: true, title: 'Validation Error', message: 'Template name is required' });
            return;
        }

        if (currentTemplate.components.length === 0) {
            setAlertData({ isOpen: true, title: 'Validation Error', message: 'Add at least one component to the template' });
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

        setAlertData({ isOpen: true, title: 'Success', message: 'Template saved successfully!' });
    };

    const handleLoadTemplate = (template) => {
        setCurrentTemplate({
            ...template,
            components: template.components.map(c => ({ ...c, id: Date.now() + Math.random() }))
        });
    };

    const handleDeleteTemplate = (templateId) => {
        const template = templates.find(t => t.id === templateId);
        setTemplateToDelete(template);
    };

    const confirmDeleteTemplate = () => {
        if (templateToDelete) {
            setTemplates(templates.filter(t => t.id !== templateToDelete.id));
            setTemplateToDelete(null);
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
        <div className={styles.container}>
            <h1 className={styles.header}>
                Session Programming
            </h1>

            <div className={styles.mainGrid}>
                {/* Template Builder */}
                <div>
                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>Template Builder</h2>

                        <div className={styles.fieldGroup}>
                            <label className={styles.label}>Template Name</label>
                            <input
                                type="text"
                                value={currentTemplate.name}
                                onChange={(e) => setCurrentTemplate({ ...currentTemplate, name: e.target.value })}
                                placeholder="e.g., Morning Practice Routine"
                                className={styles.input}
                            />
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.label}>Description</label>
                            <textarea
                                value={currentTemplate.description}
                                onChange={(e) => setCurrentTemplate({ ...currentTemplate, description: e.target.value })}
                                placeholder="Describe this session template..."
                                className={styles.textarea}
                            />
                        </div>

                        <div className={styles.durationRow}>
                            <span className={styles.durationText}>
                                Total Duration: <strong className={styles.durationValue}>{totalDuration} minutes</strong>
                            </span>
                            <button
                                onClick={() => setShowComponentModal(true)}
                                className={styles.btnAddParams}
                            >
                                + Add Component
                            </button>
                        </div>

                        {/* Components List */}
                        <div className={styles.componentsSection}>
                            <h3 className={styles.componentsHeader}>Components</h3>
                            {currentTemplate.components.length === 0 ? (
                                <p className={styles.emptyState}>
                                    No components yet. Click "Add Component" to start building your template.
                                </p>
                            ) : (
                                <div className={styles.componentList}>
                                    {currentTemplate.components.map((component, index) => {
                                        const typeInfo = componentTypes.find(t => t.value === component.type);
                                        return (
                                            <div
                                                key={component.id}
                                                className={styles.componentItem}
                                                style={{ borderLeft: `4px solid ${typeInfo?.color || '#666'}` }}
                                            >
                                                <div className={styles.componentInfo}>
                                                    <div className={styles.componentHeader}>
                                                        <span
                                                            className={styles.componentBadge}
                                                            style={{ background: typeInfo?.color }}
                                                        >
                                                            {typeInfo?.label}
                                                        </span>
                                                        <strong>{component.name}</strong>
                                                        <span className={styles.componentDuration}>({component.duration} min)</span>
                                                    </div>
                                                    {component.description && (
                                                        <p className={styles.componentDescription}>
                                                            {component.description}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className={styles.itemActions}>
                                                    <button
                                                        onClick={() => handleMoveComponent(index, 'up')}
                                                        disabled={index === 0}
                                                        className={styles.btnMove}
                                                    >
                                                        ↑
                                                    </button>
                                                    <button
                                                        onClick={() => handleMoveComponent(index, 'down')}
                                                        disabled={index === currentTemplate.components.length - 1}
                                                        className={styles.btnMove}
                                                    >
                                                        ↓
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveComponent(component.id)}
                                                        className={styles.btnRemove}
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
                        <div className={styles.mainActions}>
                            <button
                                onClick={handleSaveTemplate}
                                className={styles.btnSave}
                            >
                                Save Template
                            </button>
                            <button
                                onClick={handleExportJSON}
                                disabled={currentTemplate.components.length === 0}
                                className={styles.btnExport}
                            >
                                Export JSON
                            </button>
                        </div>
                    </div>
                </div>

                {/* Saved Templates */}
                <div>
                    <div className={styles.card}>
                        <h2 className={styles.cardTitle}>Saved Templates</h2>

                        {templates.length === 0 ? (
                            <p className={styles.emptyState}>
                                No saved templates yet
                            </p>
                        ) : (
                            <div className={styles.savedTemplatesList}>
                                {templates.map(template => (
                                    <div
                                        key={template.id}
                                        className={styles.savedTemplateItem}
                                    >
                                        <h3 className={styles.savedTemplateTitle}>{template.name}</h3>
                                        <p className={styles.savedTemplateMeta}>
                                            {template.components.length} components • {template.components.reduce((sum, c) => sum + c.duration, 0)} min
                                        </p>
                                        <div className={styles.savedTemplateActions}>
                                            <button
                                                onClick={() => handleLoadTemplate(template)}
                                                className={styles.btnLoad}
                                            >
                                                Load
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTemplate(template.id)}
                                                className={styles.btnDelete}
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
                    className={styles.modalOverlay}
                    onClick={() => setShowComponentModal(false)}
                >
                    <div
                        className={styles.modalContent}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className={styles.modalTitle}>Add Component</h2>

                        <div className={styles.fieldGroup}>
                            <label className={styles.label}>Component Name</label>
                            <input
                                type="text"
                                value={newComponent.name}
                                onChange={(e) => setNewComponent({ ...newComponent, name: e.target.value })}
                                placeholder="e.g., Scales Practice"
                                className={styles.input}
                            />
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.label}>Type</label>
                            <select
                                value={newComponent.type}
                                onChange={(e) => setNewComponent({ ...newComponent, type: e.target.value })}
                                className={styles.select}
                            >
                                {componentTypes.map(type => (
                                    <option key={type.value} value={type.value}>{type.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.label}>Duration (minutes)</label>
                            <input
                                type="number"
                                min="1"
                                value={newComponent.duration}
                                onChange={(e) => setNewComponent({ ...newComponent, duration: parseInt(e.target.value) || 1 })}
                                className={styles.input}
                            />
                        </div>

                        <div className={styles.fieldGroup}>
                            <label className={styles.label}>Description (Optional)</label>
                            <textarea
                                value={newComponent.description}
                                onChange={(e) => setNewComponent({ ...newComponent, description: e.target.value })}
                                placeholder="Additional details..."
                                className={styles.textarea}
                            />
                        </div>

                        <div className={styles.modalActions}>
                            <button
                                onClick={handleAddComponent}
                                className={styles.btnAdd}
                            >
                                Add Component
                            </button>
                            <button
                                onClick={() => setShowComponentModal(false)}
                                className={styles.btnCancel}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Alerts and Confirms */}
            <AlertModal
                isOpen={alertData.isOpen}
                onClose={() => setAlertData({ ...alertData, isOpen: false })}
                title={alertData.title}
                message={alertData.message}
            />

            <DeleteConfirmModal
                isOpen={!!templateToDelete}
                onClose={() => setTemplateToDelete(null)}
                onConfirm={confirmDeleteTemplate}
                title="Delete Template?"
                message={`Are you sure you want to delete "${templateToDelete?.name}"?`}
            />
        </div>
    );
}

export default Programming;
