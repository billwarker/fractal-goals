import datetime as dt
import sys
from types import SimpleNamespace

import pytest

from config import config
from models import (
    AgentEmbeddedConversation,
    AgentEmbeddedMessage,
    AgentEmbeddedRun,
    AgentEmbeddedUsage,
    AgentEmbeddedDailyBudget,
    AppSetting,
    Note,
    utc_now,
)
from services.agent_harness_common import AgentHarnessError
from services.agent_embedded_service import AgentEmbeddedService
from services.feature_flag_service import FEATURE_FLAGS_SETTING_KEY, FeatureFlagService


def _enable_embedded_flags(db_session):
    setting = db_session.get(AppSetting, FEATURE_FLAGS_SETTING_KEY)
    if setting is None:
        setting = AppSetting(key=FEATURE_FLAGS_SETTING_KEY, value={})
        db_session.add(setting)
    setting.value = {
        "ai_agent_connectors": True,
        "ai_agent_writes": True,
        "ai_agent_embedded": True,
        "ai_agent_embedded_openai": True,
        "ai_agent_embedded_anthropic": True,
    }
    db_session.commit()


def _set_spend_controls(monkeypatch, provider):
    monkeypatch.setattr(config, f"AGENT_EMBEDDED_{provider.upper()}_INPUT_USD_PER_MILLION", 1.0)
    monkeypatch.setattr(config, f"AGENT_EMBEDDED_{provider.upper()}_OUTPUT_USD_PER_MILLION", 2.0)


def _provider_item(**values):
    return SimpleNamespace(**values, model_dump=lambda mode: values)


@pytest.mark.unit
def test_embedded_providers_stay_hidden_without_privacy_approval(db_session, monkeypatch):
    monkeypatch.setattr(config, "AGENT_EMBEDDED_PRIVACY_APPROVED", False)

    providers = AgentEmbeddedService(db_session).available_providers()

    assert providers["providers"] == []
    assert "privacy" in providers["billing_notice"].lower()


@pytest.mark.unit
def test_embedded_providers_have_independent_feature_switches(db_session, monkeypatch):
    _enable_embedded_flags(db_session)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_PRIVACY_APPROVED", True)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_OPENAI_API_KEY", "openai-test-key")
    monkeypatch.setattr(config, "AGENT_EMBEDDED_OPENAI_MODEL", "openai-test-model")
    monkeypatch.setattr(config, "AGENT_EMBEDDED_ANTHROPIC_API_KEY", "anthropic-test-key")
    monkeypatch.setattr(config, "AGENT_EMBEDDED_ANTHROPIC_MODEL", "anthropic-test-model")
    _set_spend_controls(monkeypatch, "openai")
    _set_spend_controls(monkeypatch, "anthropic")
    FeatureFlagService(db_session).update_flags({"ai_agent_embedded_anthropic": False})

    providers = AgentEmbeddedService(db_session).available_providers()

    assert providers["providers"] == [{"id": "openai", "model": "openai-test-model"}]


@pytest.mark.unit
def test_disabled_embedded_provider_cannot_start_a_turn(
    db_session, test_user, sample_ultimate_goal, monkeypatch,
):
    _enable_embedded_flags(db_session)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_PRIVACY_APPROVED", True)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_ANTHROPIC_API_KEY", "anthropic-test-key")
    monkeypatch.setattr(config, "AGENT_EMBEDDED_ANTHROPIC_MODEL", "anthropic-test-model")
    FeatureFlagService(db_session).update_flags({"ai_agent_embedded_anthropic": False})

    with pytest.raises(AgentHarnessError, match="provider is disabled"):
        AgentEmbeddedService(db_session).start_turn(
            test_user.id,
            root_id=sample_ultimate_goal.id,
            provider="anthropic",
            message="Draft a training plan.",
        )


