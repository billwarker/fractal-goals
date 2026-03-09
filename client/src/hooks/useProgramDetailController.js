import { useCallback, useState } from 'react';
import moment from 'moment';

export function useProgramDetailController({ goals = [] }) {
    const [showEditBuilder, setShowEditBuilder] = useState(false);
    const [viewMode, setViewMode] = useState('calendar');
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const [showBlockModal, setShowBlockModal] = useState(false);
    const [blockModalData, setBlockModalData] = useState(null);

    const [showDayModal, setShowDayModal] = useState(false);
    const [selectedBlockId, setSelectedBlockId] = useState(null);
    const [dayModalInitialData, setDayModalInitialData] = useState(null);

    const [showAttachModal, setShowAttachModal] = useState(false);
    const [attachBlockId, setAttachBlockId] = useState(null);

    const [blockCreationMode, setBlockCreationMode] = useState(false);

    const [showDayViewModal, setShowDayViewModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState(null);
    const [unscheduleConfirmOpen, setUnscheduleConfirmOpen] = useState(false);
    const [itemToUnschedule, setItemToUnschedule] = useState(null);

    const [showGoalModal, setShowGoalModal] = useState(false);
    const [selectedGoal, setSelectedGoal] = useState(null);
    const [modalMode, setModalMode] = useState('view');
    const [selectedParent, setSelectedParent] = useState(null);

    const openGoalModal = useCallback((goal, mode = 'view', parentGoal = null) => {
        setSelectedGoal(goal);
        setModalMode(mode);
        setSelectedParent(parentGoal);
        setShowGoalModal(true);
    }, []);

    const closeGoalModal = useCallback(() => {
        setShowGoalModal(false);
        setModalMode('view');
        setSelectedParent(null);
    }, []);

    const handleDateSelect = useCallback((selectInfo) => {
        selectInfo.view.calendar.unselect();

        if (blockCreationMode) {
            setBlockModalData({
                name: '',
                startDate: selectInfo.startStr,
                endDate: moment(selectInfo.endStr).subtract(1, 'days').format('YYYY-MM-DD'),
                color: '#3A86FF',
            });
            setShowBlockModal(true);
            return;
        }

        setSelectedDate(selectInfo.startStr);
        setShowDayViewModal(true);
    }, [blockCreationMode]);

    const handleDateClick = useCallback((clickInfo) => {
        if (blockCreationMode) {
            setBlockModalData({
                name: '',
                startDate: clickInfo.dateStr,
                endDate: clickInfo.dateStr,
                color: '#3A86FF',
            });
            setShowBlockModal(true);
            return;
        }

        setSelectedDate(clickInfo.dateStr);
        setShowDayViewModal(true);
    }, [blockCreationMode]);

    const handleAddBlockClick = useCallback(() => {
        setBlockModalData({
            name: '',
            startDate: '',
            endDate: '',
            color: '#3A86FF',
        });
        setShowBlockModal(true);
    }, []);

    const handleEditBlockClick = useCallback((block) => {
        setBlockModalData({
            id: block.id,
            name: block.name,
            startDate: block.start_date,
            endDate: block.end_date,
            color: block.color || '#3A86FF',
        });
        setShowBlockModal(true);
    }, []);

    const closeBlockModal = useCallback(() => {
        setShowBlockModal(false);
        setBlockModalData(null);
    }, []);

    const handleBlockSaveSuccess = useCallback(() => {
        setShowBlockModal(false);
        setBlockModalData(null);
        setBlockCreationMode(false);
    }, []);

    const handleAddDayClick = useCallback((blockId) => {
        setSelectedBlockId(blockId);
        setDayModalInitialData(null);
        setShowDayModal(true);
    }, []);

    const handleCreateDayForDate = useCallback((blockId, date) => {
        setSelectedBlockId(blockId);
        setDayModalInitialData({
            name: '',
            date,
            day_of_week: [],
            templates: [],
        });
        setShowDayViewModal(false);
        setSelectedDate(null);
        setShowDayModal(true);
    }, []);

    const handleEditDay = useCallback((blockId, day) => {
        setSelectedBlockId(blockId);
        setDayModalInitialData(day);
        setShowDayModal(true);
    }, []);

    const closeDayModal = useCallback(() => {
        setShowDayModal(false);
        setDayModalInitialData(null);
    }, []);

    const handleDaySaveSuccess = useCallback(() => {
        setShowDayModal(false);
        setDayModalInitialData(null);
    }, []);

    const handleAttachGoalClick = useCallback((blockId) => {
        setAttachBlockId(blockId);
        setShowAttachModal(true);
    }, []);

    const closeAttachModal = useCallback(() => {
        setShowAttachModal(false);
    }, []);

    const handleAttachGoalSaveSuccess = useCallback(() => {
        setShowAttachModal(false);
    }, []);

    const closeDayViewModal = useCallback(() => {
        setShowDayViewModal(false);
        setSelectedDate(null);
    }, []);

    const handleScheduleDaySuccess = useCallback(() => {
        setShowDayViewModal(false);
        setSelectedDate(null);
    }, []);

    const handleUnscheduleDay = useCallback((item) => {
        setItemToUnschedule(item);
        setUnscheduleConfirmOpen(true);
    }, []);

    const closeUnscheduleConfirm = useCallback(() => {
        setUnscheduleConfirmOpen(false);
        setItemToUnschedule(null);
    }, []);

    const handleUnscheduleSuccess = useCallback(() => {
        setUnscheduleConfirmOpen(false);
        setItemToUnschedule(null);
    }, []);

    const handleEventClick = useCallback((info) => {
        if (info.event.extendedProps.type !== 'goal') {
            return;
        }

        const goalId = info.event.extendedProps.id;
        const goal = goals.find((entry) => entry.id === goalId);
        if (goal) {
            openGoalModal(goal);
        }
    }, [goals, openGoalModal]);

    const handleAddChildGoal = useCallback((parentGoal) => {
        setSelectedParent(parentGoal);
        setModalMode('create');
        setShowGoalModal(true);
    }, []);

    return {
        showEditBuilder,
        setShowEditBuilder,
        viewMode,
        setViewMode,
        isSidebarOpen,
        setIsSidebarOpen,
        showBlockModal,
        blockModalData,
        showDayModal,
        selectedBlockId,
        dayModalInitialData,
        showAttachModal,
        attachBlockId,
        blockCreationMode,
        setBlockCreationMode,
        showDayViewModal,
        selectedDate,
        unscheduleConfirmOpen,
        itemToUnschedule,
        showGoalModal,
        selectedGoal,
        modalMode,
        selectedParent,
        openGoalModal,
        closeGoalModal,
        handleDateSelect,
        handleDateClick,
        handleAddBlockClick,
        handleEditBlockClick,
        closeBlockModal,
        handleBlockSaveSuccess,
        handleAddDayClick,
        handleCreateDayForDate,
        handleEditDay,
        closeDayModal,
        handleDaySaveSuccess,
        handleAttachGoalClick,
        closeAttachModal,
        handleAttachGoalSaveSuccess,
        closeDayViewModal,
        handleScheduleDaySuccess,
        handleUnscheduleDay,
        closeUnscheduleConfirm,
        handleUnscheduleSuccess,
        handleEventClick,
        handleAddChildGoal,
    };
}

export default useProgramDetailController;
