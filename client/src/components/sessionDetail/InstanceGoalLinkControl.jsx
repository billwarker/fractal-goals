import { useRef } from 'react';
import IconButton from '../atoms/IconButton';
import GoalIcon from '../atoms/GoalIcon';
import Tooltip from '../atoms/Tooltip';
import useActivityInstanceGoalAssociation from '../../hooks/useActivityInstanceGoalAssociation';
import activityStyles from './SessionActivityItem.module.css';
import hierarchyStyles from '../goals/GoalHierarchyList.module.css';
import styles from './InstanceGoalLinkControl.module.css';

export default function InstanceGoalLinkControl({ rootId, sessionId, instance, scope }) {
    const mutation = useActivityInstanceGoalAssociation(rootId, sessionId, instance.id);
    const submitting = useRef(false);
    if (!scope?.goal?.id) return null;
    const goalId = String(scope.goal.id);
    const linked = (instance.associated_goal_ids || []).map(String).includes(goalId);
    const definitionId = String(instance.activity_definition_id);
    // One-off-only ids widen the picker but are not definition or group links.
    const broaderLink = (scope.activityIds || []).includes(definitionId) && !scope.instanceLinkedIds?.has(definitionId);
    const actionLabel = linked ? `Remove instance association with ${scope.goal.name}` : `Associate with ${scope.goal.name}`;
    const tooltip = `${actionLabel}. This instance only.${broaderLink ? ' Definition or group links also apply; removing this link preserves them.' : ''}`;
    const presentation = scope.goal.scopePresentation;
    const error = mutation.variables?.goalId === goalId
        ? mutation.error?.response?.data?.error || mutation.error?.message : null;
    const submit = async (event) => {
        event.stopPropagation();
        if (submitting.current || mutation.isPending) return;
        submitting.current = true;
        try {
            await mutation.mutateAsync({ goalId, remove: linked });
        } catch {
            // The mutation owns the actionable inline error; retain the current association.
        } finally {
            submitting.current = false;
        }
    };
    return (
        <div className={styles.control}>
            <Tooltip label={tooltip} portal>
                <IconButton variant="subtle" size="sm" className={`${activityStyles.editDefinitionButton} ${styles.button}`}
                    onClick={submit} disabled={mutation.isPending} aria-busy={mutation.isPending}
                    aria-label={actionLabel} aria-pressed={linked}>
                    <span aria-hidden="true" className={linked ? hierarchyStyles.sessionIconSlotBranchActive : undefined}>
                        <GoalIcon shape={presentation?.icon || 'circle'}
                            color={presentation?.color || 'var(--color-brand-primary)'}
                            secondaryColor={presentation?.secondaryColor || 'var(--color-brand-secondary)'}
                            isSmart={scope.goal.is_smart} size={14} />
                    </span>
                </IconButton>
            </Tooltip>
            {error && <span role="alert" className={styles.error}>Could not update the goal link: {error}. Try again.</span>}
        </div>
    );
}
