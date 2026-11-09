import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useSessionGoalsView } from '../../hooks/useSessionQueries';
import { indexGoalTree, instanceGoalIds, lowestGoalIdsPerBranch } from '../../utils/sessionGoalScope';
import GoalIcon from '../atoms/GoalIcon';
import Tooltip from '../atoms/Tooltip';
import styles from './InstanceGoalIcons.module.css';

const MAX_VISIBLE = 4;
const goalIndexByTree = new WeakMap();

// One lookup per fetched tree, shared by every card on the page.
function goalIndex(tree) {
    if (!tree || typeof tree !== 'object') return null;
    if (!goalIndexByTree.has(tree)) goalIndexByTree.set(tree, indexGoalTree(tree));
    return goalIndexByTree.get(tree);
}

/**
 * The lowest goal on each branch this instance counts toward, as the Goal Hierarchy pane resolves
 * them: definition and group goals plus one-off links, without paused goals.
 */
export function useInstanceLowestGoals(rootId, sessionId, instance) {
    const { data: view } = useSessionGoalsView(rootId, sessionId);
    const index = goalIndex(view?.goal_tree);
    if (!index || !instance) return [];
    const goalIds = [...instanceGoalIds(instance, view.activity_goal_ids_by_activity)]
        .filter((goalId) => index.nodeById.has(goalId) && !index.nodeById.get(goalId).paused);
    return lowestGoalIdsPerBranch(goalIds, index.parentById).map((goalId) => index.nodeById.get(goalId));
}

/** Read-only, on the card's meta line. The scoped header control owns adding and removing a link. */
export default function InstanceGoalIcons({ goals = [], directGoalIds = [] }) {
    const { getGoalIcon, getGoalColor, getGoalSecondaryColor } = useGoalLevels();
    if (goals.length === 0) return null;

    const direct = new Set(directGoalIds.map(String));
    const visible = goals.slice(0, MAX_VISIBLE);
    const hidden = goals.slice(MAX_VISIBLE);
    return (
        <span className={styles.icons} role="list" aria-label="Goals">
            {visible.map((goal) => {
                const label = direct.has(String(goal.id)) ? `Linked to ${goal.name} (this instance only)` : goal.name;
                return (
                    <Tooltip key={goal.id} label={label} portal>
                        <span className={styles.icon} role="listitem" tabIndex={0} aria-label={label}>
                            <GoalIcon
                                shape={getGoalIcon(goal)}
                                color={getGoalColor(goal)}
                                secondaryColor={getGoalSecondaryColor(goal)}
                                isSmart={goal.is_smart}
                                size={12}
                            />
                        </span>
                    </Tooltip>
                );
            })}
            {hidden.length > 0 && (
                <Tooltip label={`Also ${hidden.map((goal) => goal.name).join(', ')}`} portal>
                    <span className={styles.more} role="listitem" tabIndex={0}>+{hidden.length}</span>
                </Tooltip>
            )}
        </span>
    );
}
