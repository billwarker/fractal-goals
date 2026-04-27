import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { queryKeys } from '../hooks/queryKeys';
import { useActivities, useActivityGroups } from '../hooks/useActivityQueries';
import { useSessionTemplates } from '../hooks/useSessionTemplateQueries';
import notify from '../utils/notify';
import TemplateCard from '../components/TemplateCard';
import TemplateBuilderModal from '../components/modals/TemplateBuilderModal';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import PageHeader from '../components/layout/PageHeader';
import headerStyles from '../components/layout/PageHeader.module.css';
import HeaderButton from '../components/layout/HeaderButton';
import styles from './CreateSessionTemplate.module.css';

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

    const { sessionTemplates: templates = [], isLoading: templatesLoading, error: templatesError } = useSessionTemplates(rootId);
    const { activities = [], isLoading: activitiesLoading, error: activitiesError } = useActivities(rootId);
    const { activityGroups = [], isLoading: activityGroupsLoading, error: activityGroupsError } = useActivityGroups(rootId);

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

    const loading = templatesLoading || activitiesLoading || activityGroupsLoading;
    const loadError = templatesError || activitiesError || activityGroupsError;

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
            setEditingTemplate({
                ...template,
                id: null,
                name: `${template.name} (Copy)`,
            });
            setShowBuilder(true);
            setError(null);
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
        <div className={headerStyles.pageShell}>
            <PageHeader
                title="Manage Session Templates"
                subtitle="Build reusable session structures from your activity library."
                actions={(
                    <HeaderButton variant="primary" onClick={handleCreateClick}>
                        + Create Template
                    </HeaderButton>
                )}
            />

            <div className={`${headerStyles.scrollContent} ${headerStyles.gridContent} ${styles.content}`}>
                {error && (
                    <div className={styles.errorMessage}>
                        {error}
                    </div>
                )}

                {templates.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p className={styles.emptyText}>
                            No session templates created yet
                        </p>
                        <HeaderButton variant="primary" onClick={handleCreateClick} className={styles.createFirstButton}>
                            + Create Your First Template
                        </HeaderButton>
                    </div>
                ) : (
                    <div className={styles.templatesGrid}>
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
