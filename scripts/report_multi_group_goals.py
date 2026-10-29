#!/usr/bin/env python3
"""List goals that link more than one live activity group (read-only).

Migration a7c9e1b3d5f7 makes one live group per goal a database invariant and refuses to run
while any goal holds several. Run this first, keep one group on each listed goal (Goal details →
Activities), then apply the migration. Prints Markdown, or JSON with --json. Exits 1 when
conflicts exist so it can gate a deploy.
"""

import argparse
import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import sqlalchemy as sa  # noqa: E402

import models  # noqa: E402

QUERY = sa.text("""
    SELECT g.root_id, g.id AS goal_id, g.name AS goal_name,
           ag.id AS group_id, ag.name AS group_name, link.created_at
    FROM goal_activity_group_associations link
    JOIN goals g ON g.id = link.goal_id
    JOIN activity_groups ag ON ag.id = link.activity_group_id
    WHERE link.deleted_at IS NULL
      AND link.goal_id IN (
          SELECT goal_id FROM goal_activity_group_associations
          WHERE deleted_at IS NULL GROUP BY goal_id HAVING count(*) > 1
      )
    ORDER BY g.root_id, g.id, link.created_at, ag.id
""")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--json', action='store_true', help='print JSON instead of Markdown')
    args = parser.parse_args()

    with models.get_engine().connect() as connection:
        rows = [dict(row._mapping) for row in connection.execute(QUERY)]

    goals = {}
    for row in rows:
        goal = goals.setdefault(row['goal_id'], {
            'root_id': row['root_id'], 'goal_id': row['goal_id'], 'goal_name': row['goal_name'], 'groups': [],
        })
        goal['groups'].append({
            'id': row['group_id'], 'name': row['group_name'], 'linked_at': row['created_at'],
        })

    if args.json:
        print(json.dumps(list(goals.values()), indent=2, default=str))
    elif not goals:
        print('No goal links more than one activity group.')
    else:
        print(f'# Goals with several activity groups ({len(goals)})\n')
        for goal in goals.values():
            print(f"- **{goal['goal_name']}** (`{goal['goal_id']}`, fractal `{goal['root_id']}`)")
            for group in goal['groups']:
                print(f"  - {group['name']} (`{group['id']}`), linked {group['linked_at']}")
    return 1 if goals else 0


if __name__ == '__main__':
    raise SystemExit(main())
