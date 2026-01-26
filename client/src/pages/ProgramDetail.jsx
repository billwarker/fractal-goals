import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { GOAL_COLORS, getGoalColor, getGoalTextColor } from '../utils/goalColors';
import { getLocalISOString, localToISO } from '../utils/dateUtils';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import moment from 'moment';
import ProgramBuilder from '../components/modals/ProgramBuilder';
import ProgramBlockModal from '../components/modals/ProgramBlockModal';
import ProgramDayModal from '../components/modals/ProgramDayModal';
import AttachGoalModal from '../components/modals/AttachGoalModal';
import DayViewModal from '../components/modals/DayViewModal';
import ConfirmationModal from '../components/ConfirmationModal';
import GoalDetailModal from '../components/GoalDetailModal';
import { isBlockActive, ActiveBlockBadge } from '../utils/programUtils.jsx';

const ProgramDetail = () => {
    const { rootId, programId } = useParams();
    const navigate = useNavigate();
    const [program, setProgram] = useState(null);
    const [loading, setLoading] = useState(true);
    const [goals, setGoals] = useState([]);
    const [activities, setActivities] = useState([]);
    const [activityGroups, setActivityGroups] = useState([]);
    const [sessions, setSessions] = useState([]);
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
    const [unscheduleConfirmOpen, setUnscheduleConfirmOpen] = useState(false);
    const [itemToUnschedule, setItemToUnschedule] = useState(null);

    // Goal Detail Modal State (for calendar clicks)
    const [showGoalModal, setShowGoalModal] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState(null);

    useEffect(() => {
        if (rootId && programId) {
            fetchProgramData();
            fetchProgramData();
            fetchGoals();
            fetchActivities();
            fetchActivityGroups();
            fetchSessions();
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

    const fetchActivityGroups = async () => {
        try {
            const res = await fractalApi.getActivityGroups(rootId);
            setActivityGroups(res.data);
        } catch (err) {
            console.error('Failed to fetch activity groups:', err);
        }
    };

    const fetchSessions = async () => {
        try {
            const res = await fractalApi.getSessions(rootId, { limit: 50 });
            // Handle paginated response format
            const sessionsData = res.data.sessions || res.data;
            setSessions(sessionsData);
        } catch (err) {
            console.error('Failed to fetch sessions:', err);
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

    const formatDurationSeconds = (seconds) => {
        if (!seconds || seconds <= 0) return '0m';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
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

    // Handler to open confirmation modal
    const handleUnscheduleDay = (item) => {
        setItemToUnschedule(item);
        setUnscheduleConfirmOpen(true);
    };

    // Executor for unscheduling (called by modal)
    const executeUnscheduleDay = async () => {
        if (!itemToUnschedule) return;

        const item = itemToUnschedule;
        try {
            if (item.type === 'session') {
                await fractalApi.deleteSession(rootId, item.id);
                fetchSessions();
            } else {
                // Legacy Program Day (Instance)
                if (!item.blockId) {
                    console.error("Cannot delete day without blockId");
                    return;
                }
                await fractalApi.deleteBlockDay(rootId, program.id, item.blockId, item.id);
                fetchProgramData();
            }
        } catch (err) {
            console.error('Failed to unschedule day:', err);
            alert('Failed to unschedule day: ' + (err.response?.data?.error || err.message));
        } finally {
            setUnscheduleConfirmOpen(false);
            setItemToUnschedule(null);
        }
    };

    // Handler for scheduling a day (creates a Planned Session linked to the Template Day)
    const handleScheduleDay = async (blockId, date, templateDay) => {
        try {
            // Determine Parent Goals (Block Goals > Program Goals > Root Fallback)
            const block = program.blocks.find(b => b.id === blockId);
            const parentIds = new Set([
                ...(block?.goal_ids || []),
                ...(program.goal_ids || [])
            ]);

            // Fallback to rootId if no specific goals targeted, to satisfy backend requirement
            if (parentIds.size === 0) {
                parentIds.add(rootId);
            }

            await fractalApi.createSession(rootId, {
                name: templateDay ? templateDay.name : 'Ad-hoc Session',
                session_start: date ? localToISO(`${date} 12:00:00`, Intl.DateTimeFormat().resolvedOptions().timeZone) : getLocalISOString(),
                parent_ids: Array.from(parentIds),
                session_data: {
                    program_context: {
                        day_id: templateDay ? templateDay.id : null,
                        block_id: blockId,
                        program_id: program.id
                    }
                }
            });
            await fetchSessions(); // Refresh sessions to update calendar
            // Sync program data to be safe (though templates shouldn't change, side effects might occur)
            await fetchProgramData();
            // no need to fetchProgramData if we rely on sessions for calendar, 
            // but might be good to sync if side effects exist

            setShowDayViewModal(false);
            setSelectedDate(null);
        } catch (err) {
            console.error('Failed to schedule day:', err);
            alert('Failed to schedule day: ' + (err.response?.data?.error || err.message));
        }
    };

    // Handler for scheduling an existing block day (assigning a date)
    const handleScheduleBlockDay = async (blockId, dayId, date) => {
        try {
            // Update the day's date
            // We need to fetch the existing day first to preserve other fields, 
            // but the API might handle partial updates? 
            // Looking at the API, updateBlockDay usually expects full object or merges.
            // Let's assume we can just send the date update or we might need the day object.
            // The safest is to find the day in our local state, clone it, update date, and send.

            let dayToUpdate = null;
            program.blocks.some(b => {
                if (b.id === blockId && b.days) {
                    const found = b.days.find(d => d.id === dayId);
                    if (found) {
                        dayToUpdate = found;
                        return true;
                    }
                }
                return false;
            });

            if (!dayToUpdate) {
                throw new Error("Day not found in local state");
            }

            const updatedDay = { ...dayToUpdate, date: date };
            // Remove block_id/id from payload if API doesn't want them in body (usually safe to include or exclude)

            await fractalApi.updateBlockDay(rootId, program.id, blockId, dayId, updatedDay);
            fetchProgramData();
            setShowDayViewModal(false);
            setSelectedDate(null);
        } catch (err) {
            console.error('Failed to schedule block day:', err);
            alert('Failed to schedule block day: ' + (err.response?.data?.error || err.message));
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

    // Helper Map for Template Lookups
    const programDaysMap = new Map();
    program.blocks?.forEach(b => b.days?.forEach(d => programDaysMap.set(d.id, { ...d, blockId: b.id, blockColor: b.color })));

    // Helper to get local date string from a datetime
    const getLocalDateString = (dateTimeStr) => {
        if (!dateTimeStr) return null;
        // If it's already just a date (YYYY-MM-DD), return it
        if (dateTimeStr.length === 10) return dateTimeStr;
        // Otherwise parse and convert to local date
        const d = new Date(dateTimeStr);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Render Sessions as Calendar Events (The "Scheduled" Reality)
    sessions.forEach(session => {
        let pDayId = session.program_day_id;
        // Fallback: check session.attributes used by createSession
        if (!pDayId && session.attributes) {
            try {
                const attr = typeof session.attributes === 'string' ? JSON.parse(session.attributes) : session.attributes;
                pDayId = attr?.program_context?.day_id;
            } catch (e) { }
        }

        if (pDayId && programDaysMap.has(pDayId)) {
            const pDay = programDaysMap.get(pDayId);
            const isCompleted = session.session_end && moment(session.session_end).isValid();

            // Main Event - Show the scheduled day as a visible event
            // Use local date to prevent timezone shift issues
            const eventDate = getLocalDateString(session.session_start);

            calendarEvents.push({
                id: `session-event-${session.id}`,
                title: (isCompleted ? "✓ " : "📋 ") + pDay.name,
                start: eventDate,
                allDay: true,
                backgroundColor: isCompleted ? '#2e7d32' : (pDay.blockColor || '#3A86FF'),
                borderColor: isCompleted ? '#2e7d32' : (pDay.blockColor || '#3A86FF'),
                textColor: 'white',
                classNames: ['scheduled-day-event'],
                extendedProps: {
                    type: 'scheduled_day',
                    sessionId: session.id,
                    programDayId: pDayId,
                    dayName: pDay.name
                }
            });
        }
    });
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
                                start: s.created_at ? getLocalDateString(s.created_at) : day.date,
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

    // Add Goal Events (only for goals attached to this program or its blocks)
    // Collect all goal IDs that are attached to this program
    const attachedGoalIds = new Set([
        ...(program.goal_ids || []),
        ...sortedBlocks.flatMap(b => b.goal_ids || [])
    ]);

    goals.forEach(goal => {
        // Only show goals that are attached to this program AND have a deadline
        if (goal.deadline && attachedGoalIds.has(goal.id)) {
            const goalType = goal.attributes?.type || goal.type;
            const isCompleted = goal.completed || goal.attributes?.completed;
            const completionDate = goal.completed_at || goal.attributes?.completed_at;

            calendarEvents.push({
                id: `goal-${goal.id}`,
                title: isCompleted ? `✅ ${goal.name}` : `🎯 ${goal.name}`,
                start: (isCompleted && completionDate) ? getLocalDateString(completionDate) : goal.deadline,
                allDay: true,
                backgroundColor: isCompleted ? '#2e7d32' : getGoalColor(goalType),
                borderColor: isCompleted ? '#4caf50' : getGoalColor(goalType),
                textColor: isCompleted ? 'white' : getGoalTextColor(goalType),
                extendedProps: { type: 'goal', ...goal },
                // Use classNames for styling
                classNames: isCompleted ? ['completed-goal-event', 'clickable-goal-event'] : ['clickable-goal-event']
            });
        }
    });

    // Program Goals (for Modal and Sidebar)
    const programGoals = program.goal_ids?.map(id => getGoalDetails(id)).filter(Boolean) || [];

    // Find generic block for attach modal deadline constraints
    const attachBlock = sortedBlocks.find(b => b.id === attachBlockId);

    // Calculate active block and its metrics
    const activeBlock = program?.blocks?.find(block => isBlockActive(block));
    const blockMetrics = activeBlock ? (() => {
        const blockStart = moment(activeBlock.start_date).startOf('day');
        const blockEnd = moment(activeBlock.end_date).endOf('day');

        // Filter sessions that logically belong to this block
        const blockSessions = sessions.filter(s => {
            let pDayId = s.program_day_id;
            if (!pDayId && s.attributes) {
                try {
                    const attr = typeof s.attributes === 'string' ? JSON.parse(s.attributes) : s.attributes;
                    pDayId = attr?.program_context?.day_id;
                } catch (e) { }
            }

            // Strictly only count sessions linked to a day within this block
            if (pDayId) {
                return programDaysMap.get(pDayId)?.blockId === activeBlock.id;
            }

            return false;
        });

        // Determine which goals to track for this block's metrics
        let blockGoalIdsValue = activeBlock.goal_ids || [];

        // If no goals specifically attached to the block, fall back to program goals due in this block
        if (blockGoalIdsValue.length === 0) {
            const programGoalIds = program.goal_ids || [];
            blockGoalIdsValue = programGoalIds.filter(id => {
                const goal = getGoalDetails(id);
                if (!goal || !goal.deadline) return false;
                const deadline = moment(goal.deadline);
                return deadline.isSameOrAfter(blockStart) && deadline.isSameOrBefore(blockEnd);
            });
        }

        return {
            name: activeBlock.name,
            color: activeBlock.color || '#3A86FF',
            completedSessions: blockSessions.filter(s => s.completed).length,
            scheduledSessions: blockSessions.length,
            goalsMet: blockGoalIdsValue.filter(id => {
                const goal = getGoalDetails(id);
                return goal && (goal.completed || goal.attributes?.completed);
            }).length,
            totalGoals: blockGoalIdsValue.length,
            totalDuration: blockSessions.reduce((sum, s) => sum + (s.total_duration_seconds || 0), 0)
        };
    })() : null;

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
                        onClick={() => navigate(`/${rootId}/programs?show_all=true`)}
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

                    {/* Metrics Section */}
                    {activeBlock && (
                        <div style={{ marginBottom: '32px' }}>
                            <h3 style={{ color: '#888', textTransform: 'uppercase', fontSize: '12px', marginBottom: '12px', letterSpacing: '1px' }}>Current Block Metrics</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: '#ddd' }}>
                                <div><span style={{ color: '#888' }}>Block:</span> <span style={{ color: blockMetrics.color, fontWeight: 600 }}>{blockMetrics.name}</span></div>
                                <div><span style={{ color: '#888' }}>Sessions:</span> {blockMetrics.completedSessions} completed / {blockMetrics.scheduledSessions} scheduled</div>
                                <div><span style={{ color: '#888' }}>Duration:</span> {formatDurationSeconds(blockMetrics.totalDuration)}</div>
                                <div><span style={{ color: '#888' }}>Goals met:</span> {blockMetrics.goalsMet} / {blockMetrics.totalGoals}</div>
                            </div>
                        </div>
                    )}

                    <div style={{ marginBottom: '32px' }}>
                        <h3 style={{ color: '#888', textTransform: 'uppercase', fontSize: '12px', marginBottom: '12px', letterSpacing: '1px' }}>Program Goals</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {programGoals.length === 0 ? (
                                <div style={{ color: '#666', fontStyle: 'italic', fontSize: '13px' }}>No goals associated</div>
                            ) : programGoals.map(goal => {
                                const goalType = goal.type || goal.attributes?.type;
                                const color = getGoalColor(goalType);
                                const isCompleted = goal.completed || goal.attributes?.completed;

                                return (
                                    <div
                                        key={goal.id}
                                        style={{
                                            background: isCompleted ? '#1a2e1a' : '#252525',
                                            borderLeft: `3px solid ${isCompleted ? '#4caf50' : color}`,
                                            padding: '10px',
                                            borderRadius: '0 4px 4px 0',
                                            position: 'relative'
                                        }}
                                    >
                                        {isCompleted && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '8px',
                                                right: '8px',
                                                background: '#4caf50',
                                                borderRadius: '50%',
                                                width: '18px',
                                                height: '18px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '10px'
                                            }}>✓</div>
                                        )}
                                        <div style={{ color: isCompleted ? '#4caf50' : color, fontSize: '10px', fontWeight: 600, marginBottom: '2px' }}>
                                            {goalType?.replace(/([A-Z])/g, ' $1').trim()}
                                        </div>
                                        <div style={{
                                            color: isCompleted ? '#8bc34a' : 'white',
                                            fontSize: '13px',
                                            fontWeight: 400,
                                            textDecoration: isCompleted ? 'line-through' : 'none',
                                            opacity: isCompleted ? 0.9 : 1
                                        }}>
                                            {goal.name}
                                        </div>
                                        {goal.deadline && (
                                            <div style={{ fontSize: '11px', color: isCompleted ? '#66bb6a' : '#888', marginTop: '2px' }}>
                                                {isCompleted ? 'Completed' : 'Deadline'}: {formatDate(goal.deadline)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                </div>

                {/* Right Panel */}
                <div style={{ flex: 1, padding: '24px', background: '#121212', overflowY: 'auto' }}>
                    {viewMode === 'calendar' ? (
                        <div style={{ height: 'calc(100vh - 200px)', minHeight: '500px', background: '#1e1e1e', padding: '20px', borderRadius: '12px', position: 'relative' }}>
                            {/* Block creation controls - positioned at top right of calendar area */}
                            <div style={{
                                position: 'absolute',
                                top: '20px',
                                right: '20px',
                                zIndex: 10,
                                display: 'flex',
                                gap: '8px',
                                alignItems: 'center'
                            }}>
                                <button
                                    onClick={() => setBlockCreationMode(!blockCreationMode)}
                                    style={{
                                        background: blockCreationMode ? '#3A86FF' : 'transparent',
                                        border: `1px solid ${blockCreationMode ? '#3A86FF' : '#444'}`,
                                        borderRadius: '4px',
                                        color: blockCreationMode ? 'white' : '#888',
                                        padding: '6px 12px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        transition: 'all 0.2s',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    {blockCreationMode ? '✓ Block Creation Mode' : 'Select Dates to Add Block'}
                                </button>
                                <button
                                    onClick={handleAddBlockClick}
                                    style={{
                                        background: '#3A86FF',
                                        border: 'none',
                                        borderRadius: '4px',
                                        color: 'white',
                                        padding: '6px 12px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: 500,
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    + Add Block
                                </button>
                            </div>
                            <FullCalendar
                                plugins={[dayGridPlugin, interactionPlugin]}
                                initialView="dayGridMonth"
                                headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
                                initialDate={program.start_date ? new Date(program.start_date) : new Date()}
                                events={calendarEvents}
                                height="100%"
                                dayMaxEvents={5}
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
                                                <div style={{ color: '#666', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {formatDate(block.start_date)} - {formatDate(block.end_date)} • {durationDays} Days
                                                    {isBlockActive(block) && (
                                                        <>
                                                            <span>•</span>
                                                            <span style={{ color: block.color || '#3A86FF', fontWeight: 600 }}>
                                                                {Math.max(0, moment(block.end_date).startOf('day').diff(moment().startOf('day'), 'days'))} Days Remaining
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                    {blockAttachedGoals.map(g => {
                                                        const goalColor = getGoalColor(g.type);
                                                        const isCompleted = g.completed || g.attributes?.completed;
                                                        return (
                                                            <div key={g.id} style={{
                                                                background: isCompleted ? '#1a2e1a' : '#2a2a2a',
                                                                border: `1.5px solid ${isCompleted ? '#4caf50' : goalColor}`,
                                                                color: isCompleted ? '#4caf50' : goalColor,
                                                                padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                                                                textDecoration: isCompleted ? 'line-through' : 'none',
                                                                opacity: isCompleted ? 0.85 : 1
                                                            }}>
                                                                {isCompleted && <span>✓</span>}
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
                                            {block.days?.filter(d => !d.date).map(day => (
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
                                                    <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div style={{ color: '#888', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                            {day.name}
                                                        </div>
                                                        {(() => {
                                                            const blockStart = moment(block.start_date).startOf('day');
                                                            const blockEnd = moment(block.end_date).endOf('day');
                                                            const completedCount = sessions.filter(s => {
                                                                if (s.program_day_id !== day.id || !s.completed) return false;
                                                                const sessDate = moment(s.session_start || s.created_at);
                                                                return sessDate.isSameOrAfter(blockStart) && sessDate.isSameOrBefore(blockEnd);
                                                            }).length;
                                                            if (completedCount > 0) {
                                                                return (
                                                                    <div style={{ color: '#4caf50', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                                        ✓ {completedCount}
                                                                    </div>
                                                                );
                                                            }
                                                            return <div style={{ color: '#555', fontSize: '10px' }}>none</div>;
                                                        })()}
                                                    </div>
                                                    {day.date && (
                                                        <div style={{ color: '#666', fontSize: '10px', marginTop: '-4px', marginBottom: '6px' }}>
                                                            {moment(day.date).format('dddd')}
                                                        </div>
                                                    )}
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
                blocks={sortedBlocks}
                onScheduleDay={handleScheduleDay}
                onUnscheduleDay={handleUnscheduleDay}
                sessions={sessions}
            />

            <ConfirmationModal
                isOpen={unscheduleConfirmOpen}
                onClose={() => setUnscheduleConfirmOpen(false)}
                onConfirm={executeUnscheduleDay}
                title="Unschedule Day"
                message={`Are you sure you want to unschedule ${itemToUnschedule?.name || 'this day'}?`}
                confirmText="Unschedule"
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
                activityGroups={activityGroups}
                displayMode="modal"
            />
        </div >
    );
};

export default ProgramDetail;