@pytest.mark.unit
def test_worker_cancels_queued_turn_when_its_provider_is_disabled(
    db_session, test_user, sample_ultimate_goal, monkeypatch,
):
    _enable_embedded_flags(db_session)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_PRIVACY_APPROVED", True)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_OPENAI_API_KEY", "openai-test-key")
    monkeypatch.setattr(config, "AGENT_EMBEDDED_OPENAI_MODEL", "openai-test-model")
    _set_spend_controls(monkeypatch, "openai")
    service = AgentEmbeddedService(db_session)
    queued = service.start_turn(
        test_user.id,
        root_id=sample_ultimate_goal.id,
        provider="openai",
        message="Draft a training plan.",
    )
    FeatureFlagService(db_session).update_flags({"ai_agent_embedded_openai": False})

    assert service.run_once("worker-provider-disabled") is None
    run = db_session.query(AgentEmbeddedRun).filter_by(id=queued["id"]).one()
    assert run.status == "cancelled"
    assert run.error_code == "provider_disabled"


@pytest.mark.unit
def test_finish_honors_cancellation_requested_during_provider_response(
    db_session, test_user, sample_ultimate_goal,
):
    now = utc_now()
    conversation = AgentEmbeddedConversation(
        user_id=test_user.id,
        root_id=sample_ultimate_goal.id,
        provider="openai",
        model="test-model",
        timezone="UTC",
    )
    db_session.add(conversation)
    db_session.flush()
    run = AgentEmbeddedRun(
        conversation_id=conversation.id,
        user_id=test_user.id,
        root_id=sample_ultimate_goal.id,
        status="running",
        step_budget=4,
        token_budget=2000,
        steps_used=0,
        tokens_used=0,
        checkpoint={},
        lease_owner="worker-test",
        lease_expires_at=now + dt.timedelta(seconds=30),
        cancel_requested_at=now,
        started_at=now,
    )
    db_session.add(run)
    db_session.commit()

    AgentEmbeddedService(db_session)._finish(
        run.id,
        "worker-test",
        0,
        answer="The provider returned a final response.",
    )

    db_session.refresh(run)
    assistant_message = db_session.query(AgentEmbeddedMessage).filter_by(
        conversation_id=conversation.id,
        role="assistant",
    ).one()
    assert run.status == "cancelled"
    assert run.error_code == "cancelled"
    assert assistant_message.content == "This assistant turn was cancelled."


@pytest.mark.unit
def test_openai_worker_reads_context_and_persists_a_final_answer(
    db_session, test_user, sample_ultimate_goal, monkeypatch,
):
    _enable_embedded_flags(db_session)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_PRIVACY_APPROVED", True)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(config, "AGENT_EMBEDDED_OPENAI_MODEL", "test-model")
    _set_spend_controls(monkeypatch, "openai")
    service = AgentEmbeddedService(db_session)
    queued = service.start_turn(
        test_user.id,
        root_id=sample_ultimate_goal.id,
        provider="openai",
        message="Give me a short plan.",
    )

    responses = [
        SimpleNamespace(
            output=[_provider_item(type="function_call", call_id="context-1", name="get_fractal_context", arguments="{}")],
            output_text="",
            usage=SimpleNamespace(input_tokens=10, output_tokens=4),
        ),
        SimpleNamespace(
            output=[_provider_item(type="message")],
            output_text="Start with one small step.",
            usage=SimpleNamespace(input_tokens=8, output_tokens=9),
        ),
    ]

    class FakeResponses:
        def create(self, **kwargs):
            assert kwargs["store"] is False
            assert kwargs["model"] == "test-model"
            return responses.pop(0)

    monkeypatch.setitem(
        sys.modules,
        "openai",
        SimpleNamespace(OpenAI=lambda **_kwargs: SimpleNamespace(responses=FakeResponses())),
    )

    result = service.run_once("worker-openai")

    assert result["id"] == queued["id"]
    assert result["status"] == "succeeded"
    assert result["steps_used"] == 1
    assert result["tokens_used"] == 31
    usage_rows = db_session.query(AgentEmbeddedUsage).filter_by(run_id=queued["id"]).all()
    assert len(usage_rows) == 2
    assert all(row.status == "completed" and row.actual_microdollars is not None for row in usage_rows)
    budgets = db_session.query(AgentEmbeddedDailyBudget).all()
    assert all(row.reserved_microdollars == 0 for row in budgets)
    assert {row.charged_microdollars for row in budgets} == {44}
    assistant_message = db_session.query(AgentEmbeddedMessage).filter_by(
        conversation_id=queued["conversation_id"], role="assistant",
    ).one()
    assert assistant_message.content == "Start with one small step."


