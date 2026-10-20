#!/usr/bin/env python3
"""Preview or verify the target → completion-condition conversion (migration e1a2c3d4f5b6).

  --dry-run (default)  Plan the conversion against the current database without writing, and
                       print a per-fractal Markdown report (or JSON with --json).
  --verify             After migration A: re-evaluate every activity-threshold condition and list
                       goals whose stored completion no longer matches their evidence.

Point DATABASE_URL at a restored backup copy, never at production, when previewing. After
migration B (a4b5c6d7e8f9) drops the target tables, --dry-run has nothing left to read; restore a
pre-B backup to preview again. --verify still works.
"""

import argparse
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import models  # noqa: E402
from services.target_condition_conversion import (  # noqa: E402
    load_conversion_inputs,
    plan_conversion,
    render_report_markdown,
)


def dry_run(as_json: bool) -> int:
    engine = models.get_engine()
    with engine.connect() as connection:
        inputs = load_conversion_inputs(connection)
    if inputs is None:
        print('No targets table (retired by migration B): nothing to convert.')
        return 0
    goals, targets, metric_conditions, child_sort_start = inputs
    plan = plan_conversion(goals, targets, metric_conditions, child_sort_start=child_sort_start)
    if as_json:
        print(json.dumps({'summary': plan.summary(), 'goals': plan.report}, indent=2, default=str))
    else:
        print(render_report_markdown(plan))
    return 0


def verify() -> int:
    from models import Goal, get_session
    from services.goal_condition_service import evaluate_goal_condition
    from services.goal_loading import load_fractal_goals_for_serialization

    session = get_session(models.get_engine())
    drift = []
    try:
        root_ids = [row[0] for row in session.query(Goal.id).filter(Goal.parent_id.is_(None), Goal.deleted_at.is_(None))]
        for root_id in root_ids:
            goals_by_id = load_fractal_goals_for_serialization(session, root_id)
            for goal in goals_by_id.values():
                evaluation = evaluate_goal_condition(session, goal, goals_by_id)
                if evaluation is None or goal.paused:
                    continue
                if evaluation.met != bool(goal.completed) and goal.completion_source in (None, 'condition'):
                    drift.append({
                        'root_id': root_id, 'goal_id': goal.id, 'goal_name': goal.name,
                        'stored_completed': bool(goal.completed), 'condition_met': evaluation.met,
                        'progress': round(evaluation.progress, 4),
                    })
    finally:
        session.close()
    print(json.dumps({'goals_with_drift': len(drift), 'drift': drift}, indent=2))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--dry-run', action='store_true', help='Plan without writing (default).')
    mode.add_argument('--verify', action='store_true', help='Report completion drift after migration A.')
    parser.add_argument('--json', action='store_true', help='Emit the dry-run report as JSON.')
    args = parser.parse_args()
    raise SystemExit(verify() if args.verify else dry_run(args.json))


if __name__ == '__main__':
    main()
