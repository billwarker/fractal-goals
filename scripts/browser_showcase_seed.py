"""A realistic, read-only fractal for the visual sweep (client/e2e/sweep).

It belongs to its own admin user so the sweep can open admin-only pages (Logs) without
changing what the workflow specs see. Nothing here is mutated by a spec: screenshots of
the same seed stay comparable between runs.
"""

SWEEP_USERNAME = "sweep_admin"
SWEEP_PASSWORD = "SweepAdmin123!"
SHOWCASE_ROOT_ID = "sweep-showcase-root"

# Mirrors the client's default level palette (contexts/GoalLevelsContext.jsx).
_LEVELS = (
    ("Long Term Goal", 1, "#3bc57c", "#0f271c", "hexagon"),
    ("Mid Term Goal", 2, "#f59f4d", "#2c1d0f", "diamond"),
    ("Short Term Goal", 3, "#8b6fff", "#181329", "triangle"),
    ("Immediate Goal", 4, "#ef6a6a", "#301515", "circle"),
)

# (key, parent key, level rank, name, completed days ago or None, description)
_GOALS = (
    ("harmony", None, 1, "Understand jazz harmony", None, "Hear and play the changes, not just the melody."),
    ("repertoire", None, 1, "Build a standards repertoire", None, "Ten tunes I can call at any jam."),
    ("technique", None, 1, "Clean, relaxed technique", 12, "Speed comes from relaxation."),
    ("voicings", "harmony", 2, "Drop-2 voicings in every key", None, ""),
    ("ii-v-i", "harmony", 2, "Improvise over ii–V–I", None, "Major and minor, all twelve keys."),
    ("autumn", "repertoire", 2, "Learn Autumn Leaves", 30, ""),
    ("blue-bossa", "repertoire", 2, "Learn Blue Bossa", None, ""),
    ("alternate", "technique", 2, "Alternate picking at 160 bpm", 12, ""),
    ("drop2-c", "voicings", 3, "Drop-2 inversions in C, F and B♭", 5, ""),
    ("drop2-all", "voicings", 3, "Drop-2 inversions in the remaining keys", None, ""),
    ("guide-tones", "ii-v-i", 3, "Guide-tone lines through ii–V–I", None, ""),
    ("bossa-head", "blue-bossa", 3, "Memorise the Blue Bossa head", None, ""),
    ("bossa-solo", "blue-bossa", 3, "Solo one chorus over Blue Bossa", None, ""),
    ("guide-week", "guide-tones", 4, "Guide tones in C this week", 1, ""),
    ("guide-f", "guide-tones", 4, "Guide tones in F", None, ""),
    ("head-a", "bossa-head", 4, "Bars 1–8 from memory", None, ""),
)

_ACTIVITIES = (
    # key, name, has_sets, metrics [(name, unit)]
    ("scales", "Scale practice", True, (("Tempo", "bpm"), ("Reps", "reps"))),
    ("voicing-drill", "Voicing drill", True, (("Keys", "keys"),)),
    ("transcribe", "Transcription", False, (("Bars", "bars"),)),
    ("comping", "Comping with backing track", False, ()),
)

_NOTES = (
    ("root", None, "Big picture: by spring I want to sit in at the Thursday jam without a chart.", 2),
    ("goal", "ii-v-i", "Guide tones finally clicked: 3rd of the ii resolves to the 7th of the V.", 3),
    ("goal", "blue-bossa", "The bridge modulates to D♭: practise that ii–V separately.", 6),
    ("goal", "technique", "Completed. Staying loose in the right wrist mattered more than any metronome trick.", 12),
    ("root", None, "Recorded myself today. Time feel is better than I thought; phrasing is still square.", 9),
    ("goal", "voicings", "Inversions on the middle four strings are the weak spot.", 15),
    ("root", None, "Tried a slower practice day. More focus, less noodling.", 21),
)

_EVENT_TYPES = (
    "session.completed", "session.created", "activity.completed", "goal.created", "goal.updated",
    "goal.completed", "note.created", "program.updated", "activity.associated",
)


