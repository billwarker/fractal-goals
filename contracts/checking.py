"""Checks responses against the contract as tests make them."""
from pydantic import BaseModel, ValidationError

from blueprints.idempotency import REPLAY_HEADER
from contracts.responses import WRITE_EXTRAS, response_models


def contract_errors(endpoint, body):
    model = response_models().get(endpoint)
    if model is None or not issubclass(model, BaseModel):
        return []
    if isinstance(body, dict):
        body = {key: value for key, value in body.items() if key not in WRITE_EXTRAS}
    try:
        model.model_validate(body)
    except ValidationError as error:
        return [f"{'.'.join(map(str, item['loc']))}: {item['msg']}" for item in error.errors(include_input=False)]
    return []


def install_contract_checks(app):
    def check(response):
        from flask import request
        # A replayed write may answer with its status alone (blueprints/idempotency.py).
        replayed = REPLAY_HEADER in response.headers
        if 200 <= response.status_code < 300 and response.is_json and not replayed:
            errors = contract_errors(request.endpoint, response.get_json())
            assert not errors, f"{request.endpoint} doesn't match contracts/: {errors[:6]}"
        return response
    app.after_request(check)