@pytest.mark.unit
def test_daily_spend_limit_rejects_provider_call_before_network_request(
    db_session, test_user, sample_ultimate_goal, monkeypatch,
):
    _enable_embedded_flags(db_session)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_PRIVACY_APPROVED", True)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(config, "AGENT_EMBEDDED_OPENAI_MODEL", "test-model")
    _set_spend_controls(monkeypatch, "openai")
    monkeypatch.setattr(config, "AGENT_EMBEDDED_DAILY_USER_BUDGET_USD", 0.00001)
    service = AgentEmbeddedService(db_session)
    queued = service.start_turn(
        test_user.id,
        root_id=sample_ultimate_goal.id,
        provider="openai",
        message="This request must not exceed the daily spend cap.",
    )
    calls = []

    class FakeResponses:
        def create(self, **_kwargs):
            calls.append(True)
            raise AssertionError("provider call must be rejected before network access")

    monkeypatch.setitem(
        sys.modules,
        "openai",
        SimpleNamespace(OpenAI=lambda **_kwargs: SimpleNamespace(responses=FakeResponses())),
    )

    result = service.run_once("worker-budget-limit")

    assert result["id"] == queued["id"]
    assert result["status"] == "failed"
    assert result["error"]["code"] == "daily_spend_limit"
    assert calls == []
    assert db_session.query(AgentEmbeddedUsage).filter_by(run_id=queued["id"]).count() == 0


@pytest.mark.unit
def test_anthropic_worker_saves_a_review_only_proposal(
    db_session, test_user, sample_ultimate_goal, monkeypatch,
):
    _enable_embedded_flags(db_session)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_PRIVACY_APPROVED", True)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(config, "AGENT_EMBEDDED_ANTHROPIC_MODEL", "test-model")
    _set_spend_controls(monkeypatch, "anthropic")
    service = AgentEmbeddedService(db_session)
    queued = service.start_turn(
        test_user.id,
        root_id=sample_ultimate_goal.id,
        provider="anthropic",
        message="Leave a planning note for me to review.",
    )

    responses = [
        SimpleNamespace(
            content=[_provider_item(
                type="tool_use",
                id="proposal-1",
                name="submit_change_proposal",
                input={"operations": [{
                    "operation_id": "note-1",
                    "type": "create_note",
                    "data": {
                        "content": "This note is still waiting for review.",
                        "context_type": "root",
                        "context_id": sample_ultimate_goal.id,
                    },
                }]},
            )],
            usage=SimpleNamespace(input_tokens=20, output_tokens=12),
        ),
        SimpleNamespace(
            content=[_provider_item(type="text", text="I saved a proposal for your review.")],
            usage=SimpleNamespace(input_tokens=10, output_tokens=8),
        ),
    ]

    class FakeMessages:
        def create(self, **kwargs):
            assert kwargs["model"] == "test-model"
            return responses.pop(0)

    monkeypatch.setitem(
        sys.modules,
        "anthropic",
        SimpleNamespace(Anthropic=lambda **_kwargs: SimpleNamespace(messages=FakeMessages())),
    )

    result = service.run_once("worker-anthropic")

    assert result["status"] == "succeeded"
    assert result["steps_used"] == 1
    assert result["proposal_id"]
    assert result["proposal_task_id"]
    assert db_session.query(Note).filter_by(root_id=sample_ultimate_goal.id).count() == 0
    conversation = service.get_conversation(test_user.id, queued["conversation_id"])
    assert conversation["messages"][-1]["content"] == "I saved a proposal for your review."


