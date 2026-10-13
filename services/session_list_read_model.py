"""Session card summaries without activity, set, note or template-body hydration."""
from sqlalchemy import case, func, select, union
from models import Goal, _safe_load_json, Program, ProgramBlock, ProgramDay, Session, SessionTemplate, Target, session_goals
from services.goal_loading import goal_serializer_relationship_loaders
from services.serializers import format_utc, serialize_goal
from services.session_runtime import get_template_color, normalize_session_type


class SessionListReadModel:
    def __init__(self, db):
        self.db = db

    def completed_goals(self, session_ids):
        if not session_ids:
            return {}
        references = union(
            select(Goal.completed_session_id.label('session_id'), Goal.id.label('goal_id')).where(
                Goal.completed_session_id.in_(session_ids), Goal.deleted_at.is_(None)),
            select(Target.completed_session_id, Goal.id).join(Goal, Goal.id == Target.goal_id).where(
                Target.completed_session_id.in_(session_ids), Target.deleted_at.is_(None), Goal.deleted_at.is_(None)),
            select(Session.id, Goal.id).join(session_goals, session_goals.c.session_id == Session.id).join(
                Goal, Goal.id == session_goals.c.goal_id,
            ).where(Session.id.in_(session_ids), Goal.completed.is_(True), Goal.deleted_at.is_(None),
                    Goal.completed_at >= Session.session_start, Goal.completed_at <= Session.session_end),
        ).subquery('completed_session_goals')
        result = {}
        for session_id, goal in self.db.query(references.c.session_id, Goal).join(
            Goal, Goal.id == references.c.goal_id,
        ).options(*goal_serializer_relationship_loaders()).all():
            serialized = serialize_goal(goal, include_children=False)
            result.setdefault(session_id, []).append({key: serialized[key] for key in (
                'id', 'name', 'type', 'level_id', 'completed', 'completed_at', 'is_smart', 'smart_status',
            )})
        return result

    def template_colors(self, template_ids):
        if not template_ids:
            return {}
        data = SessionTemplate.template_data
        colors = {}
        # Native JSON transfers only the scalar; legacy JSON strings decode once
        # per distinct template, preserving malformed-string fallback semantics.
        for row in self.db.query(SessionTemplate.id, case((func.jsonb_typeof(data['template_color']) == 'string',
                                                         data['template_color'].astext), else_=None).label('color'),
                                 case((func.jsonb_typeof(data) == 'string', data), else_=None).label('legacy')).filter(
            SessionTemplate.id.in_(template_ids),
        ).all():
            colors[row.id] = get_template_color(row.legacy) if row.legacy else get_template_color({'template_color': row.color})
        return colors

    def load(self, filtered_query, ordering, limit, offset):
        attrs = Session.attributes
        def runtime_text(key):
            nested = case((func.jsonb_typeof(attrs['session_data'][key]) == 'string', attrs['session_data'][key].astext), else_=None)
            direct = case((func.jsonb_typeof(attrs[key]) == 'string', attrs[key].astext), else_=None)
            return case((func.jsonb_typeof(attrs['session_data']) == 'object', nested), else_=direct)
        columns = [getattr(Session, key) for key in (
            'id', 'root_id', 'name', 'description', 'session_start', 'session_end', 'completed',
            'completed_at', 'created_at', 'updated_at', 'duration_minutes', 'total_duration_seconds',
            'is_paused', 'last_paused_at', 'total_paused_seconds', 'template_id',
        )]
        rows = filtered_query.with_entities(
            *columns,
            func.coalesce(runtime_text('session_type'), 'standard').label('session_type'),
            runtime_text('template_color').label('template_color'),
            case((func.jsonb_typeof(attrs) == 'string', attrs), else_=None).label('legacy_attributes'),
            func.coalesce(func.nullif(func.btrim(runtime_text('template_name')), ''),
                          func.nullif(func.btrim(SessionTemplate.name), '')).label('template_name'),
            Program.id.label('program_id'),
            Program.name.label('program_name'), Program.color.label('program_color'),
            ProgramBlock.id.label('block_id'), ProgramBlock.name.label('block_name'), ProgramBlock.color.label('block_color'),
            ProgramDay.id.label('day_id'), ProgramDay.name.label('day_name'),
        ).outerjoin(SessionTemplate, SessionTemplate.id == Session.template_id).outerjoin(
            ProgramDay, ProgramDay.id == Session.program_day_id,
        ).outerjoin(Program, Program.id == func.coalesce(Session.program_id, ProgramDay.program_id)).outerjoin(
            ProgramBlock, ProgramBlock.id == Session.program_block_id,
        ).order_by(*ordering).limit(limit).offset(offset).all()
        completed = self.completed_goals([row.id for row in rows])
        colors = self.template_colors({row.template_id for row in rows if row.template_id})
        result = []
        for row in rows:
            data = dict(row._mapping)
            for key in ('session_start', 'session_end', 'completed_at', 'created_at', 'updated_at', 'last_paused_at'):
                data[key] = format_utc(data[key])
            legacy = _safe_load_json(data.pop('legacy_attributes'), {})
            legacy = legacy if isinstance(legacy, dict) else {}
            legacy_data = legacy.get('session_data')
            if not isinstance(legacy_data, dict):
                legacy_data = legacy
            for key in ('session_type', 'template_name'):
                value = legacy_data.get(key)
                data[key] = value.strip() if isinstance(value, str) and value.strip() else data[key]
            data['session_type'] = normalize_session_type(data['session_type'])
            data['template_color'] = colors.get(row.template_id) or get_template_color(legacy_data) or get_template_color({'template_color': data['template_color']})
            data['read_model'] = 'session-list-v1'
            data['completed_goals'] = completed.get(row.id, [])
            data['attributes'] = {
                'description': row.description or legacy.get('description'), 'updated_at': data['updated_at'],
                'session_data': {key: data[key] for key in (
                    'session_start', 'session_end', 'duration_minutes', 'total_duration_seconds',
                    'total_paused_seconds', 'last_paused_at', 'is_paused', 'completed', 'session_type', 'template_color', 'template_name',
                )},
            }
            program_info = {key: data.pop(key) for key in (
                'program_id', 'program_name', 'program_color', 'block_id', 'block_name', 'block_color', 'day_id', 'day_name',
            )}
            data['program_info'] = program_info if row.program_id else None
            result.append(data)
        return result
