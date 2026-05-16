import { getLineagePath } from '../components/flowTree/flowTreeTreeUtils';
import {
    getGoalNodeChildren,
    getGoalNodeId,
    getGoalNodeName,
    normalizeGoalNode,
} from './goalNodeModel';

const PUNCTUATION_REGEX = /[^\p{L}\p{N}]+/gu;

const toId = (value) => (value == null ? null : String(value));

export function normalizeGoalSearchText(value) {
    return String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(PUNCTUATION_REGEX, '');
}

export function fuzzyGoalNameMatches(name, query) {
    const normalizedName = normalizeGoalSearchText(name);
    const normalizedQuery = normalizeGoalSearchText(query);

    if (!normalizedQuery) return false;
    if (!normalizedName) return false;

    let queryIndex = 0;
    for (let index = 0; index < normalizedName.length && queryIndex < normalizedQuery.length; index += 1) {
        if (normalizedName[index] === normalizedQuery[queryIndex]) {
            queryIndex += 1;
        }
    }

    return queryIndex === normalizedQuery.length;
}

export function getVisibleGoalSearchCandidates(treeData, {
    selectedNodeId = null,
    hideCompletedGoals = false,
} = {}) {
    if (!treeData) return [];

    const selectedLineage = selectedNodeId ? getLineagePath(treeData, selectedNodeId) : null;
    const candidates = [];

    const traverse = (node) => {
        if (!node) return;

        const normalizedNode = normalizeGoalNode(node);
        const nodeId = toId(getGoalNodeId(normalizedNode));
        if (!nodeId) return;

        if (selectedLineage && !selectedLineage.has(nodeId)) return;
        if (hideCompletedGoals && Boolean(normalizedNode.completed)) return;

        const name = getGoalNodeName(normalizedNode);
        candidates.push({
            id: nodeId,
            name,
            normalizedName: normalizeGoalSearchText(name),
            node,
        });

        getGoalNodeChildren(node).forEach(traverse);
    };

    traverse(treeData);
    return candidates;
}

export function getGoalSearchMatches(candidates, query) {
    const normalizedQuery = normalizeGoalSearchText(query);
    if (!normalizedQuery) {
        return {
            normalizedQuery,
            matches: [],
            duplicateGroups: [],
            activeDuplicateGroup: null,
        };
    }

    const matches = candidates.filter((candidate) => (
        fuzzyGoalNameMatches(candidate.normalizedName, normalizedQuery)
    ));

    const groupsByName = new Map();
    matches.forEach((match) => {
        if (!match.normalizedName) return;
        const group = groupsByName.get(match.normalizedName) || [];
        group.push(match);
        groupsByName.set(match.normalizedName, group);
    });

    const duplicateGroups = Array.from(groupsByName.values()).filter((group) => group.length > 1);
    const activeDuplicateGroup = duplicateGroups.find((group) => group[0]?.normalizedName === normalizedQuery)
        || duplicateGroups[0]
        || null;

    return {
        normalizedQuery,
        matches,
        duplicateGroups,
        activeDuplicateGroup,
    };
}
