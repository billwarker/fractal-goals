import { flattenGoalTree } from './goalNodeModel';
import { expandProgramGoalIds, getProgramDatePart } from './programGoalWindow';

function toId(value) {
    return value == null ? null : String(value);
}

function uniqueIds(ids = []) {
    return Array.from(new Set(ids.map(toId).filter(Boolean)));
}

function collectProgramGoalIds(program) {
    const blockGoalIds = (program?.blocks || []).flatMap((block) => [
        ...(block.goal_ids || []),
        ...(block.days || []).flatMap((day) => day.goal_ids || []),
    ]);

    return uniqueIds([
        ...(program?.goal_ids || []),
        ...(program?.selected_goals || []),
        ...blockGoalIds,
    ]);
}

function buildChildrenById(treeData) {
    const goals = Array.isArray(treeData)
        ? treeData.flatMap((node) => flattenGoalTree(node, { includeRoot: true }))
        : flattenGoalTree(treeData, { includeRoot: true });
    const childrenById = new Map();

    goals.forEach((goal) => {
        const goalId = toId(goal.id);
        if (!goalId) return;
        childrenById.set(goalId, (goal.childrenIds || []).map(toId).filter(Boolean));
    });

    return childrenById;
}

function dateFallsInProgram(dateValue, program) {
    const date = getProgramDatePart(dateValue);
    const start = getProgramDatePart(program?.start_date);
    const end = getProgramDatePart(program?.end_date);

    return Boolean(date && start && end && date >= start && date <= end);
}

function isProgramActive(program, referenceDate = new Date()) {
    if (program?.is_active === true) {
        return true;
    }

    return dateFallsInProgram(referenceDate, program);
}

function programContainsGoal(program, goalId, childrenById) {
    const scopedGoalIds = expandProgramGoalIds(collectProgramGoalIds(program), childrenById);
    return scopedGoalIds.includes(toId(goalId));
}

export function getProgramsAffectedByGoalCompletion({
    programs = [],
    treeData,
    goalId,
    mode,
    referenceDate = new Date(),
    completedAt = null,
} = {}) {
    const normalizedGoalId = toId(goalId);
    if (!normalizedGoalId || !Array.isArray(programs) || programs.length === 0) {
        return [];
    }

    const childrenById = buildChildrenById(treeData);

    return programs.filter((program) => {
        if (!programContainsGoal(program, normalizedGoalId, childrenById)) {
            return false;
        }

        if (mode === 'complete') {
            return isProgramActive(program, referenceDate);
        }

        if (mode === 'uncomplete') {
            return completedAt ? dateFallsInProgram(completedAt, program) : true;
        }

        return false;
    });
}
