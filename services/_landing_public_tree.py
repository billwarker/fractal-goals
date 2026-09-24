"""Mixin for LandingPublishService: the public goal tree, targets, history, and flow tree.
"""

import logging
from services.goal_note_read_model import load_root_goal_notes
from services.landing_history_projection import compact_landing_timeline_entry
from models import ActivityDefinition, Goal, GoalLevel, MetricDefinition, Target
from services.activity_association_service import ActivityAssociationService
from services.goal_target_service import GoalTargetService
from services.goal_history_read_model import GoalHistoryReadModel
from services.goal_timeline_service import GoalTimelineService
from services.goal_type_utils import get_canonical_goal_type
from services.note_service import NoteService
from services.programs import ProgramService
from services.serializers import calculate_smart_status, format_utc
from services.service_types import JsonDict
from services.session_service import SessionService
from services._landing_common import (
    LANDING_EXAMPLE_ANALYTICS_LIMIT,
    LANDING_EXAMPLE_NOTES_LIMIT,
    LANDING_EXAMPLE_TIMELINE_LIMIT,
)

logger = logging.getLogger(__name__)


class _LandingPublicTreeMixin:
    def _serialize_public_target(self, target: Target) -> JsonDict:
        metrics = []
        for condition in getattr(target, "metric_conditions", []) or []:
            metrics.append({
                "metric_id": condition.metric_definition_id,
                "metric_definition_id": condition.metric_definition_id,
                "operator": condition.operator,
                "value": condition.target_value,
                "target_value": condition.target_value,
            })
        return {
            "id": target.id,
            "name": target.name,
            "activity_id": target.activity_id,
            "type": target.type or "threshold",
            "metrics": metrics,
            "time_scope": target.time_scope or "all_time",
            "start_date": format_utc(target.start_date),
            "end_date": format_utc(target.end_date),
            "frequency_days": target.frequency_days,
            "frequency_count": target.frequency_count,
            "completed": bool(target.completed),
            "completed_at": format_utc(target.completed_at),
            "created_at": format_utc(target.created_at),
        }

    def _build_landing_target_analytics(
        self, root: Goal, serialized_tree: JsonDict, goals_by_id: dict[str, Goal], history=None
    ) -> dict[str, JsonDict]:
        """Publish bounded target analytics for the read-only public demo."""
        targets = []
        stack = [serialized_tree]
        while stack:
            node = stack.pop()
            targets.extend(node.get("attributes", {}).get("targets") or [])
            stack.extend(node.get("children") or [])

        target_service = GoalTargetService(self.db_session)
        result = {}
        for target in targets:
            target_id = target.get("id")
            if not target_id:
                continue
            if not target.get("activity_id"):
                result[target_id] = {
                    "target": target,
                    "activity_definition": None,
                    "instances": [],
                    "summary": {
                        "created_at": target.get("created_at"),
                        "total_count": 0,
                        "last_instance_at": None,
                        "days_since_created": None,
                        "conditions": [],
                        "completed": bool(target.get("completed")),
                        "completed_at": target.get("completed_at"),
                    },
                }
                continue
            payload, error, _ = target_service.get_target_analytics(
                root.id,
                target_id,
                root.owner_id,
                since="all",
                validated_root=root,
                preloaded_goals_by_id=goals_by_id,
                history=history,
            )
            if error or not payload:
                continue
            instances = payload.get("instances") or []
            payload["instances"] = instances[-LANDING_EXAMPLE_ANALYTICS_LIMIT:]
            result[target_id] = payload
        return result

    @staticmethod
    def _serialize_landing_metric_ref(metric: MetricDefinition) -> JsonDict:
        fm = getattr(metric, 'fractal_metric', None)
        return {
            "id": metric.id,
            "fractal_metric_id": metric.fractal_metric_id,
            "name": fm.name if fm else metric.name,
            "unit": fm.unit if fm else metric.unit,
            "input_type": fm.input_type if fm else "number",
            "precision": fm.precision if fm else 2,
            "track_progress": metric.track_progress,
        }

    def _serialize_landing_activity_ref(self, activity: ActivityDefinition) -> JsonDict:
        """Serialize the compact activity embed stored per goal.

        Root-level ``activity_definitions`` still carries the fuller activity
        records needed by sessions, analytics, and the activity feature. Goal
        attributes only need enough data for read-only activity cards and
        lineage detection, so avoid duplicating full definitions on every goal.
        """
        return {
            "id": activity.id,
            "name": activity.name,
            "description": activity.description,
            "group_id": activity.group_id,
            "has_sets": activity.has_sets,
            "has_metrics": activity.has_metrics,
            "metric_definitions": [
                self._serialize_landing_metric_ref(metric)
                for metric in (activity.metric_definitions or [])
                if not metric.deleted_at
            ],
        }

    def _serialize_public_goal_tree(
        self,
        goal: Goal,
        effective_levels_by_name: dict[str, GoalLevel] | None = None,
    ) -> JsonDict:
        goal_type = get_canonical_goal_type(goal) or (
            getattr(getattr(goal, "level", None), "name", "Goal").replace(" ", "")
        )
        level = self._resolve_effective_landing_level(goal, effective_levels_by_name, goal_type)
        level_name = getattr(level, "name", None)
        level_payload = {
            "id": getattr(level, "id", None),
            "name": level_name,
            "color": getattr(level, "color", None),
            "secondary_color": getattr(level, "secondary_color", None),
            "icon": getattr(level, "icon", None),
        } if level else None
        # Use the app's canonical SMART logic so the snapshot's is_smart / smart_status
        # match the authenticated app (which also passes measurable/achievable via
        # child-completion or activity associations, not just targets).
        smart_status = calculate_smart_status(goal)
        targets = [
            self._serialize_public_target(target)
            for target in (goal.targets_rel or [])
            if target.deleted_at is None
        ]
        associated_activities = [
            self._serialize_landing_activity_ref(activity)
            for activity in (goal.associated_activities or [])
            if getattr(activity, "deleted_at", None) is None
        ]
        associated_activity_ids = [activity["id"] for activity in associated_activities]
        associated_activity_group_ids = [
            group.id
            for group in (goal.associated_activity_groups or [])
            if getattr(group, "deleted_at", None) is None
        ]
        children = [
            self._serialize_public_goal_tree(child, effective_levels_by_name)
            for child in (goal.children or [])
            if child.deleted_at is None
        ]
        attributes = {
            "id": goal.id,
            "type": goal_type,
            "parent_id": goal.parent_id,
            "root_id": goal.root_id or goal.id,
            "description": goal.description,
            "deadline": format_utc(goal.deadline),
            "completed": bool(goal.completed),
            "completed_at": format_utc(goal.completed_at),
            "completion_state": "completed" if goal.completed else "active",
            "created_at": format_utc(goal.created_at),
            "updated_at": format_utc(goal.updated_at),
            "level_id": goal.level_id,
            "level_name": level_name,
            "level": level_payload,
            "targets": targets,
            "relevance_statement": goal.relevance_statement,
            "completed_via_children": bool(goal.completed_via_children),
            "inherit_parent_activities": bool(goal.inherit_parent_activities),
            "allow_manual_completion": bool(goal.allow_manual_completion),
            "track_activities": bool(goal.track_activities),
            "is_smart": all(smart_status.values()),
            "smart_status": smart_status,
            "paused": bool(getattr(goal, "paused", False)),
            "paused_at": format_utc(getattr(goal, "paused_at", None)),
            "associated_activity_ids": associated_activity_ids,
            "associated_activity_group_ids": associated_activity_group_ids,
            "associated_activities": associated_activities,
            # Filled in by the publish walk so the read-only landing modal can
            # render the Timeline and Notes tabs without any authenticated API.
            "timeline_events": [],
            "notes": [],
            "progress_settings": None,
        }
        result = {
            "name": goal.name,
            "id": goal.id,
            "type": goal_type,
            "level_id": goal.level_id,
            "level_name": level_name,
            "level": level_payload,
            "completed": bool(goal.completed),
            "completed_at": format_utc(goal.completed_at),
            "completion_state": attributes["completion_state"],
            "is_smart": all(smart_status.values()),
            "smart_status": smart_status,
            "paused": attributes["paused"],
            "paused_at": attributes["paused_at"],
            "description": goal.description,
            "deadline": format_utc(goal.deadline),
            "attributes": attributes,
            "children": children,
        }
        if level:
            result["level_characteristics"] = {
                "can_have_targets": getattr(level, "can_have_targets", True),
                "deadline_min_value": level.deadline_min_value,
                "deadline_min_unit": level.deadline_min_unit,
                "deadline_max_value": level.deadline_max_value,
                "deadline_max_unit": level.deadline_max_unit,
                "max_children": level.max_children,
                "auto_complete_when_children_done": getattr(level, "auto_complete_when_children_done", False),
                "description_required": getattr(level, "description_required", False),
                "default_deadline_offset_value": level.default_deadline_offset_value,
                "default_deadline_offset_unit": level.default_deadline_offset_unit,
                "sort_children_by": level.sort_children_by,
                "allow_manual_completion": level.allow_manual_completion,
                "requires_smart": getattr(level, "requires_smart", False),
            }
        return result

    def _enrich_landing_tree_with_history(
        self,
        serialized_root: JsonDict,
        root: Goal,
        goals_by_id: dict[str, Goal],
        effective_levels_by_name: dict[str, GoalLevel],
        history=None,
    ) -> None:
        """Embed bounded per-goal timeline + notes into the serialized snapshot tree.

        Root history is loaded once and projected through the canonical services. This keeps the public read model
        self-contained: the landing modal renders Timeline / Notes tabs entirely
        from this cache, with no authenticated API calls.
        """
        history = history or GoalHistoryReadModel(self.db_session, root.id).preload(set(goals_by_id), goals_by_id=goals_by_id)
        timeline_service = GoalTimelineService(self.db_session)
        note_service = NoteService(self.db_session)
        root_notes = load_root_goal_notes(self.db_session, root.id)
        activity_association_service = ActivityAssociationService(self.db_session)
        owner_id = root.owner_id

        def visit(node: JsonDict) -> None:
            attributes = node.get("attributes") or {}
            goal_id = attributes.get("id") or node.get("id")
            if goal_id:
                goal = goals_by_id.get(goal_id)
                activities, activities_error, _ = activity_association_service.get_goal_activities(
                    root.id,
                    goal_id,
                    owner_id,
                    validated_root=root,
                    goals_by_id=goals_by_id,
                )
                if activities_error is None and isinstance(activities, list):
                    attributes["associated_activities"] = activities
                    attributes["associated_activity_ids"] = [
                        activity.get("id")
                        for activity in activities
                        if activity.get("id")
                    ]

                groups, groups_error, _ = activity_association_service.get_goal_activity_groups(
                    root.id,
                    goal_id,
                    owner_id,
                    validated_root=root,
                    goals_by_id=goals_by_id,
                )
                if groups_error is None and isinstance(groups, list):
                    attributes["associated_activity_groups"] = groups
                    attributes["associated_activity_group_ids"] = [
                        group.get("id")
                        for group in groups
                        if group.get("id")
                    ]

                timeline_result, timeline_error, _ = timeline_service.get_goal_timeline(
                    root.id,
                    goal_id,
                    owner_id,
                    include_children=False,
                    limit=LANDING_EXAMPLE_TIMELINE_LIMIT,
                    validated_root=root,
                    preloaded_goals_by_id=goals_by_id,
                    preloaded_levels_by_name=effective_levels_by_name,
                    history=history,
                )
                attributes["timeline_events"] = (
                    [
                        compact_landing_timeline_entry(entry)
                        for entry in timeline_result.get("entries", [])
                    ] if timeline_result and not timeline_error else []
                )

                direct_activity_ids = {
                    activity.id
                    for activity in (getattr(goal, "associated_activities", None) or [])
                    if not activity.deleted_at
                }
                for group in (getattr(goal, "associated_activity_groups", None) or []):
                    direct_activity_ids.update(
                        activity.id
                        for activity in (group.activities or [])
                        if not activity.deleted_at
                    )
                notes_result, notes_error, _ = note_service.get_goal_notes(
                    root.id,
                    goal_id,
                    owner_id,
                    include_descendants=False,
                    validated_root=root,
                    preloaded_goal=goal,
                    preloaded_activity_definition_ids=list(direct_activity_ids),
                    preloaded_notes=root_notes,
                )
                notes = notes_result if notes_result and not notes_error else []
                attributes["notes"] = notes[:LANDING_EXAMPLE_NOTES_LIMIT]
            node["attributes"] = attributes
            for child in node.get("children") or []:
                visit(child)

        visit(serialized_root)

    @staticmethod
    def _collect_serialized_goal_ids(serialized_root: JsonDict) -> list[str]:
        ids: list[str] = []
        stack = [serialized_root]
        while stack:
            node = stack.pop()
            if not node:
                continue
            node_id = (node.get("attributes") or {}).get("id") or node.get("id")
            if node_id:
                ids.append(node_id)
            stack.extend(node.get("children") or [])
        return ids

    def _build_landing_flowtree_data(self, root: Goal, serialized_root: JsonDict, goals_by_id=None) -> dict:
        """Compute the root-scoped flowtree data the authenticated goals page fetches
        (recent-evidence goal ids, a whole-fractal metrics summary, and programs), so
        the landing view-options widget acts on real data without any public API.
        """
        owner_id = root.owner_id
        session_service = SessionService(self.db_session, preloaded_goals_by_id=goals_by_id)

        evidence_result, evidence_error, _ = session_service.get_recent_evidence_goal_ids(root.id, owner_id)
        evidence_goal_ids = (
            evidence_result.get("goal_ids", []) if evidence_result and not evidence_error else []
        )

        all_goal_ids = self._collect_serialized_goal_ids(serialized_root)
        metrics_result, metrics_error, _ = session_service.get_flowtree_session_metrics(
            root.id, owner_id, goal_ids=all_goal_ids
        )
        metrics_summary = metrics_result if metrics_result and not metrics_error else None

        try:
            programs = ProgramService.get_programs(self.db_session, root.id, owner_id)
        except Exception:
            logger.warning(
                "Landing snapshot could not load programs for root_id=%s",
                root.id,
                exc_info=True,
            )
            programs = []

        return {
            "evidence_goal_ids": evidence_goal_ids,
            "metrics_summary": metrics_summary,
            "programs": programs,
        }
