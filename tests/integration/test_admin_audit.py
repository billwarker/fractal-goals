"""
Admin audit trail.

The Privacy Policy states that access to accounts is limited and logged. These
tests are what make that statement true rather than aspirational.
"""

import json

import pytest

from models import AdminAuditEvent, User
from services.admin_service import AdminService


@pytest.fixture
def admin_user(db_session):
    admin = User(username='auditadmin', email='auditadmin@example.com', role='admin')
    admin.set_password('Password123')
    db_session.add(admin)
    db_session.commit()
    return admin


@pytest.mark.integration
class TestAdminAuditTrail:

    def _audit_rows(self, db_session, action=None):
        query = db_session.query(AdminAuditEvent)
        if action:
            query = query.filter(AdminAuditEvent.action == action)
        return query.all()

    def test_tier_change_records_actor_target_and_change(self, db_session, admin_user, test_user):
        service = AdminService(db_session, actor=admin_user)
        _, error, status = service.update_tier(test_user.id, "paid")
        assert error is None and status == 200

        rows = self._audit_rows(db_session, "tier_changed")
        assert len(rows) == 1
        row = rows[0]
        assert row.actor_user_id == admin_user.id
        assert row.target_user_id == test_user.id
        assert row.target_label == f"user:{test_user.id}"
        # The trail records what changed, not merely that something did.
        assert row.event_metadata["changes"]["membership_tier"]["to"] == "paid"

    def test_temporary_password_generation_is_audited(self, db_session, admin_user, test_user):
        """The de facto account-takeover path must never be silent."""
        service = AdminService(db_session, actor=admin_user)
        payload, error, _ = service.generate_temporary_password(test_user.id)
        assert error is None
        assert payload["temporary_password"]

        rows = self._audit_rows(db_session, "temporary_password_generated")
        assert len(rows) == 1
        assert rows[0].actor_user_id == admin_user.id
        assert rows[0].target_user_id == test_user.id
        # The password itself must never be written to the trail.
        assert payload["temporary_password"] not in json.dumps(rows[0].event_metadata or {})

    def test_suspension_and_reactivation_are_distinct_actions(self, db_session, admin_user, test_user):
        service = AdminService(db_session, actor=admin_user)
        service.update_status(test_user.id, False)
        service.update_status(test_user.id, True)

        assert len(self._audit_rows(db_session, "account_suspended")) == 1
        assert len(self._audit_rows(db_session, "account_reactivated")) == 1

    def test_hard_delete_trail_survives_the_deletion(self, db_session, admin_user, test_user):
        """
        Deleting an account must not erase the evidence that it was deleted.
        The target FK is SET NULL, so target_label carries the identity.
        """
        target_id = test_user.id

        service = AdminService(db_session, actor=admin_user)
        _, error, status = service.hard_delete_user(target_id, admin_user)
        assert error is None and status == 200

        db_session.expire_all()
        assert db_session.query(User).get(target_id) is None

        rows = self._audit_rows(db_session, "user_hard_deleted")
        assert len(rows) == 1
        assert rows[0].actor_user_id == admin_user.id
        assert rows[0].target_user_id is None  # nulled by the delete
        assert rows[0].target_label == f"user:{target_id}"  # opaque correlation preserved
