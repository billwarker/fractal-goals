import { useState } from 'react';

/**
 * Which template items have their "Planned values" editor open, and the edit that
 * writes a prescription back onto one section item.
 */
export default function useTemplateItemPlans(setCurrentTemplate) {
    const [openPlanKeys, setOpenPlanKeys] = useState(() => new Set());

    const togglePlan = (planKey) => {
        setOpenPlanKeys((current) => {
            const next = new Set(current);
            if (next.has(planKey)) next.delete(planKey);
            else next.add(planKey);
            return next;
        });
    };

    const updatePrescription = (sectionIndex, activityIndex, prescription) => {
        setCurrentTemplate((previous) => ({
            ...previous,
            sections: previous.sections.map((section, index) => (
                index !== sectionIndex ? section : {
                    ...section,
                    activities: (section.activities || []).map((item, itemIndex) => (
                        itemIndex !== activityIndex ? item : { ...item, prescription }
                    )),
                }
            )),
        }));
    };

    return { openPlanKeys, togglePlan, updatePrescription };
}
