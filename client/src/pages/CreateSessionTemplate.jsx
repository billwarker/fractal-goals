import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal states
    const [showBuilder, setShowBuilder] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [templateToDelete, setTemplateToDelete] = useState(null);

    // Alert/Success modal
    const [alertModal, setAlertModal] = useState({ show: false, title: '', message: '', type: 'info' });

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchData();
    }, [rootId, navigate]);

    const fetchData = async () => {
        try {
            const [templatesRes, activitiesRes] = await Promise.all([
                fractalApi.getSessionTemplates(rootId),
                fractalApi.getActivities(rootId)
            ]);
            setTemplates(templatesRes.data);
            setActivities(activitiesRes.data);
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

            setAlertModal({
                show: true,
                title: 'Success',
                message: `Template ${templateId ? 'updated' : 'created'} successfully!`,
                type: 'success'
            });
        } catch (err) {
            console.error("Failed to save template", err);
            setAlertModal({
                show: true,
                title: 'Error',
                message: 'Failed to save template: ' + err.message,
                type: 'error'
            });
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

            setAlertModal({
                show: true,
                title: 'Success',
                message: 'Template duplicated successfully!',
                type: 'success'
            });
        } catch (err) {
            console.error("Failed to duplicate template", err);
            setAlertModal({
                show: true,
                title: 'Error',
                message: 'Failed to duplicate template: ' + err.message,
                type: 'error'
            });
        }
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'white' }}>Loading templates...</div>;
    }

    return (
        <div className="page-container" style={{ color: 'white' }}>
            {/* Header with Create Button */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '80px 40px 20px 40px',
                borderBottom: '1px solid #333',
                marginBottom: '30px'
            }}>
                <h1 style={{ fontWeight: 300, margin: 0, fontSize: '28px' }}>
                    Manage Session Templates
                </h1>
                <button
                    onClick={handleCreateClick}
                    style={{
                        padding: '10px 20px',
                        background: '#2196f3',
                        border: 'none',
                        borderRadius: '6px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                        transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#1976d2'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#2196f3'}
                >
                    + Create Template
                </button>
            </div>

            {error && (
                <div style={{
                    padding: '12px 16px',
                    background: 'rgba(255,0,0,0.1)',
                    color: '#f44336',
                    margin: '0 40px 20px 40px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,0,0,0.2)'
                }}>
                    {error}
                </div>
            )}

            {/* Templates Grid */}
            <div style={{ padding: '0 40px 40px 40px' }}>
                {templates.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '60px 20px',
                        background: '#1e1e1e',
                        border: '1px dashed #444',
                        borderRadius: '8px'
                    }}>
                        <p style={{ color: '#666', fontSize: '16px', marginBottom: '20px' }}>
                            No session templates created yet
                        </p>
                        <button
                            onClick={handleCreateClick}
                            style={{
                                padding: '12px 24px',
                                background: '#4caf50',
                                border: 'none',
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

            {/* Alert/Success Modal */}
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
                            color: alertModal.type === 'error' ? '#f44336' :
                                alertModal.type === 'success' ? '#4caf50' : 'white'
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
                                background: alertModal.type === 'success' ? '#4caf50' : '#2196f3',
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

export default CreateSessionTemplate;
