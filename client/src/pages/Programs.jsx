import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import ProgramBuilder from '../components/modals/ProgramBuilder';
import DeleteProgramModal from '../components/modals/DeleteProgramModal';
import { isBlockActive, ActiveBlockBadge } from '../utils/programUtils.jsx';
import '../App.css';

const GOAL_COLORS = {
    Amercement: '#FF6B6B',
    Anchoring: '#4ECDC4',
    Balance: '#FFE66D',
    ShortTermGoal: '#FF9F1C',
    ImmediateGoal: '#FFD166',
    Value: '#A06CD5',
    Vision: '#3A86FF',
    LongTermGoal: '#7B5CFF',
    MidTermGoal: '#3A86FF'
};

/**
 * Programs Page - Create and manage training programs
 */
function Programs() {
    const { rootId, programId } = useParams();
    const navigate = useNavigate();
    const [showBuilder, setShowBuilder] = useState(false);
    const [programs, setPrograms] = useState([]);
    const [goals, setGoals] = useState([]);
    const [selectedProgram, setSelectedProgram] = useState(null);
    const [loading, setLoading] = useState(true);

    // Delete modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [programToDelete, setProgramToDelete] = useState(null);
    const [deleteSessionCount, setDeleteSessionCount] = useState(0);

    useEffect(() => {
        if (rootId) {
            Promise.all([fetchPrograms(), fetchGoals()]);
        }
    }, [rootId]);

    // If programId is in URL, fetch and open that program for editing
    useEffect(() => {
        if (programId && programs.length > 0) {
            const program = programs.find(p => p.id === programId);
            if (program) {
                setSelectedProgram(program);
                setShowBuilder(true);
            }
        }
    }, [programId, programs]);

    // Check for active program redirection
    const searchParams = new URL(window.location.href).searchParams;
    const showAll = searchParams.get('show_all') === 'true';

    const fetchPrograms = async () => {
        try {
            const res = await fractalApi.getPrograms(rootId);
            setPrograms(res.data);

            // Auto-redirect to active program if not suppressed
            if (!showAll && !programId) {
                const activeProgram = res.data.find(p => p.is_active);
                if (activeProgram) {
                    navigate(`/${rootId}/programs/${activeProgram.id}`, { replace: true });
                }
            }
        } catch (err) {
            console.error('Failed to fetch programs:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchGoals = async () => {
        try {
            const res = await fractalApi.getGoals(rootId);
            const allGoals = [];
            const collect = (g) => {
                allGoals.push(g);
                if (g.children) g.children.forEach(collect);
            };
            if (res.data) collect(res.data);
            setGoals(allGoals);
        } catch (err) { console.error(err); }
    };

    const getGoalDetails = (id) => goals.find(g => g.id === id);

    const handleSaveProgram = async (programData) => {
        try {
            // Format the data for the API
            const apiData = {
                name: programData.name,
                description: programData.description || '',
                start_date: programData.startDate,
                end_date: programData.endDate,
                selectedGoals: programData.selectedGoals,
                // On creation/list view update, we don't change the schedule from the modal
                // If selectedProgram exists, keep its schedule. If new, it's empty.
                weeklySchedule: selectedProgram ? selectedProgram.weekly_schedule : []
            };

            let savedProgramId;
            if (selectedProgram) {
                await fractalApi.updateProgram(rootId, selectedProgram.id, apiData);
                savedProgramId = selectedProgram.id;
            } else {
                const res = await fractalApi.createProgram(rootId, apiData);
                savedProgramId = res.data.id;
            }

            // Navigate to detail view
            navigate(`/${rootId}/programs/${savedProgramId}`);
            setShowBuilder(false);
            setSelectedProgram(null);
        } catch (err) {
            console.error('Failed to save program:', err);
            alert('Failed to save program: ' + (err.response?.data?.error || err.message));
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    const handleDeleteProgram = async (e, program) => {
        e.stopPropagation(); // Prevent navigation to program detail

        try {
            // Get the session count first
            const countRes = await fractalApi.getProgramSessionCount(rootId, program.id);
            const sessionCount = countRes.data.session_count;

            // Set state and open modal
            setProgramToDelete(program);
            setDeleteSessionCount(sessionCount);
            setShowDeleteModal(true);
        } catch (err) {
            console.error('Failed to fetch session count:', err);
            alert('Failed to fetch session count: ' + (err.response?.data?.error || err.message));
        }
    };

    const confirmDeleteProgram = async () => {
        if (!programToDelete) return;

        try {
            await fractalApi.deleteProgram(rootId, programToDelete.id);
            setShowDeleteModal(false);
            setProgramToDelete(null);
            setDeleteSessionCount(0);
            fetchPrograms(); // Refresh the list
        } catch (err) {
            console.error('Failed to delete program:', err);
            alert('Failed to delete program: ' + (err.response?.data?.error || err.message));
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            width: '100%',
            overflow: 'hidden'
        }}>
            {/* Page Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '80px 40px 20px 40px',
                background: 'var(--bg-color)',
                borderBottom: '1px solid #333',
                zIndex: 10
            }}>
                <h1 style={{
                    margin: 0,
                    fontSize: '28px',
                    fontWeight: 300,
                    color: 'white'
                }}>
                    Programs
                </h1>

                <button
                    onClick={() => setShowBuilder(true)}
                    style={{
                        padding: '8px 20px',
                        background: '#4caf50',
                        border: 'none',
                        borderRadius: '6px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#45a049'}
                    onMouseLeave={(e) => e.target.style.background = '#4caf50'}
                >
                    <span style={{ fontSize: '18px' }}>+</span>
                    New Program
                </button>
            </div>

            {/* Programs List */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 40px',
                paddingBottom: '40px'
            }}>
                {programs.length === 0 ? (
                    <div style={{
                        background: '#1e1e1e',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        padding: '60px 40px',
                        textAlign: 'center'
                    }}>
                        <div style={{
                            fontSize: '48px',
                            marginBottom: '20px',
                            opacity: 0.3
                        }}>
                            📋
                        </div>
                        <h2 style={{
                            fontSize: '24px',
                            marginBottom: '12px',
                            fontWeight: 400,
                            color: 'white'
                        }}>
                            No Programs Yet
                        </h2>
                        <p style={{
                            color: '#aaa',
                            fontSize: '15px',
                            lineHeight: '1.6',
                            maxWidth: '500px',
                            margin: '0 auto 24px'
                        }}>
                            Create your first training program to organize your sessions into a structured weekly schedule.
                        </p>
                        <button
                            onClick={() => setShowBuilder(true)}
                            style={{
                                padding: '12px 24px',
                                background: '#4caf50',
                                border: 'none',
                                borderRadius: '6px',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 600
                            }}
                        >
                            Create Your First Program
                        </button>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                        gap: '20px'
                    }}>
                        {programs.map(program => {
                            const progGoals = program.goal_ids?.map(id => getGoalDetails(id)).filter(Boolean) || [];
                            const blocks = program.blocks || []; // Rename for clarity

                            return (
                                <div
                                    key={program.id}
                                    onClick={() => navigate(`/${rootId}/programs/${program.id}`)}
                                    style={{
                                        background: '#1e1e1e',
                                        border: '1px solid #333',
                                        borderRadius: '8px',
                                        padding: '20px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        position: 'relative',
                                        overflow: 'hidden'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = '#2196f3';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = '#333';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                    }}
                                >
                                    {/* Delete Button - Top Right */}
                                    <button
                                        className="delete-btn"
                                        onClick={(e) => handleDeleteProgram(e, program)}
                                        title="Delete Program"
                                        style={{ position: 'absolute', top: '8px', right: '8px' }}
                                    >
                                        ×
                                    </button>

                                    {/* Program Header */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <h3 style={{
                                            margin: '0 0 8px 0',
                                            fontSize: '18px',
                                            fontWeight: 600,
                                            color: 'white'
                                        }}>
                                            {program.name}
                                        </h3>
                                        <div style={{
                                            fontSize: '13px',
                                            color: '#888',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            <span>📅</span>
                                            <span>{formatDate(program.start_date)} - {formatDate(program.end_date)}</span>
                                        </div>
                                    </div>

                                    {/* Goals */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{
                                            fontSize: '11px',
                                            color: '#888',
                                            marginBottom: '8px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                        }}>
                                            Selected Goals
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {(() => {
                                                const grouped = progGoals.reduce((acc, g) => {
                                                    const goalType = g.attributes?.type || g.type; // Try attributes.type first, fallback to g.type
                                                    if (goalType) {  // Only count goals with a defined type
                                                        acc[goalType] = (acc[goalType] || 0) + 1;
                                                    }
                                                    return acc;
                                                }, {});
                                                const entries = Object.entries(grouped);

                                                return progGoals.length > 0 ? (
                                                    entries.map(([type, count]) => (
                                                        <div key={type} style={{
                                                            color: GOAL_COLORS[type] || '#ccc',
                                                            fontSize: '13px',
                                                            fontWeight: 500
                                                        }}>
                                                            {count} {type.replace(/([A-Z])/g, ' $1').trim()}{count !== 1 ? 's' : ''}
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div style={{ fontSize: '13px', color: '#666' }}>No goals selected</div>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Blocks Summary */}
                                    <div style={{
                                        background: '#252525',
                                        borderRadius: '6px',
                                        padding: '12px',
                                        marginBottom: '12px'
                                    }}>
                                        <div style={{
                                            fontSize: '11px',
                                            color: '#888',
                                            marginBottom: '8px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px'
                                        }}>
                                            Blocks
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {blocks.length > 0 ? blocks.map(b => {
                                                const isActive = isBlockActive(b);
                                                return (
                                                    <div key={b.id} style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        fontSize: '12px',
                                                        color: '#ccc',
                                                        borderBottom: '1px solid #333',
                                                        paddingBottom: '4px',
                                                        gap: '8px'
                                                    }}>
                                                        <span style={{ flex: 1 }}>{b.name}</span>
                                                        {isActive && <ActiveBlockBadge />}
                                                        <span style={{ color: '#888', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                            {b.start_date && b.end_date
                                                                ? `${formatDate(b.start_date)} - ${formatDate(b.end_date)}`
                                                                : 'Flexible'
                                                            }
                                                        </span>
                                                    </div>
                                                );
                                            }) : (
                                                <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>No blocks defined</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Stats */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: '12px',
                                        color: '#aaa'
                                    }}>
                                        <span>Total Blocks: <strong style={{ color: 'white' }}>{blocks.length}</strong></span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Program Builder Modal */}
            <ProgramBuilder
                isOpen={showBuilder}
                onClose={() => {
                    setShowBuilder(false);
                    setSelectedProgram(null);
                    if (programId) {
                        navigate(`/${rootId}/programs`);
                    }
                }}
                onSave={handleSaveProgram}
                initialData={selectedProgram}
            />

            {/* Delete Program Modal */}
            <DeleteProgramModal
                isOpen={showDeleteModal}
                onClose={() => {
                    setShowDeleteModal(false);
                    setProgramToDelete(null);
                    setDeleteSessionCount(0);
                }}
                onConfirm={confirmDeleteProgram}
                programName={programToDelete?.name || ''}
                sessionCount={deleteSessionCount}
                requireMatchingText="delete"
            />
        </div>
    );
}

export default Programs;
