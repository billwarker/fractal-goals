import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { queryKeys } from '../hooks/queryKeys';
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
    const queryClient = useQueryClient();

    const [error, setError] = useState(null);

    // Modal states
    const [showBuilder, setShowBuilder] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [templateToDelete, setTemplateToDelete] = useState(null);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
        }
    }, [rootId, navigate]);

    const isReady = Boolean(rootId);

    const templatesQuery = useQuery({
        queryKey: queryKeys.sessionTemplates(rootId),
        queryFn: async () => {
            const response = await fractalApi.getSessionTemplates(rootId);
            return response.data || [];
        },
        enabled: isReady,
    });

    const activitiesQuery = useQuery({
        queryKey: queryKeys.activities(rootId),
        queryFn: async () => {
            const response = await fractalApi.getActivities(rootId);
            return response.data || [];
        },
        enabled: isReady,
    });

    const activityGroupsQuery = useQuery({
        queryKey: queryKeys.activityGroups(rootId),
        queryFn: async () => {
            const response = await fractalApi.getActivityGroups(rootId);
            return response.data || [];
        },
        enabled: isReady,
    });

    const saveTemplateMutation = useMutation({
        mutationFn: async ({ payload, templateId }) => {
            if (templateId) {
                await fractalApi.updateSessionTemplate(rootId, templateId, payload);
                return 'updated';
            }

            await fractalApi.createSessionTemplate(rootId, payload);
            return 'created';
        },
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sessionTemplates(rootId) });
            setShowBuilder(false);
            setEditingTemplate(null);
            setError(null);
            notify.success(`Template ${variables.templateId ? 'updated' : 'created'} successfully!`);
        },
    });

    const deleteTemplateMutation = useMutation({
        mutationFn: async (templateId) => {
            await fractalApi.deleteSessionTemplate(rootId, templateId);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sessionTemplates(rootId) });
            setTemplateToDelete(null);
            setError(null);
        },
    });

    const duplicateTemplateMutation = useMutation({
        mutationFn: async (template) => {
            const payload = {
                name: `${template.name} (Copy)`,
                description: template.description || '',
                template_data: template.template_data,
            };

            await fractalApi.createSessionTemplate(rootId, payload);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sessionTemplates(rootId) });
            setError(null);
            notify.success('Template duplicated successfully!');
        },
    });

    const templates = templatesQuery.data || [];
    const activities = activitiesQuery.data || [];
    const activityGroups = activityGroupsQuery.data || [];
    const loading = templatesQuery.isLoading || activitiesQuery.isLoading || activityGroupsQuery.isLoading;
    const loadError = templatesQuery.error || activitiesQuery.error || activityGroupsQuery.error;

    const handleCreateClick = () => {
        setEditingTemplate(null);
        setShowBuilder(true);
        setError(null);
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
            await saveTemplateMutation.mutateAsync({ payload, templateId });
        } catch (err) {
            console.error("Failed to save template", err);
            setError('Failed to save template');
            notify.error('Failed to save template: ' + err.message);
        }
    };

    const handleDeleteClick = (template) => {
        setTemplateToDelete(template);
    };

    const handleConfirmDelete = async () => {
        if (!templateToDelete) return;
        try {
            await deleteTemplateMutation.mutateAsync(templateToDelete.id);
        } catch (err) {
            console.error("Failed to delete template", err);
            setError("Failed to delete template");
            setTemplateToDelete(null);
        }
    };

    const handleDuplicate = async (template) => {
        try {
            await duplicateTemplateMutation.mutateAsync(template);
        } catch (err) {
            console.error("Failed to duplicate template", err);
            setError('Failed to duplicate template');
            notify.error('Failed to duplicate template: ' + err.message);
        }
    };

    if (loadError) {
        return (
            <div className="page-container" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-primary)' }}>
                Failed to load templates
            </div>
        );
    }

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
