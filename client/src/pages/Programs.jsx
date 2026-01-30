import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import ProgramBuilder from '../components/modals/ProgramBuilder';
import DeleteProgramModal from '../components/modals/DeleteProgramModal';
import { isBlockActive, ActiveBlockBadge } from '../utils/programUtils.jsx';
import styles from './Programs.module.css'; // Import CSS Module
import notify from '../utils/notify';
import { Heading, Text } from '../components/atoms/Typography';

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
            notify.error('Failed to save program: ' + (err.response?.data?.error || err.message));
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
            notify.error('Failed to fetch session count: ' + (err.response?.data?.error || err.message));
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
            notify.error('Failed to delete program: ' + (err.response?.data?.error || err.message));
        }
    };

    return (
        <div className={styles.container}>
            {/* Page Header */}
            <div className={styles.header}>
                <Heading level={1} className={styles.title}>
                    Programs
                </Heading>

                <button
                    onClick={() => setShowBuilder(true)}
                    className={styles.newProgramBtn}
                >
                    <span className={styles.plusIcon}>+</span>
                    New Program
                </button>
            </div>

            {/* Programs List */}
            <div className={styles.content}>
                {programs.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                            📋
                        </div>
                        <Heading level={2} className={styles.emptyTitle}>
                            No Programs Yet
                        </Heading>
                        <Text className={styles.emptyText}>
                            Create your first training program to organize your sessions into a structured weekly schedule.
                        </Text>
                        <button
                            onClick={() => setShowBuilder(true)}
                            className={styles.createFirstBtn}
                        >
                            Create Your First Program
                        </button>
                    </div>
                ) : (
                    <div className={styles.grid}>
                        {programs.map(program => {
                            const progGoals = program.goal_ids?.map(id => getGoalDetails(id)).filter(Boolean) || [];
                            const blocks = program.blocks || []; // Rename for clarity

                            return (
                                <div
                                    key={program.id}
                                    onClick={() => navigate(`/${rootId}/programs/${program.id}`)}
                                    className={styles.card}
                                >
                                    {/* Delete Button - Top Right */}
                                    <button
                                        className={styles.deleteBtn}
                                        onClick={(e) => handleDeleteProgram(e, program)}
                                        title="Delete Program"
                                    >
                                        ×
                                    </button>

                                    {/* Program Header */}
                                    <div className={styles.cardHeader}>
                                        <Heading level={3} className={styles.cardTitle}>
                                            {program.name}
                                        </Heading>
                                        <div className={styles.dateRange}>
                                            <span>📅</span>
                                            <span>{formatDate(program.start_date)} - {formatDate(program.end_date)}</span>
                                        </div>
                                    </div>

                                    {/* Goals */}
                                    <div className={styles.goalsSection}>
                                        <Heading level={6} className={styles.sectionLabel} color="secondary">
                                            Selected Goals
                                        </Heading>
                                        <div className={styles.goalList}>
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
                                                        <div key={type} className={styles.goalItem} style={{
                                                            color: GOAL_COLORS[type] || '#ccc',
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
                                    <div className={styles.blocksSection}>
                                        <Heading level={6} className={styles.sectionLabel} color="secondary">
                                            Blocks
                                        </Heading>
                                        <div className={styles.blockList}>
                                            {blocks.length > 0 ? blocks.map(b => {
                                                const isActive = isBlockActive(b);
                                                return (
                                                    <div key={b.id} className={styles.blockRow}>
                                                        <span style={{ flex: 1 }}>{b.name}</span>
                                                        {isActive && <ActiveBlockBadge />}
                                                        <span className={styles.blockDates}>
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
                                    <div className={styles.statsFooter}>
                                        <span>Total Blocks: <strong className={styles.statValue}>{blocks.length}</strong></span>
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
