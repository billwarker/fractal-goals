"""Mixin for AdminService: the public private-beta signup queue.

Listing, triage status, invitation, and export of beta signup requests.
"""

import logging
import datetime
from urllib.parse import quote
from sqlalchemy import func, or_
from models import BetaSignupRequest, EmailDeliveryEvent, SignupInviteKey, User, utc_now
from services.email_service import EmailSendError, EmailService
from services.email_templates import render_beta_invite_email
from services.ops_log import log_ops_event
from services.serializers import format_utc
from services.service_types import JsonDict, ServiceResult
from config import config
from services._admin_common import as_aware_utc, generate_secret, hash_invite_key

logger = logging.getLogger(__name__)


class _AdminBetaSignupsMixin:
    def _beta_signup_base_query(self, status: str = "", search: str = ""):
        query = self.db_session.query(BetaSignupRequest)
        if status in self.BETA_SIGNUP_STATUSES:
            query = query.filter(BetaSignupRequest.status == status)
        if search:
            term = f"%{search}%"
            query = query.filter(
                or_(
                    BetaSignupRequest.email.ilike(term),
                    BetaSignupRequest.use_case.ilike(term),
                )
            )
        return query

    def list_beta_signups(
        self,
        status: str = "",
        search: str = "",
        limit: int = 50,
        offset: int = 0,
    ) -> ServiceResult[JsonDict]:
        from services.public_service import PublicService

        query = self._beta_signup_base_query(status=status, search=search)
        total = int(query.with_entities(func.count(BetaSignupRequest.id)).scalar() or 0)
        requests = (
            query.order_by(BetaSignupRequest.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

        # Counts are computed across all statuses (ignoring the status filter) so
        # the admin UI can show the full breakdown regardless of the active tab.
        status_counts = {key: 0 for key in self.BETA_SIGNUP_STATUSES}
        for value, count in (
            self.db_session.query(BetaSignupRequest.status, func.count(BetaSignupRequest.id))
            .group_by(BetaSignupRequest.status)
            .all()
        ):
            status_counts[value] = int(count)
        status_counts["total"] = sum(status_counts[key] for key in self.BETA_SIGNUP_STATUSES)

        latest_email_by_signup = {}
        signup_ids = [request.id for request in requests]
        if signup_ids:
            events = (
                self.db_session.query(EmailDeliveryEvent)
                .filter(
                    EmailDeliveryEvent.template_key == "beta_invite",
                    EmailDeliveryEvent.beta_signup_id.in_(signup_ids),
                )
                .order_by(EmailDeliveryEvent.created_at.desc())
                .all()
            )
            for event in events:
                latest_email_by_signup.setdefault(event.beta_signup_id, event)

        serialized_requests = []
        for request in requests:
            payload = PublicService.serialize_beta_signup(request)
            latest_email = latest_email_by_signup.get(request.id)
            payload["invite_email_status"] = latest_email.status if latest_email else None
            payload["invite_email_last_event_type"] = latest_email.last_event_type if latest_email else None
            payload["invite_email_last_event_at"] = format_utc(latest_email.last_event_at) if latest_email else None
            serialized_requests.append(payload)

        return {
            "requests": serialized_requests,
            "total": total,
            "limit": limit,
            "offset": offset,
            "status_counts": status_counts,
        }, None, 200

    def update_beta_signup_status(self, signup_id: str, status: str) -> ServiceResult[JsonDict]:
        from services.public_service import PublicService

        if status not in self.BETA_SIGNUP_STATUSES:
            return None, "Invalid beta signup status", 400
        request = self.db_session.get(BetaSignupRequest, signup_id)
        if request is None:
            return None, "Beta signup request not found", 404
        previous_status = request.status
        request.status = status
        if status == "invited" and request.invited_at is None:
            request.invited_at = utc_now()
        if previous_status != status:
            self._audit(
                "beta_signup_status_changed",
                beta_signup_id=request.id,
                from_status=previous_status,
                to_status=status,
            )
        self.db_session.commit()
        self.db_session.refresh(request)
        if previous_status != status:
            log_ops_event(
                "beta.signup_status_changed",
                beta_signup_id=request.id,
                email=request.email,
                from_status=previous_status,
                to_status=status,
            )
        return {"request": PublicService.serialize_beta_signup(request)}, None, 200

    def send_beta_signup_invite(self, signup_id: str, current_user: User) -> ServiceResult[JsonDict]:
        from services.public_service import PublicService

        request = self.db_session.get(BetaSignupRequest, signup_id)
        if request is None:
            return None, "Beta signup request not found", 404

        now = utc_now()
        last_sent_at = as_aware_utc(request.last_invite_email_sent_at)
        cooldown_until = (
            last_sent_at + datetime.timedelta(minutes=config.BETA_INVITE_EMAIL_COOLDOWN_MINUTES)
            if last_sent_at else None
        )
        if cooldown_until and cooldown_until > now:
            logger.info("Beta invite email cooldown active beta_signup_id=%s", request.id)
            return None, "Beta invite email was sent recently. Please wait before resending.", 429

        previous_invite = self.db_session.get(SignupInviteKey, request.invite_key_id) if request.invite_key_id else None
        if previous_invite and not previous_invite.used_at and not previous_invite.revoked_at:
            previous_invite.revoked_at = now

        raw_key = generate_secret("fg_invite")
        invite = SignupInviteKey(
            key_hash=hash_invite_key(raw_key),
            label=f"Beta invite for {request.email}",
            assigned_email=request.email,
            created_by_user_id=current_user.id,
        )
        self.db_session.add(invite)
        self.db_session.flush()

        signup_url = f"{config.APP_BASE_URL.rstrip('/')}/?invite_key={quote(raw_key)}&email={quote(request.email)}"
        rendered = render_beta_invite_email(signup_url, request.use_case, invite_key=raw_key)
        try:
            EmailService(self.db_session).send_email(
                to=request.email,
                subject=rendered["subject"],
                html=rendered["html"],
                text=rendered["text"],
                template_key="beta_invite",
                entity_type="beta_signup_request",
                entity_id=request.id,
                beta_signup_id=request.id,
                idempotency_key=f"beta-invite:{request.id}:{invite.id}",
            )
        except EmailSendError as exc:
            self.db_session.rollback()
            self.db_session.add(EmailDeliveryEvent(
                provider=config.EMAIL_PROVIDER or 'disabled',
                template_key="beta_invite",
                entity_type="beta_signup_request",
                entity_id=request.id,
                beta_signup_id=request.id,
                status="failed",
                error_summary=str(exc)[:500],
            ))
            self.db_session.commit()
            logger.error("Beta invite email failed beta_signup_id=%s", request.id)
            log_ops_event(
                "email.invite_failed",
                level="error",
                beta_signup_id=request.id,
                email=request.email,
            )
            return None, "Failed to send beta invite email", 502

        request.status = "invited"
        request.invited_at = request.invited_at or now
        request.invite_key_id = invite.id
        request.last_invite_email_sent_at = now
        self._audit("beta_invite_sent", beta_signup_id=request.id, invite_id=invite.id)
        self.db_session.commit()
        self.db_session.refresh(request)
        log_ops_event(
            "email.invite_sent",
            beta_signup_id=request.id,
            email=request.email,
        )
        return {"request": PublicService.serialize_beta_signup(request)}, None, 200

    def iter_beta_signups_for_export(self, status: str = "", search: str = ""):
        """Yield beta signup rows oldest-first for CSV export."""
        query = self._beta_signup_base_query(status=status, search=search)
        yield from query.order_by(BetaSignupRequest.created_at.asc()).all()
