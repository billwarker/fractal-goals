import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { GOAL_COLORS, getGoalColor, getGoalTextColor } from '../utils/goalColors';
import { getLocalISOString, localToISO } from '../utils/dateUtils';
import ProgramSidebar from '../components/programs/ProgramSidebar';
import ProgramCalendarView from '../components/programs/ProgramCalendarView';
import ProgramBlockView from '../components/programs/ProgramBlockView';
import moment from 'moment';
import ProgramBuilder from '../components/modals/ProgramBuilder';
import ProgramBlockModal from '../components/modals/ProgramBlockModal';
import ProgramDayModal from '../components/modals/ProgramDayModal';
import AttachGoalModal from '../components/modals/AttachGoalModal';
import DayViewModal from '../components/modals/DayViewModal';
import ConfirmationModal from '../components/ConfirmationModal';
import GoalDetailModal from '../components/GoalDetailModal';
import { isBlockActive, ActiveBlockBadge } from '../utils/programUtils.jsx';
import { getChildType } from '../utils/goalHelpers';
import { useProgramData } from '../hooks/useProgramData';

const ProgramDetail = () => {
    const { rootId, programId } = useParams();
    const navigate = useNavigate();

    // Data Hook (manages program, goals, sessions, etc.)
    const {
        program, setProgram,
        loading,
        goals, setGoals,
        activities,
        activityGroups,
        sessions, setSessions,
        treeData,
        refreshData,
        getGoalDetails
    } = useProgramData(rootId, programId);

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
    const [modalMode, setModalMode] = useState('view'); // 'view', 'edit', 'create'
    const [selectedParent, setSelectedParent] = useState(null);

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
            refreshData();
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
            refreshData();
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
            refreshData();
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
            refreshData();
            setShowDayModal(false);
        } catch (err) {
            console.error('Failed to save day:', err);
            alert('Failed to save day: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleCopyDay = async (dayId, copyData) => {
        const res = await fractalApi.copyBlockDay(rootId, program.id, selectedBlockId, dayId, copyData);
        refreshData();
        return res;
    };

    const handleDeleteDay = async (dayId) => {
        try {
            await fractalApi.deleteBlockDay(rootId, program.id, selectedBlockId, dayId);
            refreshData();
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
                refreshData();
            } else {
                // Legacy Program Day (Instance)
                if (!item.blockId) {
                    console.error("Cannot delete day without blockId");
                    return;
                }
                await fractalApi.deleteBlockDay(rootId, program.id, item.blockId, item.id);
                refreshData();
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
            await refreshData(); // Refresh sessions to update calendar
            // Sync program data to be safe (though templates shouldn't change, side effects might occur)
            await refreshData();
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
            refreshData();
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
            await refreshData();
            await refreshData();
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
            refreshData(); // Refresh to show updated goal deadlines
            refreshData(); // Refresh goals list
        } catch (err) {
            console.error('Failed to set goal deadline:', err);
            alert('Failed to set goal deadline');
        }
    };
    const handleGoalUpdate = async (goalId, payload) => {
        try {
            await fractalApi.updateGoal(rootId, goalId, payload);
            refreshData(); // Refresh goals
        } catch (err) {
            console.error('Failed to update goal:', err);
        }
    };

    const handleGoalCompletion = async (goalId, currentStatus) => {
        try {
            await fractalApi.toggleGoalCompletion(rootId, goalId, !currentStatus);
            refreshData(); // Refresh goals
        } catch (err) {
            console.error('Failed to toggle goal completion:', err);
        }
    };

    const handleDeleteGoal = async (goal) => {
        if (!window.confirm(`Are you sure you want to delete "${goal.name}" and all its children?`)) return;
        try {
            await fractalApi.deleteGoal(rootId, goal.id);
            setShowGoalModal(false);
            refreshData();
        } catch (err) {
            console.error('Failed to delete goal:', err);
        }
    };

    const handleAddChildGoal = (parentGoal) => {
        const parentId = parentGoal.id || parentGoal.attributes?.id;
        setSelectedParent(parentGoal);
        setModalMode('create');
        setShowGoalModal(true);
    };

    const handleCreateGoal = async (payload) => {
        try {
            await fractalApi.createGoal(rootId, payload);
            setModalMode('view');
            setShowGoalModal(false);
            refreshData();
        } catch (err) {
            console.error('Failed to create goal:', err);
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
    const getDescendants = (id, allGoals, visited = new Set()) => {
        if (visited.has(id)) return [];
        visited.add(id);
        const g = allGoals.find(x => x.id === id);
        if (!g || !g.children) return [];
        let desc = [];
        g.children.forEach(c => {
            desc.push(c.id);
            desc = desc.concat(getDescendants(c.id, allGoals, visited));
        });
        return desc;
    };

    const attachedGoalIds = new Set();
    const taskSeedsForExpansion = [
        ...(program.goal_ids || []),
        ...sortedBlocks.flatMap(b => b.goal_ids || [])
    ];
    taskSeedsForExpansion.forEach(sid => {
        attachedGoalIds.add(sid);
        getDescendants(sid, goals).forEach(id => attachedGoalIds.add(id));
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



    // Find generic block for attach modal deadline constraints
    const attachBlock = sortedBlocks.find(b => b.id === attachBlockId);

    // Calculate overall program metrics
    const programMetrics = program ? (() => {
        const programSessions = sessions.filter(s => {
            let pDayId = s.program_day_id;
            if (!pDayId && s.attributes) {
                try {
                    const attr = typeof s.attributes === 'string' ? JSON.parse(s.attributes) : s.attributes;
                    pDayId = attr?.program_context?.day_id;
                } catch (e) { }
            }
            return pDayId && programDaysMap.has(pDayId);
        });

        return {
            completedSessions: programSessions.filter(s => s.completed).length,
            scheduledSessions: Array.from(programDaysMap.values()).reduce((sum, d) => sum + (d.templates?.length || 0), 0),
            totalDuration: programSessions.reduce((sum, s) => sum + (s.total_duration_seconds || 0), 0),
            goalsMet: Array.from(attachedGoalIds).filter(id => {
                const goal = getGoalDetails(id);
                return goal && (goal.completed || goal.attributes?.completed);
            }).length,
            totalGoals: attachedGoalIds.size,
            daysRemaining: Math.max(0, moment(program.end_date).startOf('day').diff(moment().startOf('day'), 'days'))
        };
    })() : null;

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
        let blockGoalIdsValue = [];
        const activeBlockGoalIds = activeBlock.goal_ids || [];

        if (activeBlockGoalIds.length > 0) {
            // Include active block's goals and all their descendants
            const blockSpecificSet = new Set();
            activeBlockGoalIds.forEach(id => {
                blockSpecificSet.add(id);
                getDescendants(id, goals).forEach(gid => blockSpecificSet.add(gid));
            });
            blockGoalIdsValue = Array.from(blockSpecificSet);
        } else {
            // Fallback: all program-attached goals (including descendants) that fall in this block
            blockGoalIdsValue = Array.from(attachedGoalIds).filter(id => {
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
            totalDuration: blockSessions.reduce((sum, s) => sum + (s.total_duration_seconds || 0), 0),
            daysRemaining: Math.max(0, moment(activeBlock.end_date).startOf('day').diff(moment().startOf('day'), 'days'))
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
                        <div style={{ fontSize: '14px', color: '#888', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{formatDate(program.start_date)} - {formatDate(program.end_date)}</span>
                            {program.description && (
                                <>
                                    <span>•</span>
                                    <span style={{ color: '#aaa' }}>{program.description}</span>
                                </>
                            )}
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
                <ProgramSidebar
                    programMetrics={programMetrics}
                    activeBlock={activeBlock}
                    blockMetrics={blockMetrics}
                    programGoalSeeds={programGoalSeeds}
                    onGoalClick={(goal) => {
                        setSelectedGoal(goal);
                        setShowGoalModal(true);
                    }}
                    getGoalDetails={getGoalDetails}
                />

                {/* Right Panel */}
                <div style={{ flex: 1, padding: '24px', background: '#121212', overflowY: 'auto' }}>
                    {viewMode === 'calendar' ? (
                        <ProgramCalendarView
                            program={program}
                            calendarEvents={calendarEvents}
                            blockCreationMode={blockCreationMode}
                            setBlockCreationMode={setBlockCreationMode}
                            onAddBlockClick={handleAddBlockClick}
                            onDateSelect={handleDateSelect}
                            onEventClick={handleEventClick}
                        />
                    ) : (
                        <ProgramBlockView
                            blocks={sortedBlocks}
                            sessions={sessions}
                            goals={goals}
                            onEditDay={handleEditDay}
                            onAttachGoal={handleAttachGoalClick}
                            onEditBlock={handleEditBlockClick}
                            onDeleteBlock={handleDeleteBlock}
                            onAddDay={handleAddDayClick}
                            onGoalClick={(goal) => {
                                setSelectedGoal(goal);
                                setShowGoalModal(true);
                            }}
                        />
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
                onClose={() => {
                    setShowGoalModal(false);
                    setModalMode('view');
                }}
                goal={selectedGoal}
                onUpdate={handleGoalUpdate}
                onToggleCompletion={handleGoalCompletion}
                onDelete={handleDeleteGoal}
                onAddChild={handleAddChildGoal}
                rootId={rootId}
                treeData={treeData}
                sessions={sessions}
                programs={[program]}
                activityDefinitions={activities}
                activityGroups={activityGroups}
                displayMode="modal"
                mode={modalMode}
                onCreate={handleCreateGoal}
                parentGoal={selectedParent}
            />
        </div >
    );
};

export default ProgramDetail;
