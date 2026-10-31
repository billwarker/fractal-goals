import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useFractalTree } from '../../hooks/useGoalQueries';
import { flattenGoalTree } from '../../utils/goalNodeModel';
import GoalIcon from '../atoms/GoalIcon';
import Tooltip from '../atoms/Tooltip';
import styles from './InstanceLinkedGoalIcons.module.css';

const MAX_VISIBLE = 4;
const goalMapsByTree = new WeakMap();

// One lookup per fetched tree, shared by every card on the page.
function goalsById(tree) {
    if (!tree || typeof tree !== 'object') return null;
    if (!goalMapsByTree.has(tree)) {
        goalMapsByTree.set(tree, new Map(flattenGoalTree(tree).map((goal) => [String(goal.id), goal])));
    }
    return goalMapsByTree.get(tree);
}

/**
 * The goals this instance is linked to one-off (direct `associated_goal_ids`), always shown on the
 * card's meta line. Read-only: the scoped header control owns adding and removing a link.
 */
export default function InstanceLinkedGoalIcons({ rootId, goalIds = [] }) {
    const { data: tree } = useFractalTree(rootId, { enabled: goalIds.length > 0 });
    const { getGoalIcon, getGoalColor, getGoalSecondaryColor } = useGoalLevels();
    const lookup = goalsById(tree);
    const goals = lookup
        ? goalIds.map((goalId) => lookup.get(String(goalId))).filter(Boolean)
        : [];
    if (goals.length === 0) return null;

    const visible = goals.slice(0, MAX_VISIBLE);
    const hidden = goals.slice(MAX_VISIBLE);
    return (
        <span className={styles.icons} role="list" aria-label="Linked goals">
            {visible.map((goal) => {
                const label = `Linked to ${goal.name} (this instance only)`;
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
                <Tooltip label={`Also linked to ${hidden.map((goal) => goal.name).join(', ')}`} portal>
                    <span className={styles.more} role="listitem" tabIndex={0}>+{hidden.length}</span>
                </Tooltip>
            )}
        </span>
    );
}
