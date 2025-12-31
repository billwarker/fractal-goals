import React, { useState, useEffect } from 'react';
import { legacyApi, fractalApi } from '../../utils/api';
import moment from 'moment';

const ProgramDayModal = ({ isOpen, onClose, onSave, onCopy, onDelete, rootId, blockId, initialData }) => {
    const [name, setName] = useState('');
    const [selectedTemplates, setSelectedTemplates] = useState([]);
    const [dayOfWeek, setDayOfWeek] = useState('');
    const [cascade, setCascade] = useState(false);
    const [sessionTemplates, setSessionTemplates] = useState([]);
    const [copyStatus, setCopyStatus] = useState('');
    const [copyMode, setCopyMode] = useState('all');

    const isEdit = !!initialData;

    useEffect(() => {
        const fetchTemplates = async () => {
            if (!rootId) return;
            try {
                const res = await fractalApi.getSessionTemplates(rootId);
                setSessionTemplates(res.data);
            } catch (err) {
                console.error("Failed to fetch templates");
            }
        };
        if (isOpen) fetchTemplates();
    }, [isOpen, rootId]);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name || '');
                // Try to infer DoW from date if exists, rarely used for edit but good to have
                if (initialData.date) {
                    setDayOfWeek(moment(initialData.date).format('dddd'));
                } else {
                    setDayOfWeek('');
                }

                const tids = initialData.sessions?.map(s => s.session_template_id).filter(Boolean) || [];
                setSelectedTemplates(tids);
                setCascade(false);
            } else {
                setName('');
                setDayOfWeek('');
                setSelectedTemplates([]);
                setCascade(false);
            }
            setCopyStatus('');
        }
    }, [isOpen, initialData]);

    const handleSave = () => {
        onSave({
            name,
            template_ids: selectedTemplates,
            day_of_week: dayOfWeek,
            cascade
        });
    };

    const handleCopy = async () => {
        if (!onCopy) return;
        setCopyStatus('Copying...');
        try {
            await onCopy(initialData.id, { target_mode: copyMode });
            setCopyStatus('Copied!');
        } catch (err) {
            setCopyStatus('Error');
        }
    };

    const handleDelete = () => {
        if (window.confirm('Are you sure you want to delete this day?')) {
            onDelete(initialData.id);
        }
    };

    const handleAddTemplate = (e) => {
        const val = e.target.value;
        if (val) {
            setSelectedTemplates([...selectedTemplates, val]);
        }
    };

    if (!isOpen) return null;

    const overlay = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    };

    const content = {
        background: '#1e1e1e', padding: '24px', borderRadius: '8px', width: '500px',
        border: '1px solid #333', boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
    };

    const label = { color: '#ccc', display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 500 };
    const input = { width: '100%', padding: '10px', background: '#333', border: '1px solid #444', color: 'white', borderRadius: '4px', fontSize: '14px' };

    return (
        <div style={overlay}>
            <div style={content}>
                <h2 style={{ color: 'white', marginTop: 0, marginBottom: '20px', fontSize: '18px' }}>
                    {isEdit ? 'Edit Program Day' : 'Add Program Day'}
                </h2>

                <div style={{ marginBottom: '20px' }}>
                    <label style={label}>Name (e.g. "Leg Day" or "Day 1")</label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Day Name"
                        style={input}
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={label}>Sessions</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                        {selectedTemplates.map((tid, idx) => {
                            const t = sessionTemplates.find(st => st.id === tid);
                            return (
                                <div key={idx} style={{ background: '#333', padding: '8px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'white', fontSize: '13px' }}>{t ? t.name : 'Unknown Template'}</span>
                                    <button
                                        onClick={() => {
                                            const newTids = [...selectedTemplates];
                                            newTids.splice(idx, 1);
                                            setSelectedTemplates(newTids);
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '16px' }}
                                    >
                                        &times;
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    <select
                        value=""
                        onChange={handleAddTemplate}
                        style={input}
                    >
                        <option value="">+ Add Session Template</option>
                        {sessionTemplates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>

                {!isEdit && (
                    <div style={{ marginBottom: '20px' }}>
                        <label style={label}>Optional Day of Week (For Date Mapping)</label>
                        <select value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)} style={input}>
                            <option value="">None (Abstract Day)</option>
                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                        type="checkbox"
                        checked={cascade}
                        onChange={e => setCascade(e.target.checked)}
                        id="cascade-check"
                    />
                    <label htmlFor="cascade-check" style={{ color: '#ddd', fontSize: '13px' }}>
                        Cascade this day to subsequent blocks
                    </label>
                </div>

                {isEdit && (
                    <div style={{ marginBottom: '20px', paddingTop: '20px', borderTop: '1px solid #333' }}>
                        <label style={label}>Copy to Other Blocks</label>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <label style={{ color: '#ddd', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <input type="radio" checked={copyMode === 'all'} onChange={() => setCopyMode('all')} />
                                    All Blocks
                                </label>
                            </div>
                            <button
                                onClick={handleCopy}
                                style={{ background: '#333', border: '1px solid #444', color: 'white', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                            >
                                {copyStatus || 'Copy Now'}
                            </button>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                    {isEdit ? (
                        <button onClick={handleDelete} style={{ background: '#d32f2f', border: 'none', color: 'white', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>Delete Day</button>
                    ) : <div></div>}

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={onClose} style={{ background: 'transparent', border: '1px solid #444', color: '#ccc', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={handleSave} style={{ background: '#3A86FF', border: 'none', color: 'white', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                            {isEdit ? 'Save Changes' : 'Add Day'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProgramDayModal;
