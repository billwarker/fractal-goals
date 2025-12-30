import React, { useState, useEffect } from 'react';
import { useActivities } from '../../contexts/ActivitiesContext';

export default function GroupBuilderModal({ isOpen, onClose, editingGroup, rootId, onSave }) {
    const { createActivityGroup, updateActivityGroup } = useActivities();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (editingGroup) {
            setName(editingGroup.name);
            setDescription(editingGroup.description || '');
        } else {
            setName('');
            setDescription('');
        }
    }, [editingGroup, isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (editingGroup) {
                await updateActivityGroup(rootId, editingGroup.id, { name, description });
            } else {
                await createActivityGroup(rootId, { name, description });
            }
            onSave?.();
            onClose();
        } catch (err) {
            console.error("Failed to save group", err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={onClose}>
            <div style={{
                background: '#1e1e1e', padding: '24px', borderRadius: '8px', width: '400px',
                border: '1px solid #333', color: 'white', display: 'flex', flexDirection: 'column', gap: '20px'
            }} onClick={e => e.stopPropagation()}>
                <h2 style={{ fontSize: '20px', fontWeight: 300, margin: 0 }}>
                    {editingGroup ? 'Edit Group' : 'Create Group'}
                </h2>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            style={{ width: '100%', padding: '10px', background: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: 'white', boxSizing: 'border-box' }}
                            required
                            autoFocus
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#aaa', marginBottom: '5px' }}>Description</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            style={{ width: '100%', padding: '10px', background: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', color: 'white', minHeight: '80px', fontFamily: 'inherit', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                        <button type="button" onClick={onClose} style={{ padding: '10px 16px', background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" disabled={loading} style={{ padding: '10px 24px', background: '#2196f3', border: 'none', borderRadius: '4px', color: 'white', cursor: 'pointer', opacity: loading ? 0.7 : 1, fontWeight: 'bold' }}>
                            {loading ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
