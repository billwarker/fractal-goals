"""
Tests for flexible goal hierarchy (Idea 2).

Validates that:
- Macro goals can skip intermediate levels (e.g. UltimateGoal → ShortTermGoal)
- The ancestor rank sequence must be strictly increasing (monotonicity)
- Execution-tier goals (MicroGoal, NanoGoal) remain strictly enforced
"""
import uuid
import pytest
from sqlalchemy.orm import selectinload

from models import Goal, GoalLevel
from services.goal_service import GoalService, sync_goal_targets


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

LEVEL_DEFS = [
    {"name": "Ultimate Goal",   "rank": 0},
    {"name": "Long Term Goal",  "rank": 1},
    {"name": "Mid Term Goal",   "rank": 2},
    {"name": "Short Term Goal", "rank": 3},
    {"name": "Immediate Goal",  "rank": 4},
    {"name": "Micro Goal",      "rank": 5},
    {"name": "Nano Goal",       "rank": 6},
]


@pytest.fixture
def levels(db_session):
    """Seed system default goal levels for tests."""
    created = {}
    for defn in LEVEL_DEFS:
        existing = db_session.query(GoalLevel).filter_by(
            name=defn["name"], owner_id=None
        ).first()
        if existing:
            created[defn["name"]] = existing
        else:
            level = GoalLevel(
                id=str(uuid.uuid4()),
                name=defn["name"],
                rank=defn["rank"],
                owner_id=None,
                root_id=None,
            )
            db_session.add(level)
            created[defn["name"]] = level
    db_session.commit()
    return created


@pytest.fixture
def ultimate_goal(db_session, test_user, levels):
    """UltimateGoal with level_id set."""
    goal = Goal(
        id=str(uuid.uuid4()),
        name="Master Software Engineering",
        owner_id=test_user.id,
        level_id=levels["Ultimate Goal"].id,
    )
    goal.root_id = goal.id
    db_session.add(goal)
    db_session.commit()
    db_session.refresh(goal)
    return goal


@pytest.fixture
def long_term_goal(db_session, test_user, ultimate_goal, levels):
    """LongTermGoal with level_id set, child of ultimate_goal."""
    goal = Goal(
        id=str(uuid.uuid4()),
        name="Master Backend Development",
        owner_id=test_user.id,
        parent_id=ultimate_goal.id,
        root_id=ultimate_goal.id,
        level_id=levels["Long Term Goal"].id,
    )
    db_session.add(goal)
    db_session.commit()
    db_session.refresh(goal)
    return goal


@pytest.fixture
def service(db_session):
    return GoalService(db_session, sync_targets=sync_goal_targets)


# ---------------------------------------------------------------------------
# Backend unit: _validate_ancestor_rank_monotonicity
# ---------------------------------------------------------------------------

class TestValidateAncestorRankMonotonicity:

    def test_valid_adjacent_path(self, service, levels, ultimate_goal):
        """Long Term under Ultimate is valid (adjacent)."""
        new_level = levels["Long Term Goal"]
        error = service._validate_ancestor_rank_monotonicity(new_level, ultimate_goal)
        assert error is None

    def test_valid_skipped_path(self, service, levels, ultimate_goal):
        """Short Term under Ultimate is valid (skipped levels)."""
        new_level = levels["Short Term Goal"]
        error = service._validate_ancestor_rank_monotonicity(new_level, ultimate_goal)
        assert error is None

    def test_invalid_same_rank_as_parent(self, service, levels, ultimate_goal):
        """Cannot create another UltimateGoal under an UltimateGoal."""
        new_level = levels["Ultimate Goal"]
        error = service._validate_ancestor_rank_monotonicity(new_level, ultimate_goal)
        assert error is not None

    def test_invalid_higher_rank_than_parent(self, service, levels, long_term_goal):
        """Cannot create UltimateGoal under LongTermGoal (rank goes backwards)."""
        new_level = levels["Ultimate Goal"]
        error = service._validate_ancestor_rank_monotonicity(new_level, long_term_goal)
        assert error is not None

    def test_invalid_non_monotonic_path(self, db_session, service, test_user, levels, ultimate_goal):
        """
        Path: Ultimate(0) → Short(3) → Mid(2) must be rejected.
        Short(3) is a valid child of Ultimate(0), but Mid(2) is NOT a valid
        child of Short(3) because rank 2 < rank 3.
        """
        # Create Short Term under Ultimate (valid skip)
        short_term = Goal(
            id=str(uuid.uuid4()),
            name="Short Term Goal",
            owner_id=test_user.id,
            parent_id=ultimate_goal.id,
            root_id=ultimate_goal.id,
            level_id=levels["Short Term Goal"].id,
        )
        db_session.add(short_term)
        db_session.commit()
        db_session.refresh(short_term)

        # Attempt to attach Mid Term under Short Term — invalid (rank 2 < 3)
        mid_level = levels["Mid Term Goal"]
        error = service._validate_ancestor_rank_monotonicity(mid_level, short_term)
        assert error is not None
        assert "Mid" in error or "rank" in error.lower()

    def test_valid_continued_skip_path(self, db_session, service, test_user, levels, ultimate_goal):
        """
        Path: Ultimate(0) → Short(3) → Immediate(4) is valid.
        Each step increases in rank.
        """
        short_term = Goal(
            id=str(uuid.uuid4()),
            name="Short Term Goal",
            owner_id=test_user.id,
            parent_id=ultimate_goal.id,
            root_id=ultimate_goal.id,
            level_id=levels["Short Term Goal"].id,
        )
        db_session.add(short_term)
        db_session.commit()
        db_session.refresh(short_term)

        immediate_level = levels["Immediate Goal"]
        error = service._validate_ancestor_rank_monotonicity(immediate_level, short_term)
        assert error is None

    def test_no_parent_is_valid(self, service, levels):
        """No parent (root goal) has no monotonicity constraint."""
        new_level = levels["Ultimate Goal"]
        error = service._validate_ancestor_rank_monotonicity(new_level, None)
        assert error is None


