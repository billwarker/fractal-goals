from models import AppSetting, BetaSignupRequest, format_utc
from services.landing_publish_service import LANDING_EXAMPLE_CACHE_KEY
from services.ops_log import log_ops_event


class PublicService:
    def __init__(self, db_session):
        self.db_session = db_session

    @staticmethod
    def serialize_beta_signup(request):
        return {
            "id": request.id,
            "name": request.name,
            "email": request.email,
            "use_case": request.use_case,
            "note": request.note,
            "status": request.status,
            "created_at": format_utc(request.created_at),
            "updated_at": format_utc(request.updated_at),
            "invited_at": format_utc(request.invited_at),
            "invite_key_id": request.invite_key_id,
            "last_invite_email_sent_at": format_utc(request.last_invite_email_sent_at),
        }

    def create_beta_signup_request(self, data):
        email = data["email"].lower()
        request = self.db_session.query(BetaSignupRequest).filter_by(email=email).first()
        created = request is None

        if request is None:
            request = BetaSignupRequest(email=email, source="landing_page")
            self.db_session.add(request)

        # Optional fields: only overwrite when the caller actually provides a
        # value, so resubmitting an email-only signup never wipes a previously
        # supplied goal/name. No placeholder backfill — exports show real data.
        if data.get("name"):
            request.name = data["name"]
        if data.get("use_case"):
            request.use_case = data["use_case"]
        if "note" in data:
            request.note = data.get("note")
        if request.status == "dismissed":
            request.status = "new"

        self.db_session.commit()
        self.db_session.refresh(request)

        if created:
            log_ops_event("beta.signup_created", beta_signup_id=request.id, email=request.email)

        return {
            "request": self.serialize_beta_signup(request),
            "created": created,
        }, None, 201 if created else 200

    def get_landing_examples(self):
        setting = self.db_session.get(AppSetting, LANDING_EXAMPLE_CACHE_KEY)
        if setting is None or not isinstance(setting.value, dict):
            return {"published_at": None, "schema_version": None, "examples": []}, None, 200

        return {
            "published_at": setting.value.get("published_at"),
            "schema_version": setting.value.get("schema_version"),
            "examples": setting.value.get("examples") or [],
        }, None, 200
