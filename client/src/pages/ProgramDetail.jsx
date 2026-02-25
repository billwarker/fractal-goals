import React, { useState, useEffect } from 'react';
import Linkify from '../components/atoms/Linkify';
import { useParams, useNavigate } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import { useTheme } from '../contexts/ThemeContext'
import { useGoalLevels } from '../contexts/GoalLevelsContext';;
import { getISOYMDInTimezone, formatDateInTimezone, getDatePart, formatLiteralDate } from '../utils/dateUtils';
import { useTimezone } from '../contexts/TimezoneContext';
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
import { toast } from 'react-hot-toast';
import { isBlockActive, ActiveBlockBadge } from '../utils/programUtils.jsx';
import { getChildType } from '../utils/goalHelpers';

import { useProgramData } from '../hooks/useProgramData';
import { useProgramLogic } from '../hooks/useProgramLogic';
import useIsMobile from '../hooks/useIsMobile';
import styles from './ProgramDetail.module.css';

const ProgramDetail = () => {
    const { getGoalColor, getGoalTextColor } = useGoalLevels();;
    const { rootId, programId } = useParams();
    const navigate = useNavigate();
    const { timezone } = useTimezone();
    const isMobile = useIsMobile();

    // Data Hook (manages program, goals, sessions, etc.)
    // Data Hook (manages program, goals, sessions, etc.)
    const {
        program,
        loading,
        goals, setGoals,
        activities,
        activityGroups,
        sessions, setSessions,
        treeData,
        refreshData,
        getGoalDetails
    } = useProgramData(rootId, programId);

    const actions = useProgramLogic(rootId, program, refreshData);



    const [showEditBuilder, setShowEditBuilder] = useState(false);

    // View Mode
    const [viewMode, setViewMode] = useState('calendar'); // 'calendar' or 'blocks'
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
        // Use literal formatting for header/program ranges to avoid timezone shifts
        return formatLiteralDate(dateString);
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
            await actions.saveProgram(programData);
            setShowEditBuilder(false);
        } catch (err) {
            console.error('Failed to update program:', err);
            toast.error('Failed to update program: ' + (err.response?.data?.error || err.message));
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

    const handleDateClick = (clickInfo) => {
        if (blockCreationMode) {
            const selectedDate = clickInfo.dateStr;
            setBlockModalData({
                name: '',
                startDate: selectedDate,
                endDate: selectedDate,
                color: '#3A86FF'
            });
            setShowBlockModal(true);
            return;
        }

        setSelectedDate(clickInfo.dateStr);
        setShowDayViewModal(true);
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
        try {
            await actions.saveBlock(blockData);
            setShowBlockModal(false);
            setBlockModalData(null);
            setBlockCreationMode(false);
        } catch (err) {
            console.error('Failed to save training block:', err);
            toast.error('Failed to save training block');
        }
    };

    const handleDeleteBlock = async (blockId) => {


        try {
            await actions.deleteBlock(blockId);
        } catch (err) {
            console.error('Failed to delete block:', err);
            toast.error('Failed to delete block');
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
            // The hook handles update vs create logic if we pass dayModalInitialData.id
            // Hook signature: saveDay(blockId, dayId, dayData)
            const dayId = dayModalInitialData ? dayModalInitialData.id : null;
            await actions.saveDay(selectedBlockId, dayId, dayData);
            setShowDayModal(false);
        } catch (err) {
            console.error('Failed to save day:', err);
            toast.error('Failed to save day: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleCopyDay = async (dayId, copyData) => {
        return actions.copyDay(selectedBlockId, dayId, copyData);
    };

    const handleDeleteDay = async (dayId) => {
        try {
            await actions.deleteDay(selectedBlockId, dayId);
            setShowDayModal(false);
        } catch (err) {
            console.error('Failed to delete day:', err);
            toast.error('Failed to delete day');
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

        try {
            await actions.unscheduleDay(itemToUnschedule);
        } catch (err) {
            console.error('Failed to unschedule day:', err);
            toast.error('Failed to unschedule day: ' + (err.response?.data?.error || err.message));
        } finally {
            setUnscheduleConfirmOpen(false);
            setItemToUnschedule(null);
        }
    };

    // Handler for scheduling a day (creates a Planned Session linked to the Template Day)
    const handleScheduleDay = async (blockId, date, templateDay) => {
        try {
            await actions.scheduleDay(blockId, date, templateDay);
            setShowDayViewModal(false);
            setSelectedDate(null);
        } catch (err) {
            console.error('Failed to schedule day:', err);
            toast.error('Failed to schedule day: ' + (err.response?.data?.error || err.message));
        }
    };

    // Handler for scheduling an existing block day (assigning a date)
    const handleScheduleBlockDay = async (blockId, dayId, date) => {
        try {
            await actions.scheduleBlockDay(blockId, dayId, date);
            setShowDayViewModal(false);
            setSelectedDate(null);
        } catch (err) {
            console.error('Failed to schedule block day:', err);
            toast.error('Failed to schedule block day: ' + (err.response?.data?.error || err.message));
        }
    };

    // Attach Goal Handlers
    const handleAttachGoalClick = (blockId) => {
        setAttachBlockId(blockId);
        setShowAttachModal(true);
    };

    const handleSaveAttachedGoal = async ({ goal_id, deadline }) => {
        try {
            await actions.attachGoal(attachBlockId, { goal_id, deadline });
            setShowAttachModal(false);
        } catch (err) {
            console.error('Failed to attach goal:', err);
            toast.error('Failed to attach goal: ' + (err.response?.data?.error || err.message));
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
            toast.error('Failed to set goal deadline');
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

    // Helper to get local date string from a datetime (YYYY-MM-DD) in user timezone
    const getLocalDateString = (dateTimeStr) => {
        return getISOYMDInTimezone(dateTimeStr, timezone);
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
            const addDayToDate = (dateStr) => {
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
                    // Avoid duplicate template entries for the same day
                    if (!group.templatesByName[t.name].templates.some(existing => existing.id === t.id)) {
                        group.templatesByName[t.name].templates.push(t);
                    }
                });
            };

            if (day.date) {
                addDayToDate(getDatePart(day.date));
            }

            if (day.day_of_week && day.day_of_week.length > 0 && block.start_date && block.end_date) {
                const start = moment(getDatePart(block.start_date));
                const end = moment(getDatePart(block.end_date));
                const dayMap = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };

                const dows = Array.isArray(day.day_of_week) ? day.day_of_week : [day.day_of_week];
                const activeDays = dows.map(d => dayMap[d]).filter(d => d !== undefined);

                let curr = start.clone();
                while (curr.isSameOrBefore(end)) {
                    if (activeDays.includes(curr.day())) {
                        addDayToDate(curr.format('YYYY-MM-DD'));
                    }
                    curr.add(1, 'days');
                }
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
            start: getDatePart(block.start_date),
            end: moment(getDatePart(block.end_date)).add(1, 'days').format('YYYY-MM-DD'),
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
                start: (isCompleted && completionDate) ? getISOYMDInTimezone(completionDate, timezone) : getDatePart(goal.deadline),
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

    const sidebarPanel = (
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
            compact={isMobile}
        />
    );

    const contentPanel = (
        <div className={`${styles.rightPanel} ${styles.calendarWrapper}`}>
            {viewMode === 'calendar' ? (
                <ProgramCalendarView
                    calendarEvents={calendarEvents}
                    blockCreationMode={blockCreationMode}
                    setBlockCreationMode={setBlockCreationMode}
                    onAddBlockClick={handleAddBlockClick}
                    onDateSelect={handleDateSelect}
                    onDateClick={handleDateClick}
                    onEventClick={handleEventClick}
                    isMobile={isMobile}
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
    );

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <button
                        onClick={() => navigate(`/${rootId}/programs?show_all=true`)}
                        className={styles.backBtn}
                    >
                        ← Back
                    </button>
                    <div>
                        <h1 className={styles.programTitle}>{program.name}</h1>
                        <div className={styles.programMeta}>
                            <span>{formatDate(program.start_date)} - {formatDate(program.end_date)}</span>
                            {program.description && (
                                <>
                                    <span>•</span>
                                    <span className={styles.description}><Linkify>{program.description}</Linkify></span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className={styles.headerActions}>
                    <div className={styles.viewToggle}>
                        <button
                            onClick={() => setViewMode('calendar')}
                            className={`${styles.toggleBtn} ${viewMode === 'calendar' ? styles.toggleBtnActive : ''}`}
                        >
                            Calendar
                        </button>
                        <button
                            onClick={() => setViewMode('blocks')}
                            className={`${styles.toggleBtn} ${viewMode === 'blocks' ? styles.toggleBtnActive : ''}`}
                        >
                            Blocks
                        </button>
                    </div>
                    <button
                        onClick={() => setIsSidebarOpen((prev) => !prev)}
                        className={styles.sidebarToggleBtn}
                    >
                        {isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
                    </button>
                    <button
                        onClick={() => setShowEditBuilder(true)}
                        className={styles.editBtn}
                    >
                        Edit Program
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className={styles.mainLayout}>
                {isMobile ? (
                    <>
                        {contentPanel}
                        {isSidebarOpen && sidebarPanel}
                    </>
                ) : (
                    <>
                        {isSidebarOpen && sidebarPanel}
                        {contentPanel}
                    </>
                )}
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