@pytest.mark.unit
def test_provider_failure_is_sanitized_and_does_not_leak_sdk_error(
    db_session, test_user, sample_ultimate_goal, monkeypatch,
):
    _enable_embedded_flags(db_session)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_PRIVACY_APPROVED", True)
    monkeypatch.setattr(config, "AGENT_EMBEDDED_OPENAI_API_KEY", "secret-key")
    monkeypatch.setattr(config, "AGENT_EMBEDDED_OPENAI_MODEL", "test-model")
    _set_spend_controls(monkeypatch, "openai")
    service = AgentEmbeddedService(db_session)
    queued = service.start_turn(
        test_user.id,
        root_id=sample_ultimate_goal.id,
        provider="openai",
        message="Try a provider request.",
    )

    class FakeProviderError(RuntimeError):
        pass

    class FakeResponses:
        def create(self, **_kwargs):
            raise FakeProviderError("upstream diagnostic contains secret-key")

    monkeypatch.setitem(
        sys.modules,
        "openai",
        SimpleNamespace(
            APIError=FakeProviderError,
            OpenAI=lambda **_kwargs: SimpleNamespace(responses=FakeResponses()),
        ),
    )

    result = service.run_once("worker-failure")

    assert result["status"] == "failed"
    assert result["error"]["code"] == "provider_outcome_unknown"
    assert "secret-key" not in result["error"]["message"]
    usage = db_session.query(AgentEmbeddedUsage).filter_by(run_id=queued["id"]).one()
    assert usage.status == "unknown"
    assert usage.reserved_microdollars > 0
    budget = db_session.query(AgentEmbeddedDailyBudget).filter_by(
        scope_key="deployment", usage_date=usage.usage_date,
    ).one()
    assert budget.reserved_microdollars == usage.reserved_microdollars


@pytest.mark.parametrize("prior_count", [19, 20, 21])
@pytest.mark.unit
def test_provider_history_always_contains_the_latest_full_request(
    db_session, test_user, sample_ultimate_goal, prior_count,
):
    conversation = AgentEmbeddedConversation(
        user_id=test_user.id,
        root_id=sample_ultimate_goal.id,
        provider="openai",
        model="test-model",
    )
    db_session.add(conversation)
    db_session.flush()
    start = utc_now() - dt.timedelta(minutes=prior_count + 1)
    previous = []
    for index in range(prior_count):
        row = AgentEmbeddedMessage(
            conversation_id=conversation.id,
            role="assistant" if index % 2 else "user",
            content=f"prior message {index}",
            created_at=start + dt.timedelta(minutes=index),
        )
        db_session.add(row)
        previous.append(row)
    current = AgentEmbeddedMessage(
        conversation_id=conversation.id,
        role="user",
        content="x" * 4000,
        created_at=start + dt.timedelta(minutes=prior_count),
    )
    db_session.add(current)
    db_session.commit()

    history = AgentEmbeddedService(db_session)._provider_history(
        conversation.id, current.id, token_budget=12000,
    )

    assert history[-1].id == current.id
    assert history[-1].content == "x" * 4000
    assert [row.id for row in history[:-1]] == [row.id for row in previous]


@pytest.mark.unit
def test_conversation_history_pages_through_all_101_messages(
    db_session, test_user, sample_ultimate_goal,
):
    conversation = AgentEmbeddedConversation(
        user_id=test_user.id,
        root_id=sample_ultimate_goal.id,
        provider="openai",
        model="test-model",
    )
    db_session.add(conversation)
    db_session.flush()
    start = utc_now() - dt.timedelta(minutes=101)
    for index in range(101):
        db_session.add(AgentEmbeddedMessage(
            conversation_id=conversation.id,
            role="user" if index % 2 == 0 else "assistant",
            content=f"message {index}",
            created_at=start + dt.timedelta(minutes=index),
        ))
    db_session.commit()
    service = AgentEmbeddedService(db_session)

    latest_page = service.serialize_conversation(conversation, limit=100)
    older_page = service.serialize_conversation(
        conversation, before=latest_page["message_page"]["next_before"], limit=100,
    )

    assert [row["content"] for row in latest_page["messages"]] == [
        f"message {index}" for index in range(1, 101)
    ]
    assert latest_page["message_page"]["has_older"] is True
    assert [row["content"] for row in older_page["messages"]] == ["message 0"]
    assert older_page["message_page"]["has_older"] is False