# ---------------------------------------------------------------------------
# Integration: create_fractal_goal_record with flexible hierarchy
# ---------------------------------------------------------------------------

class TestCreateFractalGoalFlexibleHierarchy:

    def test_skip_levels_is_accepted(self, db_session, service, test_user, ultimate_goal, levels):
        """ShortTermGoal can be created directly under UltimateGoal (skipping Long and Mid)."""
        goal, error, status = service.create_fractal_goal_record(
            root_id=ultimate_goal.id,
            current_user_id=test_user.id,
            data={
                "name": "Short Term Skip Test",
                "type": "ShortTermGoal",
                "parent_id": ultimate_goal.id,
            },
        )
        assert error is None, f"Unexpected error: {error}"
        assert status == 201
        assert goal is not None

    def test_reverse_rank_is_rejected(self, db_session, service, test_user, long_term_goal, levels):
        """UltimateGoal cannot be created under LongTermGoal (rank goes backwards)."""
        goal, error, status = service.create_fractal_goal_record(
            root_id=long_term_goal.root_id,
            current_user_id=test_user.id,
            data={
                "name": "Invalid Upward Goal",
                "type": "UltimateGoal",
                "parent_id": long_term_goal.id,
            },
        )
        assert error is not None
        assert status == 400

    def test_non_monotonic_chain_is_rejected(
        self, db_session, service, test_user, ultimate_goal, levels
    ):
        """
        Creating Mid Term under Short Term which is under Ultimate is rejected.
        Path would be: Ultimate(0) → Short(3) → Mid(2) — non-monotonic.
        """
        # Create Short Term under Ultimate (valid)
        short_term, _, _ = service.create_fractal_goal_record(
            root_id=ultimate_goal.id,
            current_user_id=test_user.id,
            data={
                "name": "Short Term",
                "type": "ShortTermGoal",
                "parent_id": ultimate_goal.id,
            },
        )
        assert short_term is not None

        # Attempt Mid Term under Short Term — should fail
        goal, error, status = service.create_fractal_goal_record(
            root_id=ultimate_goal.id,
            current_user_id=test_user.id,
            data={
                "name": "Mid Term under Short",
                "type": "MidTermGoal",
                "parent_id": short_term.id,
            },
        )
        assert error is not None
        assert status == 400

    def test_execution_tier_bypasses_monotonicity_check(
        self, db_session, service, test_user, ultimate_goal, levels
    ):
        """
        MicroGoal creation bypasses the monotonicity validator — it uses the
        execution-tier validator in validators.py instead.
        The service should not reject a MicroGoal on rank grounds.
        """
        # First create an ImmediateGoal as required parent for MicroGoal
        immediate, _, _ = service.create_fractal_goal_record(
            root_id=ultimate_goal.id,
            current_user_id=test_user.id,
            data={
                "name": "Immediate Goal",
                "type": "ImmediateGoal",
                "parent_id": ultimate_goal.id,
            },
        )
        assert immediate is not None

        micro, error, status = service.create_fractal_goal_record(
            root_id=ultimate_goal.id,
            current_user_id=test_user.id,
            data={
                "name": "Micro Goal",
                "type": "MicroGoal",
                "parent_id": immediate.id,
            },
        )
        assert error is None, f"Unexpected error: {error}"
        assert status == 201
