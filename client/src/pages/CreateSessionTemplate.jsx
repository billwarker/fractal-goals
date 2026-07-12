import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { queryKeys } from '../hooks/queryKeys';
import { invalidateOnboardingProgress } from '../utils/queryInvalidation';
import { useActivities, useActivityGroups } from '../hooks/useActivityQueries';
import { useSessionTemplates } from '../hooks/useSessionTemplateQueries';
import notify from '../utils/notify';
import TemplateCard from '../components/TemplateCard';
import TemplateBuilderModal from '../components/modals/TemplateBuilderModal';
import DeleteConfirmModal from '../components/modals/DeleteConfirmModal';
import PageHeader from '../components/layout/PageHeader';
import headerStyles from '../components/layout/PageHeader.module.css';
import HeaderButton from '../components/layout/HeaderButton';
import { getTemplateSortTimestamp } from '../utils/durationStats';
import styles from './CreateSessionTemplate.module.css';
import { logError } from '../utils/logger';

function readStoredSort(rootId) {
    try {
        const storage = window?.localStorage;
        if (!storage || typeof storage.getItem !== 'function') return 'recentlyUsed';
        return storage.getItem(`sessionTemplateSort:${rootId}`) || 'recentlyUsed';
    } catch {
        return 'recentlyUsed';
    }
}

function writeStoredSort(rootId, sortMode) {
    try {
        const storage = window?.localStorage;
        if (!storage || typeof storage.setItem !== 'function') return;
        storage.setItem(`sessionTemplateSort:${rootId}`, sortMode);
    } catch {
        // localStorage can be unavailable in test/private contexts.
    }
}

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
    const [sortMode, setSortMode] = useState(() => readStoredSort(rootId));

    useEffect(() => {
        if (!rootId) {
            navigate('/');
        }
    }, [rootId, navigate]);

    useEffect(() => {
        if (!rootId) return;
        writeStoredSort(rootId, sortMode);
    }, [rootId, sortMode]);

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
            await invalidateOnboardingProgress(queryClient, queryKeys);
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
            await invalidateOnboardingProgress(queryClient, queryKeys);
            setTemplateToDelete(null);
            setError(null);
        },
    });

    const archiveTemplateMutation = useMutation({
        mutationFn: async ({ templateId, isArchived }) => {
            await fractalApi.updateSessionTemplate(rootId, templateId, { is_archived: isArchived });
        },
        onSuccess: async (_, variables) => {
            await queryClient.invalidateQueries({ queryKey: queryKeys.sessionTemplates(rootId) });
            setError(null);
            notify.success(`Template ${variables.isArchived ? 'archived' : 'reactivated'} successfully!`);
        },
    });

    const loading = templatesLoading || activitiesLoading || activityGroupsLoading;
    const loadError = templatesError || activitiesError || activityGroupsError;
    const sortedTemplates = [...templates].sort((a, b) => {
        if (sortMode === 'name') return a.name.localeCompare(b.name);
        if (sortMode === 'recentlyUpdated') {
            return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '');
        }
        if (sortMode === 'mostUsed') {
            return Number(b.stats?.usage_count || 0) - Number(a.stats?.usage_count || 0);
        }
        return getTemplateSortTimestamp(b).localeCompare(getTemplateSortTimestamp(a));
    });
    const activeTemplates = sortedTemplates.filter((template) => !template.is_archived || template.is_used_in_active_program);
    const archivedTemplates = sortedTemplates.filter((template) => template.is_archived && !template.is_used_in_active_program);

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
            logError("Failed to save template", err);
            setError('Failed to save template');
            notify.error('Failed to save template: ' + err.message);
        }
    };

    const handleDeleteClick = (template) => {
        setTemplateToDelete(template);
    };

    const handleArchiveToggle = async (template) => {
        try {
            await archiveTemplateMutation.mutateAsync({
                templateId: template.id,
                isArchived: !template.is_archived,
            });
        } catch (err) {
            logError("Failed to update template archive state", err);
            setError('Failed to update template archive state');
            notify.error('Failed to update template: ' + err.message);
        }
    };

    const handleConfirmDelete = async () => {
        if (!templateToDelete) return;
        try {
            await deleteTemplateMutation.mutateAsync(templateToDelete.id);
        } catch (err) {
            logError("Failed to delete template", err);
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
            logError("Failed to duplicate template", err);
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
                    <>
                        {templates.length > 0 && (
                            <label className={styles.sortLabel}>
                                Sort
                                <select
                                    className={styles.sortSelect}
                                    value={sortMode}
                                    onChange={(event) => setSortMode(event.target.value)}
                                >
                                    <option value="recentlyUsed">Recently used</option>
                                    <option value="recentlyUpdated">Recently updated</option>
                                    <option value="mostUsed">Most used</option>
                                    <option value="name">Name A-Z</option>
                                </select>
                            </label>
                        )}
                        <HeaderButton variant="primary" onClick={handleCreateClick}>
                            + Create Template
                        </HeaderButton>
                    </>
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
                    <div className={styles.templateSections}>
                        <div className={styles.templatesGrid}>
                            {activeTemplates.map(template => (
                                <TemplateCard
                                    key={template.id}
                                    template={template}
                                    onEdit={handleEditClick}
                                    onDelete={handleDeleteClick}
                                    onDuplicate={handleDuplicate}
                                    onArchiveToggle={handleArchiveToggle}
                                />
                            ))}
                        </div>

                        {archivedTemplates.length > 0 && (
                            <details className={styles.archivedSection}>
                                <summary className={styles.archivedSummary}>
                                    Archived templates ({archivedTemplates.length})
                                </summary>
                                <div className={styles.templatesGrid}>
                                    {archivedTemplates.map(template => (
                                        <TemplateCard
                                            key={template.id}
                                            template={template}
                                            onEdit={handleEditClick}
                                            onDelete={handleDeleteClick}
                                            onDuplicate={handleDuplicate}
                                            onArchiveToggle={handleArchiveToggle}
                                        />
                                    ))}
                                </div>
                            </details>
                        )}
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
