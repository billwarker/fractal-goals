import { useCallback, useState } from 'react';

export function useProgramDetailController({ goals = [] }) {
    const [showEditBuilder, setShowEditBuilder] = useState(false);
    const [viewMode, setViewMode] = useState('calendar');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [showBlockModal, setShowBlockModal] = useState(false);
    const [blockModalData, setBlockModalData] = useState(null);

    const [showDayModal, setShowDayModal] = useState(false);
    const [dayModalInitialData, setDayModalInitialData] = useState(null);


    const [blockCreationMode, setBlockCreationMode] = useState(false);

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

    const handleAddBlockClick = useCallback((initialBlockData = null) => {
        setBlockModalData({
            name: '',
            startDate: initialBlockData?.startDate || '',
            endDate: initialBlockData?.endDate || '',
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

    // Program days belong to the program, so creating or editing one needs no block.
    const handleAddDayClick = useCallback(() => {
        setDayModalInitialData(null);
        setShowDayModal(true);
    }, []);

    const handleCreateDayForDate = useCallback((date) => {
        // A day created from a calendar date starts as a specific-dates day on that date.
        setDayModalInitialData({
            name: '',
            scheduled_dates: [date],
            day_of_week: [],
            templates: [],
        });
        setShowDayModal(true);
    }, []);

    const handleEditDay = useCallback((day) => {
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
        dayModalInitialData,
        blockCreationMode,
        setBlockCreationMode,
        showGoalModal,
        selectedGoal,
        modalMode,
        selectedParent,
        openGoalModal,
        closeGoalModal,
        handleAddBlockClick,
        handleEditBlockClick,
        closeBlockModal,
        handleBlockSaveSuccess,
        handleAddDayClick,
        handleCreateDayForDate,
        handleEditDay,
        closeDayModal,
        handleDaySaveSuccess,
        handleEventClick,
        handleAddChildGoal,
    };
}

export default useProgramDetailController;
