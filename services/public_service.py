from models import BetaSignupRequest, format_utc


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
        }

    def create_beta_signup_request(self, data):
        email = data["email"].lower()
        request = self.db_session.query(BetaSignupRequest).filter_by(email=email).first()
        created = request is None

        if request is None:
            request = BetaSignupRequest(email=email, source="landing_page")
            self.db_session.add(request)

        request.name = data["name"]
        request.use_case = data["use_case"]
        request.note = data.get("note")
        if request.status == "dismissed":
            request.status = "new"

        self.db_session.commit()
        self.db_session.refresh(request)

        return {
            "request": self.serialize_beta_signup(request),
            "created": created,
        }, None, 201 if created else 200
