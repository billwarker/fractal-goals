import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import notify from '../utils/notify';
import TemplateCard from '../components/TemplateCard';
import TemplateBuilderModal from '../components/modals/TemplateBuilderModal';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import '../App.css';

/**
 * Manage Session Templates Page - Grid view of template cards with modal builder
 * Similar layout to ManageActivities page
 */
function CreateSessionTemplate() {
    const { rootId } = useParams();
    const navigate = useNavigate();

    const [templates, setTemplates] = useState([]);
    const [activities, setActivities] = useState([]);
    const [activityGroups, setActivityGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal states
    const [showBuilder, setShowBuilder] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [templateToDelete, setTemplateToDelete] = useState(null);



    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchData();
    }, [rootId, navigate]);

    const fetchData = async () => {
        try {
            const [templatesRes, activitiesRes, groupsRes] = await Promise.all([
                fractalApi.getSessionTemplates(rootId),
                fractalApi.getActivities(rootId),
                fractalApi.getActivityGroups(rootId)
            ]);
            setTemplates(templatesRes.data);
            setActivities(activitiesRes.data);
            setActivityGroups(groupsRes.data);
            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch data", err);
            setError("Failed to load templates");
            setLoading(false);
        }
    };

    const handleCreateClick = () => {
        setEditingTemplate(null);
        setShowBuilder(true);
    };

    const handleEditClick = (template) => {
        setEditingTemplate(template);
        setShowBuilder(true);
    };

    const handleBuilderClose = () => {
        setShowBuilder(false);
        setEditingTemplate(null);
    };

    const handleBuilderSave = async (payload, templateId) => {
        try {
            if (templateId) {
                await fractalApi.updateSessionTemplate(rootId, templateId, payload);
            } else {
                await fractalApi.createSessionTemplate(rootId, payload);
            }

            await fetchData();
            setShowBuilder(false);
            setEditingTemplate(null);

            notify.success(`Template ${templateId ? 'updated' : 'created'} successfully!`);
        } catch (err) {
            console.error("Failed to save template", err);
            notify.error('Failed to save template: ' + err.message);
        }
    };

    const handleDeleteClick = (template) => {
        setTemplateToDelete(template);
    };

    const handleConfirmDelete = async () => {
        if (!templateToDelete) return;
        try {
            await fractalApi.deleteSessionTemplate(rootId, templateToDelete.id);
            await fetchData();
            setTemplateToDelete(null);
        } catch (err) {
            console.error("Failed to delete template", err);
            setError("Failed to delete template");
            setTemplateToDelete(null);
        }
    };

    const handleDuplicate = async (template) => {
        try {
            const payload = {
                name: `${template.name} (Copy)`,
                description: template.description || '',
                template_data: template.template_data
            };

            await fractalApi.createSessionTemplate(rootId, payload);
            await fetchData();

            notify.success('Template duplicated successfully!');
        } catch (err) {
            console.error("Failed to duplicate template", err);
            notify.error('Failed to duplicate template: ' + err.message);
        }
    };

    if (loading) {
        return <div className="page-container" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-primary)' }}>Loading templates...</div>;
    }

    return (
        <div className="page-container">
            {/* Header with Create Button */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0 0 20px 0',
                borderBottom: '1px solid var(--color-border)',
                marginBottom: '30px'
            }}>
                <h1 style={{ fontWeight: 300, margin: 0, fontSize: '28px', color: 'var(--color-text-primary)' }}>
                    Manage Session Templates
                </h1>
                <button
                    onClick={handleCreateClick}
                    style={{
                        padding: '10px 20px',
                        background: 'var(--color-brand-primary)',
                        border: '1px solid var(--color-border-btn)',
                        borderRadius: '6px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                        transition: 'background 0.2s'
                    }}
                    className="hover-brighten"
                >
                    + Create Template
                </button>
            </div>

            {error && (
                <div style={{
                    padding: '12px 16px',
                    background: 'rgba(244, 67, 54, 0.1)',
                    color: '#f44336',
                    marginBottom: '20px',
                    borderRadius: '6px',
                    border: '1px solid rgba(244, 67, 54, 0.2)'
                }}>
                    {error}
                </div>
            )}

            {/* Templates Grid */}
            <div style={{ paddingBottom: '40px' }}>
                {templates.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '60px 20px',
                        background: 'var(--color-bg-card)',
                        border: '1px dashed var(--color-border)',
                        borderRadius: '8px'
                    }}>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '16px', marginBottom: '20px' }}>
                            No session templates created yet
                        </p>
                        <button
                            onClick={handleCreateClick}
                            style={{
                                padding: '12px 24px',
                                background: '#4caf50',
                                border: '1px solid var(--color-border-btn)',
                                borderRadius: '6px',
                                color: 'white',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                cursor: 'pointer'
                            }}
                        >
                            + Create Your First Template
                        </button>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '20px'
                    }}>
                        {templates.map(template => (
                            <TemplateCard
                                key={template.id}
                                template={template}
                                onEdit={handleEditClick}
                                onDelete={handleDeleteClick}
                                onDuplicate={handleDuplicate}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Template Builder Modal */}
            <TemplateBuilderModal
                isOpen={showBuilder}
                onClose={handleBuilderClose}
                onSave={handleBuilderSave}
                editingTemplate={editingTemplate}
                activities={activities}
                activityGroups={activityGroups}
                rootId={rootId}
            />

            {/* Delete Confirmation Modal */}
            <DeleteConfirmModal
                isOpen={!!templateToDelete}
                onClose={() => setTemplateToDelete(null)}
                onConfirm={handleConfirmDelete}
                title="Delete Template"
                message={`Are you sure you want to delete "${templateToDelete?.name}"? This action cannot be undone.`}
            />


        </div>
    );
}

export default CreateSessionTemplate;
