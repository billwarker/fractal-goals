import { useMemo, useState } from 'react';

import { useGoalDailyDurations } from './useGoalQueries';

export function useGoalDurationModal({ goalId, goalName, fallbackName, goalType, goalColor }) {
    const [isDurationModalOpen, setIsDurationModalOpen] = useState(false);
    const { data: durationsData, isSuccess: isDurationsSuccess } = useGoalDailyDurations(goalId, isDurationModalOpen);

    const graphModalConfig = useMemo(() => {
        if (!isDurationModalOpen || !isDurationsSuccess || !durationsData) {
            return null;
        }

        const points = durationsData.points || [];
        const labels = points.map((point) => new Date(point.date));
        const activityData = points.map((point) => Math.round(point.activity_duration / 60));

        return {
            title: goalName || fallbackName,
            goalType,
            goalColor,
            graphData: {
                labels,
                datasets: [
                    {
                        label: 'Activity Duration',
                        data: activityData
                    }
                ]
            },
            options: {
                scales: {
                    y: {
                        title: { display: true, text: 'Duration (min)' },
                        beginAtZero: true
                    }
                }
            }
        };
    }, [durationsData, fallbackName, goalColor, goalName, goalType, isDurationModalOpen, isDurationsSuccess]);

    return {
        graphModalConfig,
        openDurationModal: () => setIsDurationModalOpen(true),
        closeDurationModal: () => setIsDurationModalOpen(false),
    };
}

export default useGoalDurationModal;
