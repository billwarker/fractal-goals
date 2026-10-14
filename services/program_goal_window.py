"""Goal eligibility for the program Goals pane and completion denominator.

This mirrors client/utils/programGoalWindow.js: program dates and persisted
completion dates are literal calendar dates, with inclusive boundaries. Missing
completion dates stay visible. This does not change structural evidence scope.
"""

from datetime import date, datetime


def is_goal_in_program_window(goal, start_date: date, end_date: date) -> bool:
    if not goal.completed or not goal.completed_at:
        return True
    completed_at = goal.completed_at
    completed_date = completed_at.date() if isinstance(completed_at, datetime) else completed_at
    return start_date <= completed_date <= end_date
