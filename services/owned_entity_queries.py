from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    Goal,
    Program,
    Session,
    SessionTemplate,
)


def get_owned_session(db_session, root_id, session_id, *, include_deleted=False, query_options=()):
    query = db_session.query(Session)
    if query_options:
        query = query.options(*query_options)
    query = query.filter(Session.id == session_id, Session.root_id == root_id)
    if not include_deleted:
        query = query.filter(Session.deleted_at.is_(None))
    return query.first()


def get_owned_activity_definition(
    db_session,
    root_id,
    activity_definition_id,
    *,
    include_deleted=False,
    query_options=(),
):
    query = db_session.query(ActivityDefinition)
    if query_options:
        query = query.options(*query_options)
    query = query.filter(
        ActivityDefinition.id == activity_definition_id,
        ActivityDefinition.root_id == root_id,
    )
    if not include_deleted:
        query = query.filter(ActivityDefinition.deleted_at.is_(None))
    return query.first()


def get_owned_activity_instance(
    db_session,
    root_id,
    instance_id,
    *,
    session_id=None,
    include_deleted=False,
    query_options=(),
):
    query = db_session.query(ActivityInstance)
    if query_options:
        query = query.options(*query_options)
    query = query.filter(
        ActivityInstance.id == instance_id,
        ActivityInstance.root_id == root_id,
    )
    if session_id is not None:
        query = query.filter(ActivityInstance.session_id == session_id)
    if not include_deleted:
        query = query.filter(ActivityInstance.deleted_at.is_(None))
    return query.first()


def get_owned_activity_group(
    db_session,
    root_id,
    group_id,
    *,
    include_deleted=False,
    query_options=(),
):
    query = db_session.query(ActivityGroup)
    if query_options:
        query = query.options(*query_options)
    query = query.filter(ActivityGroup.id == group_id, ActivityGroup.root_id == root_id)
    if not include_deleted:
        query = query.filter(ActivityGroup.deleted_at.is_(None))
    return query.first()


def get_owned_goal(db_session, root_id, goal_id, *, include_deleted=False, query_options=()):
    query = db_session.query(Goal)
    if query_options:
        query = query.options(*query_options)
    query = query.filter(Goal.id == goal_id, Goal.root_id == root_id)
    if not include_deleted:
        query = query.filter(Goal.deleted_at.is_(None))
    return query.first()


def get_owned_program(db_session, root_id, program_id, *, include_deleted=False, query_options=()):
    query = db_session.query(Program)
    if query_options:
        query = query.options(*query_options)
    query = query.filter(Program.id == program_id, Program.root_id == root_id)
    if not include_deleted and hasattr(Program, "deleted_at"):
        query = query.filter(Program.deleted_at.is_(None))
    return query.first()


def get_owned_session_template(
    db_session,
    root_id,
    template_id,
    *,
    include_deleted=False,
    query_options=(),
):
    query = db_session.query(SessionTemplate)
    if query_options:
        query = query.options(*query_options)
    query = query.filter(SessionTemplate.id == template_id, SessionTemplate.root_id == root_id)
    if not include_deleted and hasattr(SessionTemplate, "deleted_at"):
        query = query.filter(SessionTemplate.deleted_at.is_(None))
    return query.first()
