import React, { Suspense, useState } from 'react';

import ActivitySelectorPanel from '../common/ActivitySelectorPanel';
import CircuitBuilderModal from '../circuits/CircuitBuilderModal';
import { useCircuitDefinitionMutations } from '../../hooks/useCircuitQueries';
import useScopedSessionActivityOptions from '../../hooks/useScopedSessionActivityOptions';
import { prepareActivityDefinitionCopy, prepareActivityDefinitionDraft } from '../../utils/activityBuilder';
import { prepareCircuitDefinitionCopy, prepareCircuitDefinitionDraft } from '../../utils/circuitDefinition';
import { getGoalNodeActivityGroupIds } from '../../utils/goalNodeModel';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import styles from './PlanItem.module.css';

const ActivityBuilder = lazyWithRetry(() => import('../ActivityBuilder'), 'components/ActivityBuilder');

function errorMessage(error) {
    return error?.response?.data?.error || error?.message || 'Unable to create the circuit.';
}

/**
 * "+ Add activity" for one plan section, with the session page's full picker: search, the
 * activities/circuits toggle, and creating or copying a definition (also from a search with
 * no match). A created definition joins the plan's unsaved draft like a picked one.
 * `activityGoalScope` (a goal scoped in the Goals side pane) narrows the choices and is the
 * new definition's default goal; otherwise `defaultGoalIds` (the program day's goals) are.
 * `allowCircuits={false}` offers activities only (a quick session has no circuits).
 */
export default function PlanItemPicker({
    rootId,
    section,
    activities,
    circuits = [],
    activityGroups,
    activityGoalScope = null,
    defaultGoalIds = [],
    allowCircuits = true,
    label = '+ Add activity',
    onAdd,
}) {
    const [open, setOpen] = useState(false);
    // `{ draft }` while the activity builder is open; a blank create has a null draft.
    const [activityBuilder, setActivityBuilder] = useState(null);
    const [circuitBuilder, setCircuitBuilder] = useState(null);
    const [circuitError, setCircuitError] = useState('');
    const { createMutation } = useCircuitDefinitionMutations(rootId);
    const { scopedActivities, scopedCircuitDefinitions } = useScopedSessionActivityOptions(
        activities, circuits, activityGoalScope,
    );
    const scopedGoalId = activityGoalScope?.goal?.id;
    const initialGoalIds = scopedGoalId ? [String(scopedGoalId)] : (defaultGoalIds || []).map(String);
    const scopedGroupIds = getGoalNodeActivityGroupIds(activityGoalScope?.goal);
    const scopeGroups = scopedGroupIds.length > 0
        ? { ids: scopedGroupIds, goalName: activityGoalScope.goal.name }
        : null;

    const close = () => setOpen(false);
    const openActivityBuilder = (draft) => { close(); setActivityBuilder({ draft }); };
    const openCircuitBuilder = (mode, circuit) => {
        close();
        setCircuitError('');
        setCircuitBuilder({ mode, circuit });
    };
    const addCircuit = (circuit) => onAdd({ circuit_definition_id: circuit.id, name: circuit.name });

    const saveCircuit = async (payload) => {
        setCircuitError('');
        try {
            const created = (await createMutation.mutateAsync(payload))?.data;
            if (!created?.id) throw new Error('The circuit was created without a usable definition ID.');
            addCircuit(created);
            setCircuitBuilder(null);
        } catch (error) {
            setCircuitError(errorMessage(error));
        }
    };

    return (
        <>
            {open ? (
                <div className={styles.planPicker} data-plan-picker>
                    <ActivitySelectorPanel
                        activities={scopedActivities}
                        circuits={allowCircuits ? scopedCircuitDefinitions : []}
                        activityGroups={activityGroups}
                        activityGoalScope={activityGoalScope}
                        showTypeToggle={allowCircuits}
                        closeOnSelect
                        allowCreate
                        allowCopy
                        initialBrowseGroupId={section?.default_activity_group_id || null}
                        onClose={close}
                        onSelectActivity={(activity) => { onAdd(activity); close(); }}
                        onSelectCircuit={(circuit) => { addCircuit(circuit); close(); }}
                        onCreateActivityDefinition={(seed) => openActivityBuilder(prepareActivityDefinitionDraft(seed))}
                        onCopyActivityDefinition={(activity) => openActivityBuilder(prepareActivityDefinitionCopy(activity))}
                        onCreateCircuitDefinition={allowCircuits
                            ? (seed) => openCircuitBuilder('create', prepareCircuitDefinitionDraft(seed))
                            : undefined}
                        onCopyCircuitDefinition={allowCircuits
                            ? (circuit) => openCircuitBuilder('copy', prepareCircuitDefinitionCopy(circuit))
                            : undefined}
                    />
                </div>
            ) : (
                <button type="button" className={styles.addPlanItem} onClick={() => setOpen(true)}>
                    {label}
                </button>
            )}
            {activityBuilder ? (
                <Suspense fallback={null}>
                    <ActivityBuilder
                        isOpen
                        rootId={rootId}
                        editingActivity={activityBuilder.draft}
                        initialSelectedGoalIds={initialGoalIds}
                        scopeGroups={scopeGroups}
                        onClose={() => setActivityBuilder(null)}
                        onSave={(created) => { if (created?.id) onAdd(created); }}
                    />
                </Suspense>
            ) : null}
            {circuitBuilder ? (
                <CircuitBuilderModal
                    isOpen
                    circuit={circuitBuilder.circuit}
                    isCopy={circuitBuilder.mode === 'copy'}
                    activities={activities}
                    activityGroups={activityGroups}
                    onClose={() => { setCircuitBuilder(null); setCircuitError(''); }}
                    onSave={saveCircuit}
                    errorMessage={circuitError}
                    isSaving={createMutation.isPending}
                />
            ) : null}
        </>
    );
}
