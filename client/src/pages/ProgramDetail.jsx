import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { GOAL_COLORS, getGoalColor, getGoalTextColor } from '../utils/goalColors';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import moment from 'moment';
import ProgramBuilder from '../components/modals/ProgramBuilder';
import ProgramBlockModal from '../components/modals/ProgramBlockModal';
import ProgramDayModal from '../components/modals/ProgramDayModal';
import AttachGoalModal from '../components/modals/AttachGoalModal';
import DayViewModal from '../components/modals/DayViewModal';
import GoalDetailModal from '../components/GoalDetailModal';
import { isBlockActive, ActiveBlockBadge } from '../utils/programUtils.jsx';

const ProgramDetail = () => {
    const { rootId, programId } = useParams();
    const navigate = useNavigate();
    const [program, setProgram] = useState(null);
    const [loading, setLoading] = useState(true);
    const [goals, setGoals] = useState([]);
    const [activities, setActivities] = useState([]);
    const [showEditBuilder, setShowEditBuilder] = useState(false);

    // View Mode
    const [viewMode, setViewMode] = useState('calendar'); // 'calendar' or 'blocks'

    // Block Modal State
    const [showBlockModal, setShowBlockModal] = useState(false);
    const [blockModalData, setBlockModalData] = useState(null);

    // Day Modal State
    const [showDayModal, setShowDayModal] = useState(false);
    const [selectedBlockId, setSelectedBlockId] = useState(null);
    const [dayModalInitialData, setDayModalInitialData] = useState(null);

    // Attach Goal Modal State
    const [showAttachModal, setShowAttachModal] = useState(false);
    const [attachBlockId, setAttachBlockId] = useState(null);

    // Block Creation Mode (for calendar date selection)
    const [blockCreationMode, setBlockCreationMode] = useState(false);

    // Day View Modal State (for viewing/adding days to a specific date)
    const [showDayViewModal, setShowDayViewModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState(null);

    // Goal Detail Modal State (for calendar clicks)
    const [showGoalModal, setShowGoalModal] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState(null);

    useEffect(() => {
        if (rootId && programId) {
            fetchProgramData();
            fetchGoals();
            fetchActivities();
        }
    }, [rootId, programId]);

    const fetchProgramData = async () => {
        try {
            const res = await fractalApi.getProgram(rootId, programId);
            setProgram(res.data);
        } catch (err) {
            console.error('Failed to fetch program:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchGoals = async () => {
        try {
            const res = await fractalApi.getGoal(rootId, rootId);
            const allGoals = collectGoals(res.data);
            setGoals(allGoals);
        } catch (err) {
            console.error('Failed to fetch goals:', err);
        }
    };

    const fetchActivities = async () => {
        try {
            const res = await fractalApi.getActivities(rootId);
            setActivities(res.data);
        } catch (err) {
            console.error('Failed to fetch activities:', err);
        }
    };

    const collectGoals = (goal, collected = []) => {
        if (goal) {
            collected.push(goal);
            if (goal.children && Array.isArray(goal.children)) {
                goal.children.forEach(child => collectGoals(child, collected));
            }
        }
        return collected;
    };

    const getGoalDetails = (goalId) => {
        return goals.find(g => g.id === goalId);
    };

    const formatDate = (dateString, format = 'MMM D, YYYY') => {
        if (!dateString) return '';
        return moment(dateString).format(format);
    };

    const handleSaveProgram = async (programData) => {
        try {
            const apiData = {
                name: programData.name,
                description: programData.description || '',
                start_date: programData.startDate,
                end_date: programData.endDate,
                selectedGoals: programData.selectedGoals,
                weeklySchedule: Array.isArray(program.weekly_schedule) ? program.weekly_schedule : []
            };

            await fractalApi.updateProgram(rootId, program.id, apiData);
            fetchProgramData();
            setShowEditBuilder(false);
        } catch (err) {
            console.error('Failed to update program:', err);
            alert('Failed to update program: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleDateSelect = (selectInfo) => {
        const calendarApi = selectInfo.view.calendar;
        calendarApi.unselect();

        // If block creation mode is enabled, create a new block
        if (blockCreationMode) {
            const startDate = selectInfo.startStr;
            const endDate = moment(selectInfo.endStr).subtract(1, 'days').format('YYYY-MM-DD');

            setBlockModalData({
                name: '',
                startDate,
                endDate,
                color: '#3A86FF'
            });
            setShowBlockModal(true);
        } else {
            // Otherwise, show the day view modal for the clicked date
            const clickedDate = selectInfo.startStr;
            setSelectedDate(clickedDate);
            setShowDayViewModal(true);
        }
    };

    const handleAddBlockClick = () => {
        setBlockModalData({
            name: '',
            startDate: '',
            endDate: '',
            color: '#3A86FF'
        });
        setShowBlockModal(true);
    };

    const handleEditBlockClick = (block) => {
        setBlockModalData({
            id: block.id,
            name: block.name,
            startDate: block.start_date,
            endDate: block.end_date,
            color: block.color || '#3A86FF'
        });
        setShowBlockModal(true);
    };

    const handleSaveBlock = async (blockData) => {
        const currentSchedule = Array.isArray(program.weekly_schedule) ? program.weekly_schedule : [];
        let updatedSchedule;

        if (blockData.id) {
            // Update existing block
            updatedSchedule = currentSchedule.map(block =>
                block.id === blockData.id
                    ? {
                        ...block,
                        name: blockData.name,
                        startDate: blockData.startDate,
                        endDate: blockData.endDate,
                        color: blockData.color
                    }
                    : block
            );
        } else {
            // Create new block
            const newBlock = {
                id: Date.now().toString(),
                name: blockData.name,
                startDate: blockData.startDate,
                endDate: blockData.endDate,
                color: blockData.color,
                weeklySchedule: { daily: [] }
            };
            updatedSchedule = [...currentSchedule, newBlock];
        }

        try {
            const apiData = {
                name: program.name,
                description: program.description || '',
                start_date: program.start_date,
                end_date: program.end_date,
                selectedGoals: program.goal_ids || [],
                weeklySchedule: updatedSchedule
            };

            await fractalApi.updateProgram(rootId, program.id, apiData);
            fetchProgramData();
            setShowBlockModal(false);
            setBlockModalData(null);
            setBlockCreationMode(false); // Turn off block creation mode after creating a block
        } catch (err) {
            console.error('Failed to save training block:', err);
            alert('Failed to save training block');
        }
    };

    const handleDeleteBlock = async (blockId) => {
        if (!window.confirm('Are you sure you want to delete this block? All days within this block will also be deleted.')) {
            return;
        }

        const currentSchedule = Array.isArray(program.weekly_schedule) ? program.weekly_schedule : [];
        const updatedSchedule = currentSchedule.filter(block => block.id !== blockId);

        try {
            const apiData = {
                name: program.name,
                description: program.description || '',
                start_date: program.start_date,
                end_date: program.end_date,
                selectedGoals: program.goal_ids || [],
                weeklySchedule: updatedSchedule
            };

            await fractalApi.updateProgram(rootId, program.id, apiData);
            fetchProgramData();
        } catch (err) {
            console.error('Failed to delete block:', err);
            alert('Failed to delete block');
        }
    };

    const handleAddDayClick = (blockId) => {
        setSelectedBlockId(blockId);
        setDayModalInitialData(null);
        setShowDayModal(true);
    };

    const handleEditDay = (blockId, day) => {
        setSelectedBlockId(blockId);
        setDayModalInitialData(day);
        setShowDayModal(true);
    };

    const handleSaveDay = async (dayData) => {
        try {
            if (dayModalInitialData) {
                // Update
                await fractalApi.updateBlockDay(rootId, program.id, selectedBlockId, dayModalInitialData.id, dayData);
            } else {
                // Create
                await fractalApi.addBlockDay(rootId, program.id, selectedBlockId, dayData);
            }
            fetchProgramData();
            setShowDayModal(false);
        } catch (err) {
            console.error('Failed to save day:', err);
            alert('Failed to save day: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleCopyDay = async (dayId, copyData) => {
        const res = await fractalApi.copyBlockDay(rootId, program.id, selectedBlockId, dayId, copyData);
        fetchProgramData();
        return res;
    };

    const handleDeleteDay = async (dayId) => {
        try {
            await fractalApi.deleteBlockDay(rootId, program.id, selectedBlockId, dayId);
            fetchProgramData();
            setShowDayModal(false);
        } catch (err) {
            console.error('Failed to delete day:', err);
            alert('Failed to delete day');
        }
    };

    // Attach Goal Handlers
    const handleAttachGoalClick = (blockId) => {
        setAttachBlockId(blockId);
        setShowAttachModal(true);
    };

    const handleSaveAttachedGoal = async ({ goal_id, deadline }) => {
        try {
            await fractalApi.attachGoalToBlock(rootId, program.id, attachBlockId, { goal_id, deadline });
            await fetchProgramData();
            await fetchGoals();
            setShowAttachModal(false);
        } catch (err) {
            console.error('Failed to attach goal:', err);
            alert('Failed to attach goal: ' + (err.response?.data?.error || err.message));
        }
    };

    // Goal Detail Handlers
    const handleEventClick = (info) => {
        // info.event.extendedProps contains the properties we spread in calendarEvents
        const type = info.event.extendedProps.type;

        if (type === 'goal') {
            // Find the full goal object from our state to ensure we have the latest data
            // (although extendedProps has a snapshot, state is safer)
            const goalId = info.event.extendedProps.id;
            const goal = goals.find(g => g.id === goalId);

            if (goal) {
                setSelectedGoal(goal);
                setShowGoalModal(true);
            }
        }
    };

    const handleGoalUpdate = async (goalId, updates) => {
        try {
            await fractalApi.updateGoal(rootId, goalId, updates);
            await fetchGoals(); // Refresh goals (deadlines/names)
            // No need to fetchProgramData unless we think goals affect program top-level props (unlikely)
            // But we should update local selectedGoal if needed, though mostly GoalDetail handles its own optimistic filtering?
            // Actually GoalDetailModal manages its own form state but we should update the source.
            // also update selectedGoal in case modal stays open? 
            // The modal uses the `goal` prop. If `goals` updates, `selectedGoal` (ref from `goals`) might need update?
            // `goals` is an array of objects. `goals.find` returns a reference. 
            // After `fetchGoals`, `goals` is a NEW array with NEW objects.
            // So `selectedGoal` will be stale. We need to update it.
            const res = await fractalApi.getGoal(rootId, rootId); // or just reuse fetchGoals logic
            const allGoals = collectGoals(res.data);
            setGoals(allGoals);
            const updated = allGoals.find(g => g.id === goalId);
            if (updated) setSelectedGoal(updated);

        } catch (err) {
            console.error("Failed to update goal:", err);
            alert("Failed to update goal");
        }
    };

    const handleGoalCompletion = async (goalId, currentStatus) => {
        try {
            // GoalDetailModal passes the CURRENT status, so we need to toggle it
            await fractalApi.toggleGoalCompletion(rootId, goalId, !currentStatus);

            // Re-fetch to update UI
            const res = await fractalApi.getGoal(rootId, rootId);
            const allGoals = collectGoals(res.data);
            setGoals(allGoals);

            // Update selected goal if open
            const updated = allGoals.find(g => g.id === goalId);
            if (updated) setSelectedGoal(updated);
        } catch (err) {
            console.error("Failed to toggle completion:", err);
            alert("Failed to toggle completion");
        }
    };


    if (loading) return <div style={{ padding: '40px', color: 'white' }}>Loading...</div>;
    if (!program) return <div style={{ padding: '40px', color: 'white' }}>Program not found</div>;

    // Sort blocks for structure view
    const sortedBlocks = [...(program.blocks || [])].sort((a, b) => {
        if (a.start_date && b.start_date) return new Date(a.start_date) - new Date(b.start_date);
        return 0;
    });

    const handleSetGoalDeadline = async (goalId, deadline) => {
        try {
            await fractalApi.updateGoal(rootId, goalId, { deadline });
            fetchProgramData(); // Refresh to show updated goal deadlines
            fetchGoals(); // Refresh goals list
        } catch (err) {
            console.error('Failed to set goal deadline:', err);
            alert('Failed to set goal deadline');
        }
    };

    const calendarEvents = [];
    sortedBlocks.forEach(block => {
        if (!block.start_date || !block.end_date) return;

        // Block Event (Background)
        calendarEvents.push({
            id: block.id,
            title: block.name,
            start: block.start_date,
            end: moment(block.end_date).add(1, 'days').format('YYYY-MM-DD'),
            backgroundColor: block.color || '#3A86FF',
            borderColor: block.color || '#3A86FF',
            textColor: 'white',
            allDay: true,
            display: 'background',
            extendedProps: block
        });

        // Goal Events logic moved outside to ensure all goals with deadlines are shown


        // Day Events
        if (block.days) {
            block.days.forEach(day => {
                if (day.date) {
                    calendarEvents.push({
                        id: `day-${day.id}`,
                        title: day.name + (day.is_completed ? ' ✅' : ''),
                        start: day.date,
                        allDay: true,
                        backgroundColor: 'transparent',
                        borderColor: 'transparent',
                        textColor: day.is_completed ? '#4caf50' : 'rgba(255,255,255,0.9)',
                        classNames: ['day-label-event']
                    });

                    const hasCompletedSessions = day.completed_sessions && day.completed_sessions.length > 0;

                    // Add events for Templates (The Plan) - only if there are NO completed sessions
                    if (day.templates && !hasCompletedSessions) {
                        day.templates.forEach(t => {
                            calendarEvents.push({
                                id: `template-${day.id}-${t.id}`,
                                title: t.name,
                                start: day.date,
                                allDay: true,
                                backgroundColor: '#37474F',
                                borderColor: 'transparent',
                                textColor: '#CFD8DC',
                                extendedProps: { type: 'template', ...t }
                            });
                        });
                    }

                    // Add events for Completed Sessions (The Reality) - always show if they exist
                    if (hasCompletedSessions) {
                        day.completed_sessions.forEach(s => {
                            calendarEvents.push({
                                id: `session-${s.id}`,
                                title: `✓ ${s.name}`,
                                start: s.created_at ? s.created_at.split('T')[0] : day.date,
                                allDay: true,
                                backgroundColor: '#2e7d32',
                                borderColor: '#4caf50',
                                textColor: 'white',
                                extendedProps: { type: 'session', ...s }
                            });
                        });
                    }
                }
            });
        }
    });

    // Add Goal Events (for all program goals with deadlines)
    goals.forEach(goal => {
        if (goal.deadline) {
            const goalType = goal.attributes?.type || goal.type;
            calendarEvents.push({
                id: `goal-${goal.id}`,
                title: `🎯 ${goal.name}`,
                start: goal.deadline, // The deadline is the date
                allDay: true,
                backgroundColor: getGoalColor(goalType),
                borderColor: getGoalColor(goalType),
                textColor: getGoalTextColor(goalType),
                extendedProps: { type: 'goal', ...goal },
                // Use classNames for styling
                classNames: ['clickable-goal-event']
            });
        }
    });

    // Program Goals (for Modal and Sidebar)
    const programGoals = program.goal_ids?.map(id => getGoalDetails(id)).filter(Boolean) || [];

    // Find generic block for attach modal deadline constraints
    const attachBlock = sortedBlocks.find(b => b.id === attachBlockId);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', paddingTop: '60px' }}>
            <style>
                {`
                    .fc { color: #ddd; background: #1e1e1e; font-family: 'Inter', sans-serif; }
                    .fc-toolbar-title { color: white; font-size: 1.2rem !important; }
                    .fc-button { background-color: #333 !important; border-color: #444 !important; color: white !important; text-transform: capitalize; }
                    .fc-button:hover { background-color: #444 !important; }
                    .fc-button-active { background-color: #3A86FF !important; border-color: #3A86FF !important; }
                    .fc-daygrid-day-number, .fc-col-header-cell-cushion { color: #ccc; text-decoration: none; }
                    .fc-day-today { background-color: #2a2a2a !important; }
                    .fc-theme-standard td, .fc-theme-standard th { border-color: #333; }
                    .clickable-goal-event { cursor: pointer; }
                `}
            </style>

            {/* Header */}
            <div style={{
                padding: '20px 40px',
                borderBottom: '1px solid #333',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#1a1a1a'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button
                        onClick={() => navigate(`/${rootId}/programs`)}
                        style={{ background: 'transparent', border: '1px solid #444', borderRadius: '4px', color: '#ccc', cursor: 'pointer', padding: '8px 12px', fontSize: '14px' }}
                    >
                        ← Back
                    </button>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: 'white' }}>{program.name}</h1>
                        <div style={{ fontSize: '14px', color: '#888', marginTop: '4px' }}>
                            {formatDate(program.start_date)} - {formatDate(program.end_date)}
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ background: '#333', borderRadius: '6px', padding: '4px', display: 'flex', gap: '4px' }}>
                        <button
                            onClick={() => setViewMode('calendar')}
                            style={{
                                background: viewMode === 'calendar' ? '#444' : 'transparent',
                                border: 'none', borderRadius: '4px', color: viewMode === 'calendar' ? 'white' : '#888',
                                padding: '6px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: 500
                            }}
                        >
                            Calendar
                        </button>
                        <button
                            onClick={() => setViewMode('blocks')}
                            style={{
                                background: viewMode === 'blocks' ? '#444' : 'transparent',
                                border: 'none', borderRadius: '4px', color: viewMode === 'blocks' ? 'white' : '#888',
                                padding: '6px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: 500
                            }}
                        >
                            Blocks
                        </button>
                    </div>
                    <button
                        onClick={() => setShowEditBuilder(true)}
                        style={{ background: '#3A86FF', border: 'none', borderRadius: '6px', color: 'white', padding: '10px 20px', cursor: 'pointer', fontWeight: 600 }}
                    >
                        Edit Program
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left Panel */}
                <div style={{ width: '350px', borderRight: '1px solid #333', background: '#1e1e1e', overflowY: 'auto', padding: '24px' }}>
                    <div style={{ marginBottom: '32px' }}>
                        <h3 style={{ color: '#888', textTransform: 'uppercase', fontSize: '12px', marginBottom: '12px', letterSpacing: '1px' }}>Description</h3>
                        <p style={{ color: '#ddd', lineHeight: '1.5', fontSize: '14px' }}>
                            {program.description || 'No description provided.'}
                        </p>
                    </div>

                    <div style={{ marginBottom: '32px' }}>
                        <h3 style={{ color: '#888', textTransform: 'uppercase', fontSize: '12px', marginBottom: '12px', letterSpacing: '1px' }}>Program Goals</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {programGoals.length === 0 ? (
                                <div style={{ color: '#666', fontStyle: 'italic', fontSize: '13px' }}>No goals associated</div>
                            ) : programGoals.map(goal => {
                                const goalType = goal.type || goal.attributes?.type;
                                const color = getGoalColor(goalType);

                                return (
                                    <div key={goal.id} style={{ background: '#252525', borderLeft: `3px solid ${color}`, padding: '10px', borderRadius: '0 4px 4px 0' }}>
                                        <div style={{ color: color, fontSize: '10px', fontWeight: 600, marginBottom: '2px' }}>
                                            {goalType?.replace(/([A-Z])/g, ' $1').trim()}
                                        </div>
                                        <div style={{ color: 'white', fontSize: '13px', fontWeight: 400 }}>{goal.name}</div>
                                        {goal.deadline && <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Target: {formatDate(goal.deadline)}</div>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right Panel */}
                <div style={{ flex: 1, padding: '24px', background: '#121212', overflowY: 'auto' }}>
                    {viewMode === 'calendar' ? (
                        <div style={{ height: '100%', minHeight: '600px', background: '#1e1e1e', padding: '20px', borderRadius: '12px', position: 'relative' }}>
                            <div style={{ position: 'absolute', zIndex: 10, top: '20px', right: '250px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <button
                                    onClick={() => setBlockCreationMode(!blockCreationMode)}
                                    style={{
                                        background: blockCreationMode ? '#3A86FF' : 'transparent',
                                        border: `1px solid ${blockCreationMode ? '#3A86FF' : '#444'}`,
                                        borderRadius: '4px',
                                        color: blockCreationMode ? 'white' : '#888',
                                        padding: '6px 12px',
                                        cursor: 'pointer',
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {blockCreationMode ? '✓ Block Creation Mode' : 'Select Dates to Add Block'}
                                </button>
                                <div style={{ color: '#444' }}>|</div>
                                <button onClick={handleAddBlockClick} style={{ background: '#3A86FF', border: 'none', borderRadius: '4px', color: 'white', padding: '6px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>+ Add Block</button>
                            </div>
                            <FullCalendar
                                plugins={[dayGridPlugin, interactionPlugin]}
                                initialView="dayGridMonth"
                                headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,dayGridWeek' }}
                                initialDate={program.start_date ? new Date(program.start_date) : new Date()}
                                events={calendarEvents}
                                height="100%"
                                selectable={true}
                                select={handleDateSelect}
                                eventClick={handleEventClick}
                            />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ color: 'white', fontSize: '18px' }}>Blocks</h2>
                            </div>

                            {sortedBlocks.length === 0 ? (
                                <div style={{ color: '#666', fontStyle: 'italic' }}>No blocks defined. Switch to Calendar to add blocks.</div>
                            ) : sortedBlocks.map(block => {
                                const start = moment(block.start_date);
                                const end = moment(block.end_date);
                                const durationDays = end.diff(start, 'days') + 1;
                                const blockAttachedGoals = block.goal_ids?.map(id => getGoalDetails(id)).filter(Boolean) || [];

                                return (
                                    <div key={block.id} style={{
                                        background: '#1e1e1e',
                                        borderRadius: '8px',
                                        padding: '20px',
                                        borderLeft: `4px solid ${block.color || '#3A86FF'}`
                                    }}>
                                        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                    <h3 style={{ margin: 0, color: 'white', fontSize: '16px' }}>{block.name}</h3>
                                                    {isBlockActive(block) && <ActiveBlockBadge />}
                                                </div>
                                                <div style={{ color: '#666', fontSize: '12px' }}>
                                                    {formatDate(block.start_date)} - {formatDate(block.end_date)} • {durationDays} Days
                                                </div>
                                                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {blockAttachedGoals.map(g => {
                                                        const goalColor = getGoalColor(g.type);
                                                        return (
                                                            <div key={g.id} style={{
                                                                background: '#2a2a2a',
                                                                border: `1.5px solid ${goalColor}`,
                                                                color: goalColor,
                                                                padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6
                                                            }}>
                                                                <span>{g.name}</span>
                                                                {g.deadline && <span style={{ opacity: 0.7, fontSize: 10 }}>{formatDate(g.deadline, 'MMM D')}</span>}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button
                                                    onClick={() => handleAttachGoalClick(block.id)}
                                                    style={{ background: '#333', border: '1px solid #444', color: '#ccc', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                                                >
                                                    Attach Goal
                                                </button>
                                                <button
                                                    onClick={() => handleEditBlockClick(block)}
                                                    style={{ background: '#333', border: '1px solid #444', color: '#ccc', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}
                                                >
                                                    Edit Block
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteBlock(block.id)}
                                                    style={{ background: '#d32f2f', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                                                >
                                                    Delete Block
                                                </button>
                                                <button
                                                    onClick={() => handleAddDayClick(block.id)}
                                                    style={{ background: '#3A86FF', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}
                                                >
                                                    + Add Day
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{
                                            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px'
                                        }}>
                                            {block.days?.map(day => (
                                                <div key={day.id}
                                                    onClick={() => handleEditDay(block.id, day)}
                                                    style={{
                                                        background: '#2a2a2a',
                                                        padding: '10px',
                                                        borderRadius: '6px',
                                                        minHeight: '80px',
                                                        cursor: 'pointer',
                                                        border: '1px solid transparent',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseOver={e => {
                                                        e.currentTarget.style.borderColor = '#444';
                                                        e.currentTarget.style.background = '#303030';
                                                    }}
                                                    onMouseOut={e => {
                                                        e.currentTarget.style.borderColor = 'transparent';
                                                        e.currentTarget.style.background = '#2a2a2a';
                                                    }}
                                                >
                                                    <div style={{ marginBottom: '6px' }}>
                                                        <div style={{ color: '#888', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                            {day.name}
                                                        </div>
                                                        {day.date && (
                                                            <div style={{ color: '#666', fontSize: '10px', marginTop: '2px' }}>
                                                                {moment(day.date).format('dddd')}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            {day.templates?.length > 0 ? day.templates.map(template => (
                                                                <div key={template.id} style={{
                                                                    fontSize: '11px',
                                                                    color: day.is_completed ? '#81c784' : '#ddd',
                                                                    background: day.is_completed ? '#1b5e20' : '#383838',
                                                                    padding: '4px 6px',
                                                                    borderRadius: '4px',
                                                                    border: day.is_completed ? '1px solid #2e7d32' : '1px solid transparent'
                                                                }}>
                                                                    {template.name}
                                                                </div>
                                                            )) : (<div style={{ fontSize: '11px', color: '#555', fontStyle: 'italic' }}>Rest</div>)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {(!block.days || block.days.length === 0) && (
                                                <div style={{ gridColumn: '1 / -1', color: '#555', fontSize: '13px', fontStyle: 'italic', padding: '10px 0' }}>
                                                    No days configured.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <ProgramBuilder isOpen={showEditBuilder} onClose={() => setShowEditBuilder(false)} onSave={handleSaveProgram} initialData={program} />
            <ProgramBlockModal isOpen={showBlockModal} onClose={() => setShowBlockModal(false)} onSave={handleSaveBlock} initialData={blockModalData} programDates={{ start: program.start_date, end: program.end_date }} />
            <ProgramDayModal
                isOpen={showDayModal}
                onClose={() => setShowDayModal(false)}
                onSave={handleSaveDay}
                onCopy={handleCopyDay}
                onDelete={handleDeleteDay}
                rootId={rootId}
                blockId={selectedBlockId}
                initialData={dayModalInitialData}
            />
            <AttachGoalModal
                isOpen={showAttachModal}
                onClose={() => setShowAttachModal(false)}
                onSave={handleSaveAttachedGoal}
                goals={programGoals}
                block={attachBlock}
            />
            <DayViewModal
                isOpen={showDayViewModal}
                onClose={() => {
                    setShowDayViewModal(false);
                    setSelectedDate(null);
                }}
                date={selectedDate}
                program={program}
                goals={programGoals}
                onSetGoalDeadline={handleSetGoalDeadline}
            />

            <GoalDetailModal
                isOpen={showGoalModal}
                onClose={() => setShowGoalModal(false)}
                goal={selectedGoal}
                onUpdate={handleGoalUpdate}
                onToggleCompletion={handleGoalCompletion}
                rootId={rootId}
                programs={[program]} // Pass current program as array for association context
                activityDefinitions={activities}
                displayMode="modal"
            />
        </div>
    );
};

export default ProgramDetail;
