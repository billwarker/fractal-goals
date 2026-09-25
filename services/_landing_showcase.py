"""Mixin for LandingPublishService: showcase goal content, sessions, activities, and analytics views.
"""

from copy import deepcopy
from sqlalchemy import and_, case, func
from sqlalchemy.orm import selectinload
from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    AnalyticsDashboard,
    Goal,
    MetricDefinition,
    MetricValue,
    Program,
    Session,
    SessionTemplate,
    Target,
)
from services.serializers import (
    format_utc,
    serialize_activity_definition,
    serialize_activity_group,
    serialize_activity_instance_for_analytics,
    serialize_analytics_dashboard,
    serialize_session_template,
)
from services.service_types import JsonDict
from services.session_service import SessionService
from services.session_template_stats_service import MAX_DURATION_SECONDS
from services._landing_common import (
    LANDING_EXAMPLE_ACTIVITY_CATALOGUE_LIMIT,
    LANDING_EXAMPLE_ANALYTICS_LIMIT,
    LANDING_EXAMPLE_SESSIONS_LIMIT,
    LANDING_EXAMPLE_SHOWCASE_ANALYTICS_VIEW_LIMIT,
    LANDING_EXAMPLE_TEMPLATES_LIMIT,
)


class _LandingShowcaseMixin:
    def _resolve_landing_goal_content(
        self,
        root: Goal,
        content: JsonDict | None,
    ) -> tuple[JsonDict, list[str]]:
        """Resolve per-bullet demo references without making stale content unpublishable."""
        resolved = self._normalize_landing_example_content(content)
        warnings: list[str] = []
        goal_ids = {
            bullet.get("goal_id")
            for bullet in resolved["goals"]["bullets"]
            if bullet.get("goal_id")
        }
        existing_goals = {
            row[0]
            for row in self.db_session.query(Goal.id).filter(
                Goal.id.in_(goal_ids),
                Goal.root_id == root.id,
                Goal.deleted_at.is_(None),
            ).all()
        } if goal_ids else set()

        for bullet in resolved["goals"]["bullets"]:
            goal_id = bullet.get("goal_id")
            if goal_id and goal_id not in existing_goals:
                warnings.append(f"{bullet['heading']}: selected goal no longer exists and was skipped")
                bullet["goal_id"] = None
                bullet["target_id"] = None
                continue
            target_id = bullet.get("target_id")
            if not target_id:
                continue
            target_exists = self.db_session.query(Target.id).filter(
                Target.id == target_id,
                Target.goal_id == goal_id,
                Target.root_id == root.id,
                Target.deleted_at.is_(None),
            ).first()
            if not target_exists:
                warnings.append(f"{bullet['heading']}: selected target no longer exists and was skipped")
                bullet["target_id"] = None
        return resolved, warnings

    def _resolve_landing_showcase(self, root: Goal, showcase: JsonDict | None) -> tuple[JsonDict, list[str]]:
        """Validate admin-picked showcase references against the root, dropping any
        stale ids (deleted/moved content) instead of failing publish."""
        resolved = self._normalize_landing_example_showcase(showcase)
        warnings: list[str] = []

        if resolved["session_id"]:
            session = self.db_session.query(Session).options(
                selectinload(Session.activity_instances),
            ).filter(
                Session.id == resolved["session_id"],
                Session.root_id == root.id,
                Session.deleted_at.is_(None),
            ).first()
            if not session:
                warnings.append("Featured session no longer exists and was skipped")
                resolved["session_id"] = None
            elif not any(instance.deleted_at is None for instance in (session.activity_instances or [])):
                warnings.append("Featured session has no activities and was skipped")
                resolved["session_id"] = None

        if resolved["activity_ids"]:
            existing_ids = {
                row[0]
                for row in self.db_session.query(ActivityDefinition.id).filter(
                    ActivityDefinition.id.in_(resolved["activity_ids"]),
                    ActivityDefinition.root_id == root.id,
                    ActivityDefinition.deleted_at.is_(None),
                ).all()
            }
            dropped = [activity_id for activity_id in resolved["activity_ids"] if activity_id not in existing_ids]
            if dropped:
                warnings.append(f"{len(dropped)} featured activities no longer exist and were skipped")
            resolved["activity_ids"] = [
                activity_id for activity_id in resolved["activity_ids"] if activity_id in existing_ids
            ]

        if resolved["analytics_view_ids"]:
            existing_ids = {
                row[0]
                for row in self.db_session.query(AnalyticsDashboard.id).filter(
                    AnalyticsDashboard.id.in_(resolved["analytics_view_ids"]),
                    AnalyticsDashboard.root_id == root.id,
                    AnalyticsDashboard.user_id == root.owner_id,
                    AnalyticsDashboard.kind == "view",
                    AnalyticsDashboard.deleted_at.is_(None),
                ).all()
            }
            dropped = [
                view_id for view_id in resolved["analytics_view_ids"]
                if view_id not in existing_ids
            ]
            if dropped:
                if len(dropped) == 1:
                    warnings.append("1 analytics view no longer exists and was removed")
                else:
                    warnings.append(f"{len(dropped)} analytics views no longer exist and were removed")
            resolved["analytics_view_ids"] = [
                view_id for view_id in resolved["analytics_view_ids"] if view_id in existing_ids
            ]

        if resolved["program_id"]:
            program_exists = self.db_session.query(Program.id).filter(
                Program.id == resolved["program_id"],
                Program.root_id == root.id,
            ).first()
            if not program_exists:
                warnings.append("Featured program no longer exists and was skipped")
                resolved["program_id"] = None
                resolved["program_start_date"] = None
                resolved["program_end_date"] = None

        return resolved, warnings

    def _build_landing_analytics_views(self, root: Goal, showcase: JsonDict) -> list[JsonDict]:
        query = self.db_session.query(AnalyticsDashboard).filter(
            AnalyticsDashboard.root_id == root.id,
            AnalyticsDashboard.user_id == root.owner_id,
            AnalyticsDashboard.kind == "view",
            AnalyticsDashboard.deleted_at.is_(None),
        )
        selected_ids = showcase.get("analytics_view_ids") or []
        if selected_ids:
            views = query.filter(AnalyticsDashboard.id.in_(selected_ids)).all()
            by_id = {view.id: view for view in views}
            ordered = [by_id[view_id] for view_id in selected_ids if view_id in by_id]
        else:
            ordered = query.order_by(
                AnalyticsDashboard.updated_at.desc(),
                AnalyticsDashboard.created_at.desc(),
                AnalyticsDashboard.name.asc(),
            ).limit(LANDING_EXAMPLE_SHOWCASE_ANALYTICS_VIEW_LIMIT).all()
        return [
            serialize_analytics_dashboard(view)
            for view in ordered[:LANDING_EXAMPLE_SHOWCASE_ANALYTICS_VIEW_LIMIT]
        ]

    @staticmethod
    def _dashboard_activity_refs(analytics_views: list[JsonDict]) -> tuple[set[str], set[str]]:
        """Collect activity/group refs a saved dashboard needs to render faithfully."""
        activity_ids: set[str] = set()
        group_ids: set[str] = set()

        def add_activity_id(value):
            if value:
                activity_ids.add(str(value))

        def collect_filters(filters):
            if not isinstance(filters, dict):
                return
            activities = filters.get("activities") if isinstance(filters.get("activities"), dict) else {}
            for activity_id in activities.get("activityIds") or []:
                add_activity_id(activity_id)
            for group_id in activities.get("groupIds") or []:
                if group_id:
                    group_ids.add(str(group_id))

        for view in analytics_views:
            layout = view.get("layout") if isinstance(view.get("layout"), dict) else {}
            collect_filters(layout.get("global_filters"))
            window_states = layout.get("window_states") if isinstance(layout.get("window_states"), dict) else {}
            for state in window_states.values():
                if not isinstance(state, dict):
                    continue
                selected_activity = state.get("selectedActivity")
                if isinstance(selected_activity, dict):
                    add_activity_id(selected_activity.get("id"))
                else:
                    add_activity_id(selected_activity)

        return activity_ids, group_ids

    @staticmethod
    def _collect_descendant_activity_group_ids(groups: list[ActivityGroup], selected_ids: set[str]) -> set[str]:
        children_by_parent: dict[str, list[str]] = {}
        for group in groups:
            if not group.parent_id:
                continue
            children_by_parent.setdefault(group.parent_id, []).append(group.id)

        collected = set(selected_ids)
        stack = list(selected_ids)
        while stack:
            group_id = stack.pop()
            for child_id in children_by_parent.get(group_id, []):
                if child_id in collected:
                    continue
                collected.add(child_id)
                stack.append(child_id)
        return collected

    def _build_landing_analytics_activity_instances(
        self,
        root: Goal,
        activity_ids: set[str],
        seed_instances: dict[str, list[JsonDict]] | None = None,
    ) -> dict[str, list[JsonDict]]:
        instances_by_activity: dict[str, list[JsonDict]] = {
            str(activity_id): [deepcopy(instance) for instance in instances or []]
            for activity_id, instances in (seed_instances or {}).items()
        }
        if not activity_ids:
            return instances_by_activity

        existing_instance_ids = {
            instance.get("id")
            for instances in instances_by_activity.values()
            for instance in instances
            if instance.get("id")
        }

        instances = self.db_session.query(ActivityInstance).options(
            selectinload(ActivityInstance.session),
            selectinload(ActivityInstance.definition).selectinload(ActivityDefinition.group),
            selectinload(ActivityInstance.metric_values).selectinload(MetricValue.definition),
            selectinload(ActivityInstance.metric_values).selectinload(MetricValue.split),
        ).filter(
            ActivityInstance.root_id == root.id,
            ActivityInstance.activity_definition_id.in_(activity_ids),
            ActivityInstance.deleted_at == None,
        ).order_by(
            func.coalesce(ActivityInstance.time_stop, ActivityInstance.updated_at, ActivityInstance.created_at).desc()
        ).limit(LANDING_EXAMPLE_ANALYTICS_LIMIT).all()

        for instance in instances:
            if instance.id in existing_instance_ids:
                continue
            session = instance.session
            if session and session.deleted_at is not None:
                continue
            serialized = serialize_activity_instance_for_analytics(
                instance,
                session_name=session.name if session else None,
                session_date=(session.session_start or session.created_at) if session else None,
            )
            instances_by_activity.setdefault(instance.activity_definition_id, []).append(serialized)
            existing_instance_ids.add(instance.id)

        return instances_by_activity

    def _build_landing_showcase_data(self, root: Goal, showcase: JsonDict | None = None) -> dict:
        owner_id = root.owner_id
        showcase = self._normalize_landing_example_showcase(showcase)
        analytics_views = self._build_landing_analytics_views(root, showcase)
        analytics_activity_ids, analytics_group_ids = self._dashboard_activity_refs(analytics_views)
        session_service = SessionService(self.db_session)
        sessions_result, sessions_error, _ = session_service.get_fractal_sessions(
            root.id,
            owner_id,
            limit=LANDING_EXAMPLE_SESSIONS_LIMIT,
            offset=0,
            filters={"sort_by": "session_start", "sort_order": "desc"},
        )
        sessions = sessions_result.get("sessions", []) if sessions_result and not sessions_error else []

        featured_session_id = showcase["session_id"]
        if featured_session_id and not any(session.get("id") == featured_session_id for session in sessions):
            featured_result, featured_error, _ = session_service.get_session_details(
                root.id,
                featured_session_id,
                owner_id,
            )
            if featured_result and not featured_error:
                sessions = [featured_result, *sessions]

        analytics_result, analytics_error, _ = session_service.get_session_analytics_summary(
            root.id,
            owner_id,
            limit=LANDING_EXAMPLE_ANALYTICS_LIMIT,
        )
        analytics_summary = analytics_result if analytics_result and not analytics_error else None

        activity_ids = {
            instance.get("activity_definition_id")
            for session in sessions
            for instance in (session.get("activity_instances") or [])
            if instance.get("activity_definition_id")
        }
        if analytics_summary:
            activity_ids.update((analytics_summary.get("activity_instances") or {}).keys())
        # Explicitly featured activities must always serialize, even when no
        # recent session or analytics row references them.
        activity_ids.update(showcase["activity_ids"])
        activity_ids.update(analytics_activity_ids)

        # The Activities feature opens on a read-only Manage Activities-style
        # catalogue, so publish the bounded fractal catalogue rather than only
        # definitions referenced by recent sessions or analytics. Explicit
        # showcase/analytics references above remain included beyond the cap.
        catalogue_activity_ids = self.db_session.query(ActivityDefinition.id).filter(
            ActivityDefinition.root_id == root.id,
            ActivityDefinition.deleted_at == None,
        ).order_by(ActivityDefinition.name.asc()).limit(LANDING_EXAMPLE_ACTIVITY_CATALOGUE_LIMIT).all()
        activity_ids.update(row[0] for row in catalogue_activity_ids)

        activity_groups = self.db_session.query(ActivityGroup).filter(
            ActivityGroup.root_id == root.id,
            ActivityGroup.deleted_at == None,
        ).order_by(ActivityGroup.sort_order.asc(), ActivityGroup.name.asc()).all()
        analytics_instance_activity_ids = set(analytics_activity_ids)
        if analytics_group_ids:
            scoped_group_ids = self._collect_descendant_activity_group_ids(activity_groups, analytics_group_ids)
            grouped_activity_ids = self.db_session.query(ActivityDefinition.id).filter(
                ActivityDefinition.root_id == root.id,
                ActivityDefinition.group_id.in_(scoped_group_ids),
                ActivityDefinition.deleted_at == None,
            ).all()
            grouped_ids = {row[0] for row in grouped_activity_ids}
            activity_ids.update(grouped_ids)
            analytics_instance_activity_ids.update(grouped_ids)

        activity_definitions = []
        if activity_ids:
            activities = self.db_session.query(ActivityDefinition).options(
                selectinload(ActivityDefinition.metric_definitions).selectinload(MetricDefinition.fractal_metric),
                selectinload(ActivityDefinition.split_definitions),
                selectinload(ActivityDefinition.group),
                selectinload(ActivityDefinition.associated_goals),
            ).filter(
                ActivityDefinition.id.in_(activity_ids),
                ActivityDefinition.root_id == root.id,
                ActivityDefinition.deleted_at == None,
            ).order_by(ActivityDefinition.name.asc()).all()
            activity_definitions = [serialize_activity_definition(activity) for activity in activities]

        activity_instantiation_summary = {}
        if activity_ids:
            summary_rows = self.db_session.query(
                ActivityInstance.activity_definition_id,
                func.count(ActivityInstance.id),
                func.max(func.coalesce(Session.session_start, Session.created_at, ActivityInstance.created_at)),
                func.avg(case(
                    (
                        and_(
                            ActivityInstance.completed.is_(True),
                            ActivityInstance.duration_seconds > 0,
                            ActivityInstance.duration_seconds <= MAX_DURATION_SECONDS,
                        ),
                        ActivityInstance.duration_seconds,
                    ),
                    else_=None,
                )),
            ).join(
                Session,
                Session.id == ActivityInstance.session_id,
            ).filter(
                ActivityInstance.activity_definition_id.in_(activity_ids),
                ActivityInstance.root_id == root.id,
                ActivityInstance.deleted_at == None,
                Session.root_id == root.id,
                Session.deleted_at == None,
            ).group_by(ActivityInstance.activity_definition_id).all()
            activity_instantiation_summary = {
                str(activity_id): {
                    "instance_count": int(instance_count or 0),
                    "last_used_at": format_utc(last_used_at),
                    "average_duration_seconds": (
                        int(round(float(average_duration_seconds)))
                        if average_duration_seconds is not None
                        else None
                    ),
                }
                for activity_id, instance_count, last_used_at, average_duration_seconds in summary_rows
            }

        analytics_activity_instances = self._build_landing_analytics_activity_instances(
            root,
            analytics_instance_activity_ids,
            (analytics_summary or {}).get("activity_instances") if analytics_summary else None,
        )

        templates = self.db_session.query(SessionTemplate).options(
            selectinload(SessionTemplate.goals).selectinload(Goal.level),
        ).filter(
            SessionTemplate.root_id == root.id,
            SessionTemplate.deleted_at == None,
        ).order_by(SessionTemplate.updated_at.desc()).limit(LANDING_EXAMPLE_TEMPLATES_LIMIT).all()

        return {
            "sessions": sessions,
            "activity_definitions": activity_definitions,
            "activity_groups": [serialize_activity_group(group) for group in activity_groups],
            "activity_instantiation_summary": activity_instantiation_summary,
            "analytics_views": analytics_views,
            "analytics_activity_instances": analytics_activity_instances,
            "session_templates": [serialize_session_template(template) for template in templates],
        }
