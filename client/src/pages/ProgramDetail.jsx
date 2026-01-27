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

    // Helper to get local date string from a datetime (YYYY-MM-DD)
    const getLocalDateString = (dateTimeStr) => {
        if (!dateTimeStr) return null;
        if (typeof dateTimeStr === 'string' && dateTimeStr.length === 10) return dateTimeStr;
        const d = new Date(dateTimeStr);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const calendarEvents = [];

    // Helper Map for Template Lookups
    const programDaysMap = new Map();
    program.blocks?.forEach(b => b.days?.forEach(d => programDaysMap.set(d.id, { ...d, blockId: b.id, blockColor: b.color })));

    // Grouping structure: { dateStr: { groupsByName: { [name]: { pDay, sessions: [], templatesByName: { [tName]: { templates: [], sessions: [] } } } }, unlinkedSessions: [] } }
    const dateGroups = {};

    // 1. Initialize Date Groups with Scheduled Days
    program.blocks?.forEach(block => {
        block.days?.forEach(day => {
            if (day.date) {
                const dateStr = getLocalDateString(day.date);
                if (!dateGroups[dateStr]) dateGroups[dateStr] = { groupsByName: {}, unlinkedSessions: [] };

                const name = day.name || 'Untitled Day';
                if (!dateGroups[dateStr].groupsByName[name]) {
                    dateGroups[dateStr].groupsByName[name] = {
                        name,
                        pDay: day,
                        blockColor: block.color,
                        sessions: [],
                        templatesByName: {}
                    };
                }
                const group = dateGroups[dateStr].groupsByName[name];
                (day.templates || []).forEach(t => {
                    if (!group.templatesByName[t.name]) group.templatesByName[t.name] = { templates: [], sessions: [] };
                    group.templatesByName[t.name].templates.push(t);
                });
            }
        });
    });

    // 2. Link Sessions to Date Groups (Merge into named groups)
    sessions.forEach(session => {
        const dateStr = getLocalDateString(session.session_start || session.created_at);
        if (!dateGroups[dateStr]) dateGroups[dateStr] = { groupsByName: {}, unlinkedSessions: [] };

        let pDayId = session.program_day_id;
        if (!pDayId && session.attributes) {
            try {
                const attr = typeof session.attributes === 'string' ? JSON.parse(session.attributes) : session.attributes;
                pDayId = attr?.program_context?.day_id;
            } catch (e) { }
        }

        const pDayTemplate = pDayId ? programDaysMap.get(pDayId) : null;

        if (pDayTemplate) {
            const name = pDayTemplate.name;
            if (!dateGroups[dateStr].groupsByName[name]) {
                dateGroups[dateStr].groupsByName[name] = {
                    name,
                    pDay: pDayTemplate,
                    blockColor: pDayTemplate.blockColor,
                    sessions: [],
                    templatesByName: {}
                };
                (pDayTemplate.templates || []).forEach(t => {
                    if (!dateGroups[dateStr].groupsByName[name].templatesByName[t.name]) {
                        dateGroups[dateStr].groupsByName[name].templatesByName[t.name] = { templates: [], sessions: [] };
                    }
                    dateGroups[dateStr].groupsByName[name].templatesByName[t.name].templates.push(t);
                });
            }
            dateGroups[dateStr].groupsByName[name].sessions.push(session);
        } else {
            // Check if this session name matches any existing Day group's template names on this date
            let claimed = false;
            for (const group of Object.values(dateGroups[dateStr].groupsByName)) {
                if (group.templatesByName[session.name]) {
                    group.sessions.push(session);
                    claimed = true;
                    break;
                }
            }
            if (!claimed) dateGroups[dateStr].unlinkedSessions.push(session);
        }
    });

    // 3. Generate Calendar Events from consolidated data
    Object.entries(dateGroups).forEach(([dateStr, data]) => {
        Object.values(data.groupsByName).forEach(group => {
            // Distribute sessions among templates in the group
            group.sessions.forEach(s => {
                const tName = s.name;
                if (group.templatesByName[tName]) {
                    group.templatesByName[tName].sessions.push(s);
                } else {
                    // Fallback: if session has template_id, find template with that ID in the group
                    const matchingT = Object.values(group.templatesByName)
                        .flatMap(gt => gt.templates)
                        .find(t => t.id === s.template_id);
                    if (matchingT) {
                        group.templatesByName[matchingT.name].sessions.push(s);
                    }
                }
            });

            const templatePairs = Object.values(group.templatesByName);
            const isPDCompleted = templatePairs.length > 0 &&
                templatePairs.every(pair => pair.sessions.length > 0);

            // Main Program Day Event
            calendarEvents.push({
                id: `pday-${dateStr}-${group.name}`,
                title: (isPDCompleted ? "✓ " : "📋 ") + group.name,
                start: dateStr,
                allDay: true,
                backgroundColor: isPDCompleted ? '#2e7d32' : (group.blockColor || '#37474F'),
                borderColor: isPDCompleted ? '#2e7d32' : 'transparent',
                textColor: 'white',
                classNames: ['program-day-event'],
                extendedProps: {
                    type: 'program_day',
                    pDayId: group.pDay?.id,
                    isCompleted: isPDCompleted,
                    sortOrder: 0
                }
            });

            // Consolidated Session Template Events
            templatePairs.forEach(pair => {
                const tName = pair.templates[0]?.name || 'Untitled Template';
                const sCount = pair.sessions.length;
                const isTemplateCompleted = sCount > 0;

                let displayTitle = tName;
                if (isTemplateCompleted) {
                    displayTitle = `✓ ${tName}`;
                    if (sCount > 1) {
                        displayTitle += ` (${sCount})`;
                    }
                }

                calendarEvents.push({
                    id: `template-${dateStr}-${group.name}-${tName}`,
                    title: displayTitle,
                    start: dateStr,
                    allDay: true,
                    backgroundColor: isTemplateCompleted ? '#1b5e20' : '#424242',
                    borderColor: 'transparent',
                    textColor: isTemplateCompleted ? '#c8e6c9' : '#bdbdbd',
                    classNames: ['template-event'],
                    extendedProps: {
                        type: 'template',
                        templateId: pair.templates[0]?.id,
                        isCompleted: isTemplateCompleted,
                        count: sCount,
                        sortOrder: 1
                    }
                });
            });
        });

        // Render remaining Unlinked Sessions
        data.unlinkedSessions.forEach(s => {
            calendarEvents.push({
                id: `session-${s.id}`,
                title: `✓ ${s.name}`,
                start: dateStr,
                allDay: true,
                backgroundColor: '#2e7d32',
                borderColor: 'transparent',
                textColor: 'white',
                extendedProps: { type: 'session', sortOrder: 2, ...s }
            });
        });
    });

    // 4. Add Block Backgrounds
    sortedBlocks.forEach(block => {
        if (!block.start_date || !block.end_date) return;
        calendarEvents.push({
            id: `block-bg-${block.id}`,
            title: block.name,
            start: block.start_date,
            end: moment(block.end_date).add(1, 'days').format('YYYY-MM-DD'),
            backgroundColor: block.color || '#3A86FF',
            borderColor: block.color || '#3A86FF',
            textColor: 'white',
            allDay: true,
            display: 'background',
            extendedProps: { type: 'block_background', ...block }
        });
    });

    // 4. Calculate Expanded Attached Goals (including all descendants)
    const attachedGoalIds = new Set();
    const taskSeeds = [
        ...(program.goal_ids || []),
        ...sortedBlocks.flatMap(b => b.goal_ids || [])
    ];

    const getDescendants = (goalId, allGoals, visited = new Set()) => {
        if (visited.has(goalId)) return [];
        visited.add(goalId);
        const goal = allGoals.find(g => g.id === goalId);
        if (!goal || !goal.children) return [];
        let descendants = [];
        goal.children.forEach(child => {
            descendants.push(child.id);
            descendants = descendants.concat(getDescendants(child.id, allGoals, visited));
        });
        return descendants;
    };

    taskSeeds.forEach(seedId => {
        attachedGoalIds.add(seedId);
        getDescendants(seedId, goals).forEach(id => attachedGoalIds.add(id));
    });

    // 5. Add Goal Events to Calendar
    goals.forEach(goal => {
        if (goal.deadline && attachedGoalIds.has(goal.id)) {
            const goalType = goal.attributes?.type || goal.type;
            const isCompleted = goal.completed || goal.attributes?.completed;
            const completionDate = goal.completed_at || goal.attributes?.completed_at;

            calendarEvents.push({
                id: `goal-${goal.id}`,
                title: isCompleted ? `✅ ${goal.name}` : `🎯 ${goal.name}`,
                start: (isCompleted && completionDate) ? getLocalDateString(completionDate) : goal.deadline,
                allDay: true,
                backgroundColor: getGoalColor(goalType),
                borderColor: getGoalColor(goalType),
                textColor: getGoalTextColor(goalType),
                extendedProps: { type: 'goal', sortOrder: 3, ...goal },
                classNames: isCompleted ? ['completed-goal-event', 'clickable-goal-event'] : ['clickable-goal-event']
            });
        }
    });

    // Program Goals (Seeds for Sidebar)
    const programGoalIds = program.goal_ids || [];
    const allProgramGoals = programGoalIds.map(id => getGoalDetails(id)).filter(Boolean);

    // Filter out goals that are descendants of other goals already in the program's goal list
    // to avoid duplication in the sidebar while maintaining the hierarchy.
    const programGoalSeeds = allProgramGoals.filter(g => {
        return !programGoalIds.some(otherId => {
            if (g.id === otherId) return false;
            return getDescendants(otherId, goals).includes(g.id);
        });
    });

    // Recursive Goal Renderer for Sidebar
    const renderGoalItem = (goal, depth = 0) => {
        const goalType = goal.type || goal.attributes?.type;
        const color = getGoalColor(goalType);
        const isCompleted = goal.completed || goal.attributes?.completed;

        return (
            <div key={goal.id} style={{ marginLeft: depth > 0 ? `${depth * 16}px` : 0 }}>
                <div
                    style={{
                        background: isCompleted ? '#1a2e1a' : '#252525',
                        borderLeft: `3px solid ${isCompleted ? '#4caf50' : color}`,
                        padding: '10px',
                        borderRadius: '0 4px 4px 0',
                        position: 'relative',
                        marginBottom: '8px'
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
                            fontSize: '10px',
                            color: 'white'
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
                            {isCompleted ? (
                                <>Completed: {formatDate(goal.completed_at || goal.attributes?.completed_at)}</>
                            ) : (
                                <>Deadline: {formatDate(goal.deadline)}</>
                            )}
                        </div>
                    )}
                </div>
                {goal.children && goal.children.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {goal.children.map(child => {
                            // Find child in flat goals to ensure we have latest data
                            const fullChild = getGoalDetails(child.id);
                            return fullChild ? renderGoalItem(fullChild, depth + 1) : null;
                        })}
                    </div>
                )}
            </div>
        );
    };

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
                    .program-day-event { font-weight: 600 !important; border-radius: 4px !important; }
                    .template-event { font-size: 0.85em !important; opacity: 0.9; border-radius: 3px !important; }
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
                            {programGoalSeeds.length === 0 ? (
                                <div style={{ color: '#666', fontStyle: 'italic', fontSize: '13px' }}>No goals associated</div>
                            ) : programGoalSeeds.map(goal => renderGoalItem(goal))}
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
                                eventOrder="sortOrder"
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

                                return (
                                    <div key={block.id} style={{
                                        background: '#1e1e1e',
                                        borderRadius: '12px',
                                        padding: '24px',
                                        borderLeft: `4px solid ${block.color || '#3A86FF'}`,
                                        display: 'flex',
                                        gap: '40px',
                                        marginBottom: '16px'
                                    }}>
                                        {/* Main content: Info + Days */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            {/* Block Info Section */}
                                            <div style={{ marginBottom: '24px' }}>
                                                {/* Row 1: Name, Badge, Dates, Days Remaining */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                                    <h3 style={{ margin: 0, color: 'white', fontSize: '18px', fontWeight: 600 }}>{block.name}</h3>
                                                    {isBlockActive(block) && <ActiveBlockBadge />}

                                                    <div style={{ color: '#666', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span>{formatDate(block.start_date)} - {formatDate(block.end_date)} • {durationDays} Days</span>
                                                        {isBlockActive(block) && (
                                                            <span style={{ color: block.color || '#3A86FF', fontWeight: 600 }}>
                                                                • {Math.max(0, moment(block.end_date).startOf('day').diff(moment().startOf('day'), 'days'))} Days Left
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Row 2: Goal Badges */}
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                                                    {(() => {
                                                        const blockStart = moment(block.start_date).startOf('day');
                                                        const blockEnd = moment(block.end_date).endOf('day');

                                                        const associatedGoals = goals.filter(g => {
                                                            if (block.goal_ids?.includes(g.id)) return true;
                                                            if (g.deadline) {
                                                                const d = moment(g.deadline);
                                                                return d.isSameOrAfter(blockStart) && d.isSameOrBefore(blockEnd);
                                                            }
                                                            return false;
                                                        });

                                                        associatedGoals.sort((a, b) => {
                                                            if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
                                                            if (a.deadline) return -1;
                                                            if (b.deadline) return 1;
                                                            return a.name.localeCompare(b.name);
                                                        });

                                                        return associatedGoals.map(g => {
                                                            const goalType = g.attributes?.type || g.type;
                                                            const goalColor = getGoalColor(goalType);
                                                            const isCompleted = g.completed || g.attributes?.completed;
                                                            return (
                                                                <div key={g.id} style={{
                                                                    background: 'transparent',
                                                                    border: `1px solid ${goalColor}`,
                                                                    color: goalColor,
                                                                    padding: '4px 10px',
                                                                    borderRadius: '6px',
                                                                    fontSize: '11px',
                                                                    fontWeight: 500,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    textDecoration: isCompleted ? 'line-through' : 'none',
                                                                    opacity: isCompleted ? 0.7 : 1,
                                                                    whiteSpace: 'nowrap',
                                                                    cursor: 'pointer'
                                                                }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedGoal(g);
                                                                        setShowGoalModal(true);
                                                                    }}
                                                                    title={g.name}
                                                                >
                                                                    {isCompleted && <span>✓</span>}
                                                                    <span>{g.name}</span>
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                            </div>

                                            {/* Days Grid Section */}
                                            <div style={{
                                                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px'
                                            }}>
                                                {(() => {
                                                    const seenKeys = new Set();
                                                    const sortedDays = [...(block.days || [])].sort((a, b) => {
                                                        if (!a.date && b.date) return -1;
                                                        if (a.date && !b.date) return 1;
                                                        return 0;
                                                    });

                                                    const uniqueDays = sortedDays.filter(day => {
                                                        const templateIds = (day.templates || []).map(t => t.id).sort().join(',');
                                                        const key = `${day.name}-${templateIds}`;
                                                        if (seenKeys.has(key)) return false;
                                                        seenKeys.add(key);
                                                        return true;
                                                    });

                                                    if (uniqueDays.length === 0) {
                                                        return <div style={{ color: '#444', fontSize: '13px', fontStyle: 'italic', gridColumn: '1 / -1' }}>No days added yet. Click "+ Add Day" to start your plan.</div>;
                                                    }

                                                    return uniqueDays.map(day => (
                                                        <div key={day.id}
                                                            onClick={() => handleEditDay(block.id, day)}
                                                            style={{
                                                                background: '#242424',
                                                                padding: '16px',
                                                                borderRadius: '8px',
                                                                minHeight: '100px',
                                                                cursor: 'pointer',
                                                                border: '1px solid #333',
                                                                transition: 'all 0.2s',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '12px'
                                                            }}
                                                            onMouseOver={e => {
                                                                e.currentTarget.style.borderColor = '#444';
                                                                e.currentTarget.style.background = '#2a2a2a';
                                                            }}
                                                            onMouseOut={e => {
                                                                e.currentTarget.style.borderColor = '#333';
                                                                e.currentTarget.style.background = '#242424';
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                <div>
                                                                    <div style={{ color: '#eee', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                                                                        {day.name}
                                                                    </div>
                                                                    {(() => {
                                                                        const mapping = day.day_of_week;
                                                                        if (Array.isArray(mapping) && mapping.length > 0) {
                                                                            const dayMap = {
                                                                                'Monday': 'Mon', 'Tuesday': 'Tues', 'Wednesday': 'Wed', 'Thursday': 'Thurs',
                                                                                'Friday': 'Fri', 'Saturday': 'Sat', 'Sunday': 'Sun'
                                                                            };
                                                                            const dayStr = mapping.length === 7 ? 'Daily' : mapping.map(d => dayMap[d] || d.substring(0, 3)).join(' | ');
                                                                            return <div style={{ color: '#777', fontSize: '10px', fontWeight: 500 }}>{dayStr}</div>;
                                                                        } else if (day.date) {
                                                                            return <div style={{ color: '#777', fontSize: '10px', fontWeight: 500 }}>{moment(day.date).format('dddd')}</div>;
                                                                        }
                                                                        return null;
                                                                    })()}
                                                                </div>
                                                                {(() => {
                                                                    const blockStart = moment(block.start_date).startOf('day');
                                                                    const blockEnd = moment(block.end_date).endOf('day');
                                                                    const daySessions = sessions.filter(s => {
                                                                        if (s.program_day_id !== day.id || !s.completed) return false;
                                                                        const sessDate = moment(s.session_start || s.created_at);
                                                                        return sessDate.isSameOrAfter(blockStart) && sessDate.isSameOrBefore(blockEnd);
                                                                    });

                                                                    const completedTemplateIds = new Set(daySessions.filter(s => s.template_id).map(s => s.template_id));
                                                                    const templates = day.templates || [];
                                                                    const isFullComplete = templates.length > 0 && templates.every(t => completedTemplateIds.has(t.id));

                                                                    if (daySessions.length > 0) {
                                                                        return (
                                                                            <div style={{ color: '#4caf50', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                                                {daySessions.length} {isFullComplete && '✓'}
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return null;
                                                                })()}
                                                            </div>

                                                            {/* Day Templates (Sessions) */}
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                {(() => {
                                                                    const blockStart = moment(block.start_date).startOf('day');
                                                                    const blockEnd = moment(block.end_date).endOf('day');
                                                                    const daySessions = sessions.filter(s => {
                                                                        if (s.program_day_id !== day.id || !s.completed) return false;
                                                                        const sessDate = moment(s.session_start || s.created_at);
                                                                        return sessDate.isSameOrAfter(blockStart) && sessDate.isSameOrBefore(blockEnd);
                                                                    });

                                                                    if (day.templates?.length > 0) {
                                                                        return day.templates.map(template => {
                                                                            const tSessions = daySessions.filter(s => s.template_id === template.id);
                                                                            const sCount = tSessions.length;
                                                                            const isDone = sCount > 0;

                                                                            return (
                                                                                <div key={template.id} style={{
                                                                                    fontSize: '11px',
                                                                                    color: isDone ? '#c8e6c9' : '#bbb',
                                                                                    background: isDone ? '#1b5e20' : '#333',
                                                                                    padding: '4px 8px',
                                                                                    borderRadius: '4px',
                                                                                    borderLeft: isDone ? '2px solid #4caf50' : '2px solid #555',
                                                                                    display: 'flex',
                                                                                    justifyContent: 'space-between'
                                                                                }}>
                                                                                    <span>{isDone ? '✓ ' : ''}{template.name}</span>
                                                                                    {sCount > 1 && <span>{sCount}</span>}
                                                                                </div>
                                                                            );
                                                                        });
                                                                    }
                                                                    return <div style={{ fontSize: '10px', color: '#444', fontStyle: 'italic' }}>Rest</div>;
                                                                })()}
                                                            </div>
                                                        </div>
                                                    ));
                                                })()}
                                            </div>
                                        </div>

                                        {/* Actions Section */}
                                        <div style={{ flex: '0 0 120px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <button onClick={() => handleAttachGoalClick(block.id)} style={{ background: '#333', border: '1px solid #444', color: '#ccc', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', width: '100%' }}>Attach Goal</button>
                                            <button onClick={() => handleEditBlockClick(block)} style={{ background: '#333', border: '1px solid #444', color: '#ccc', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', width: '100%' }}>Edit Block</button>
                                            <button onClick={() => handleDeleteBlock(block.id)} style={{ background: '#d32f2f', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, width: '100%' }}>Delete Block</button>
                                            <button onClick={() => handleAddDayClick(block.id)} style={{ background: '#3A86FF', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer', fontWeight: 500, width: '100%' }}>+ Add Day</button>
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
                goals={allProgramGoals}
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
                goals={goals.filter(g => attachedGoalIds.has(g.id))}
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