def seed_showcase(db, now, config):
    from datetime import datetime, timedelta
    from models import (
        ActivityDefinition, ActivityInstance, ActivitySet, EventLog, Goal, GoalLevel, MetricDefinition,
        MetricValue, Note, Program, ProgramBlock, ProgramDay, ProgramDayOccurrenceSchedule, Session,
        SessionTemplate, User, activity_goal_associations,
    )

    user = User(
        id="sweep-admin", username=SWEEP_USERNAME, email="sweep@example.invalid", role="admin",
        terms_accepted_version=config.TERMS_VERSION, terms_accepted_at=now,
        privacy_accepted_version=config.PRIVACY_VERSION, privacy_accepted_at=now,
    )
    user.set_password(SWEEP_PASSWORD)
    db.add(user)
    db.flush()

    root = SHOWCASE_ROOT_ID
    db.add(Goal(id=root, root_id=root, owner_id=user.id, level_id="browser-ultimate-level",
                name="Play jazz guitar at a jam session", created_at=now - timedelta(days=120),
                started_at=now - timedelta(days=120),
                description="Sit in at a local jam and hold my own on a few standards."))
    db.flush()

    level_ids = {}
    for name, rank, color, secondary, icon in _LEVELS:
        level_ids[rank] = f"sweep-level-{rank}"
        db.add(GoalLevel(id=level_ids[rank], name=name, rank=rank, color=color, secondary_color=secondary,
                         icon=icon, owner_id=user.id, root_id=root))
    db.flush()

    goal_ids = {}
    for order, (key, parent, rank, name, completed_ago, description) in enumerate(_GOALS):
        goal_ids[key] = f"sweep-goal-{key}"
        completed_at = now - timedelta(days=completed_ago) if completed_ago is not None else None
        db.add(Goal(
            id=goal_ids[key], root_id=root, parent_id=goal_ids[parent] if parent else root, owner_id=user.id,
            level_id=level_ids[rank], name=name, description=description, sort_order=order,
            created_at=now - timedelta(days=100 - order * 4), started_at=now - timedelta(days=100 - order * 4),
            deadline=now + timedelta(days=14 * (5 - rank) + order) if completed_at is None else None,
            completed=completed_at is not None, completed_at=completed_at,
            completion_source="manual" if completed_at else None,
        ))
    db.flush()

    activity_ids, metric_ids = {}, {}
    for key, name, has_sets, metrics in _ACTIVITIES:
        activity_ids[key] = f"sweep-activity-{key}"
        db.add(ActivityDefinition(id=activity_ids[key], root_id=root, name=name, has_sets=has_sets,
                                  has_metrics=bool(metrics)))
        db.flush()
        for index, (metric_name, unit) in enumerate(metrics):
            metric_ids[(key, index)] = f"sweep-metric-{key}-{index}"
            db.add(MetricDefinition(id=metric_ids[(key, index)], activity_id=activity_ids[key], root_id=root,
                                    name=metric_name, unit=unit, sort_order=index))
    db.flush()
    for goal_key, activity_key in (("ii-v-i", "scales"), ("voicings", "voicing-drill"), ("repertoire", "transcribe"),
                                   ("blue-bossa", "comping"), ("technique", "scales")):
        db.execute(activity_goal_associations.insert().values(goal_id=goal_ids[goal_key],
                                                              activity_id=activity_ids[activity_key]))

    db.add(SessionTemplate(id="sweep-template", root_id=root, name="Daily practice", template_data={
        "sections": [{"name": "Warm-up", "items": [
            {"type": "activity", "activity_definition_id": activity_ids["scales"], "name": "Scale practice",
             "item_key": "scales"}]},
            {"name": "Repertoire", "items": [
                {"type": "activity", "activity_definition_id": activity_ids["transcribe"], "name": "Transcription",
                 "item_key": "transcribe"},
                {"type": "activity", "activity_definition_id": activity_ids["comping"],
                 "name": "Comping with backing track", "item_key": "comping"}]}],
    }))

    # Fourteen completed sessions over five weeks, each with three activities.
    for index, days_ago in enumerate((1, 2, 4, 5, 7, 9, 11, 13, 16, 19, 22, 26, 30, 34)):
        start = (now - timedelta(days=days_ago)).replace(hour=18, minute=30, second=0, microsecond=0)
        session_id = f"sweep-session-{index}"
        instance_keys = ("scales", "voicing-drill" if index % 2 else "transcribe", "comping")
        instance_ids = [f"sweep-instance-{index}-{key}" for key in instance_keys]
        minutes = 35 + (index * 7) % 30
        db.add(Session(
            id=session_id, root_id=root, owner_id=user.id, name="Daily practice", template_id="sweep-template",
            session_start=start, session_end=start + timedelta(minutes=minutes),
            total_duration_seconds=minutes * 60, completed=True, completed_at=start + timedelta(minutes=minutes),
            attributes={"session_data": {"sections": [{"id": "main", "name": "Practice", "activity_ids": instance_ids}]}},
        ))
        db.flush()
        for position, (activity_key, instance_id) in enumerate(zip(instance_keys, instance_ids)):
            item_start = start + timedelta(minutes=position * 12)
            db.add(ActivityInstance(
                id=instance_id, root_id=root, session_id=session_id, activity_definition_id=activity_ids[activity_key],
                completed=True, created_at=item_start, time_start=item_start,
                time_stop=item_start + timedelta(minutes=11), duration_seconds=660, data={},
            ))
            db.flush()
            if activity_key == "scales":
                for set_index in range(3):
                    set_id = f"{instance_id}-set-{set_index}"
                    db.add(ActivitySet(id=set_id, activity_instance_id=instance_id, sort_order=set_index,
                                       status="completed"))
                    db.flush()
                    db.add(MetricValue(activity_instance_id=instance_id, activity_set_id=set_id,
                                       metric_definition_id=metric_ids[("scales", 0)],
                                       value=120 + (14 - index) * 3 + set_index * 4))
                    db.add(MetricValue(activity_instance_id=instance_id, activity_set_id=set_id,
                                       metric_definition_id=metric_ids[("scales", 1)], value=4 + set_index))
            elif activity_key == "transcribe":
                db.add(MetricValue(activity_instance_id=instance_id, metric_definition_id=metric_ids[("transcribe", 0)],
                                   value=4 + index % 5))

    # One quick session (no template, created complete) for Create Session's recent list.
    quick_start = (now - timedelta(days=3)).replace(hour=7, minute=15, second=0, microsecond=0)
    quick_ids = ["sweep-quick-transcribe", "sweep-quick-comping"]
    db.add(Session(
        id="sweep-quick-session", root_id=root, owner_id=user.id, name="Quick Session",
        session_start=quick_start, completed=True, completed_at=quick_start + timedelta(minutes=20),
        attributes={"session_data": {"session_type": "quick", "activity_ids": quick_ids}},
    ))
    db.flush()
    for instance_id, activity_key in zip(quick_ids, ("transcribe", "comping")):
        db.add(ActivityInstance(id=instance_id, root_id=root, session_id="sweep-quick-session",
                                activity_definition_id=activity_ids[activity_key], completed=True,
                                created_at=quick_start, data={}))
    db.flush()
    db.add(MetricValue(activity_instance_id="sweep-quick-transcribe",
                       metric_definition_id=metric_ids[("transcribe", 0)], value=6))

    today = now.date()
    db.add(Program(id="sweep-program", root_id=root, name="Winter woodshed",
                   start_date=datetime.combine(today - timedelta(days=14), datetime.min.time()),
                   end_date=datetime.combine(today + timedelta(days=42), datetime.max.time()), weekly_schedule={}))
    db.add(ProgramBlock(id="sweep-block-1", program_id="sweep-program", name="Foundations",
                        start_date=today - timedelta(days=14), end_date=today + timedelta(days=13)))
    db.add(ProgramBlock(id="sweep-block-2", program_id="sweep-program", name="Repertoire",
                        start_date=today + timedelta(days=14), end_date=today + timedelta(days=42)))
    db.flush()
    for offset in (-6, -4, -2, 0, 2, 4, 6):
        day_id = f"sweep-day-{offset + 6}"
        db.add(ProgramDay(id=day_id, program_id="sweep-program", name="Practice day", day_number=offset + 7))
        db.add(ProgramDayOccurrenceSchedule(program_day_id=day_id, date=today + timedelta(days=offset)))

    for index, (context, goal_key, content, days_ago) in enumerate(_NOTES):
        context_id = goal_ids[goal_key] if goal_key else root
        db.add(Note(id=f"sweep-note-{index}", root_id=root, context_type=context, context_id=context_id,
                    goal_id=goal_ids[goal_key] if goal_key else None, content=content,
                    created_at=now - timedelta(days=days_ago)))
    db.add(Note(id="sweep-note-session", root_id=root, context_type="session", context_id="sweep-session-0",
                session_id="sweep-session-0", content="Tempo felt easy at 160 today.",
                created_at=now - timedelta(days=1)))

    # Sixty days of uneven event history for the Logs page.
    for day in range(60):
        for index in range((day * 7) % 11 + (4 if day % 7 in (5, 6) else 0)):
            event_type = _EVENT_TYPES[(day + index) % len(_EVENT_TYPES)]
            db.add(EventLog(
                id=f"sweep-event-{day}-{index}", root_id=root, event_type=event_type,
                entity_type=event_type.split(".")[0], entity_id=f"sweep-entity-{index}",
                description=f"{event_type.replace('.', ' ').capitalize()} from the showcase seed",
                source="web", timestamp=now - timedelta(days=day, hours=index),
            ))
