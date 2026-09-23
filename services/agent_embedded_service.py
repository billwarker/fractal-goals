"""Bounded, app-funded conversational agent using the reviewed harness."""

import datetime as dt
import logging
import math
from decimal import Decimal, ROUND_CEILING
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import sqlalchemy as sa

from config import config
from models import (
    AgentEmbeddedConversation,
    AgentEmbeddedMessage,
    AgentEmbeddedRun,
    AgentEmbeddedDailyBudget,
    AgentEmbeddedUsage,
    AgentProposal,
    User,
    utc_now,
)
from services.agent_harness_common import AgentHarnessError, _aware, _canonical_json
from services.agent_embedded_execution import (
    AgentEmbeddedExecutionMixin, PROVIDER_FEATURE_FLAGS, PROVIDER_TIMEOUT_SECONDS,
)
from services.agent_harness_service import AgentHarnessService
from services.feature_flag_service import FeatureFlagService


logger = logging.getLogger(__name__)
MAX_MESSAGE_LENGTH = 4000
CONVERSATION_PAGE_SIZE = 50
MAX_HISTORY_INPUT_TOKENS = 8_000


class AgentEmbeddedService(AgentEmbeddedExecutionMixin):
    def __init__(self, db_session):
        self.db_session = db_session

    @staticmethod
    def _provider_settings(provider):
        if provider == "openai":
            return config.AGENT_EMBEDDED_OPENAI_API_KEY, config.AGENT_EMBEDDED_OPENAI_MODEL
        if provider == "anthropic":
            return config.AGENT_EMBEDDED_ANTHROPIC_API_KEY, config.AGENT_EMBEDDED_ANTHROPIC_MODEL
        raise AgentHarnessError("Choose a supported AI provider", 400, "invalid_provider")

    @staticmethod
    def _provider_rates(provider):
        if provider == "openai":
            return (
                config.AGENT_EMBEDDED_OPENAI_INPUT_USD_PER_MILLION,
                config.AGENT_EMBEDDED_OPENAI_OUTPUT_USD_PER_MILLION,
            )
        if provider == "anthropic":
            return (
                config.AGENT_EMBEDDED_ANTHROPIC_INPUT_USD_PER_MILLION,
                config.AGENT_EMBEDDED_ANTHROPIC_OUTPUT_USD_PER_MILLION,
            )
        return (0, 0)

    @classmethod
    def _cost_controls_configured(cls, provider):
        input_rate, output_rate = cls._provider_rates(provider)
        return bool(
            input_rate > 0
            and output_rate > 0
            and config.AGENT_EMBEDDED_DAILY_USER_BUDGET_USD > 0
            and config.AGENT_EMBEDDED_DAILY_DEPLOYMENT_BUDGET_USD > 0
        )

    @classmethod
    def _require_cost_controls(cls, provider):
        if not cls._cost_controls_configured(provider):
            raise AgentHarnessError(
                "This provider is unavailable until model pricing and daily spend limits are configured",
                503,
                "spend_controls_unavailable",
            )

    def available_providers(self):
        available = []
        if not config.AGENT_EMBEDDED_PRIVACY_APPROVED:
            return {
                "providers": [],
                "billing_notice": "Embedded providers are unavailable until deployment privacy and provider terms are approved.",
            }
        payload, error, _ = FeatureFlagService(self.db_session).get_flags()
        flags = payload.get("flags", {}) if not error and payload else {}
        if not flags.get("ai_agent_embedded", False):
            return {
                "providers": [],
                "billing_notice": "The embedded assistant is disabled for this deployment.",
            }
        for provider in ("openai", "anthropic"):
            api_key, model = self._provider_settings(provider)
            if flags.get(PROVIDER_FEATURE_FLAGS[provider]) and api_key and model and self._cost_controls_configured(provider):
                available.append({"id": provider, "model": model})
        return {
            "providers": available,
            "max_message_characters": MAX_MESSAGE_LENGTH,
            "max_tool_steps": config.AGENT_EMBEDDED_MAX_STEPS,
            "max_tokens": config.AGENT_EMBEDDED_MAX_TOKENS,
            "max_seconds": config.AGENT_EMBEDDED_MAX_SECONDS,
            "billing_notice": (
                "Messages sent to the embedded assistant use Fractal Goals’ API account and daily spend limits. "
                "Your ChatGPT or Claude subscription is used only when you connect Fractal from that provider’s app."
            ),
            "spend_controls_notice": (
                "Embedded providers with missing model pricing or daily limits are hidden until an administrator configures them."
            ),
        }

    def _require_enabled(self, provider=None):
        if not config.AGENT_EMBEDDED_PRIVACY_APPROVED:
            raise AgentHarnessError("Embedded providers are awaiting deployment privacy approval", 404, "feature_disabled")
        payload, error, _ = FeatureFlagService(self.db_session).get_flags()
        flags = payload.get("flags", {}) if not error and payload else {}
        if not flags.get("ai_agent_embedded"):
            raise AgentHarnessError("The embedded assistant is not enabled", 404, "feature_disabled")
        if provider is not None:
            feature_flag = PROVIDER_FEATURE_FLAGS.get(provider)
            if feature_flag is None:
                raise AgentHarnessError("Choose a supported AI provider", 400, "invalid_provider")
            if not flags.get(feature_flag):
                raise AgentHarnessError("This embedded AI provider is disabled", 404, "feature_disabled")

    def _require_root(self, root_id, user_id):
        AgentHarnessService(self.db_session)._root(root_id, user_id)

    def start_turn(self, user_id, *, root_id, provider, message, timezone="UTC", conversation_id=None):
        self._require_enabled(provider=provider)
        self._require_root(root_id, user_id)
        content = str(message or "").strip()
        if not content or len(content) > MAX_MESSAGE_LENGTH:
            raise AgentHarnessError(
                f"Message must contain 1 to {MAX_MESSAGE_LENGTH} characters",
                400,
                "invalid_message",
            )
        api_key, configured_model = self._provider_settings(provider)
        if not api_key or not configured_model:
            raise AgentHarnessError("This provider is not configured for embedded use", 503, "provider_unavailable")
        self._require_cost_controls(provider)
        try:
            timezone = str(timezone or "UTC")
            ZoneInfo(timezone)
        except (ValueError, ZoneInfoNotFoundError) as error:
            raise AgentHarnessError("timezone must be a valid IANA timezone", 400, "invalid_timezone") from error

        self.db_session.query(User.id).filter_by(id=user_id).with_for_update().first()
        active_run = self.db_session.query(AgentEmbeddedRun).filter(
            AgentEmbeddedRun.user_id == user_id,
            AgentEmbeddedRun.status.in_(("queued", "running")),
        ).first()
        if active_run:
            raise AgentHarnessError("Wait for the current assistant turn to finish", 409, "run_in_progress")

        if conversation_id:
            conversation = self.db_session.query(AgentEmbeddedConversation).filter_by(
                id=conversation_id,
                user_id=user_id,
                root_id=root_id,
            ).with_for_update().first()
            if not conversation:
                raise AgentHarnessError("Conversation not found", 404, "not_found")
            if conversation.provider != provider or conversation.model != configured_model:
                raise AgentHarnessError("Conversation provider settings have changed", 409, "provider_changed")
        else:
            conversation = AgentEmbeddedConversation(
                user_id=user_id,
                root_id=root_id,
                provider=provider,
                model=configured_model,
                timezone=timezone,
            )
            self.db_session.add(conversation)
            self.db_session.flush()

        user_message = AgentEmbeddedMessage(
            conversation_id=conversation.id,
            role="user",
            content=content,
        )
        self.db_session.add(user_message)
        self.db_session.flush()
        run = AgentEmbeddedRun(
            conversation_id=conversation.id,
            user_id=user_id,
            root_id=root_id,
            status="queued",
            step_budget=config.AGENT_EMBEDDED_MAX_STEPS,
            token_budget=config.AGENT_EMBEDDED_MAX_TOKENS,
            steps_used=0,
            tokens_used=0,
            checkpoint={"user_message_id": user_message.id},
        )
        self.db_session.add(run)
        conversation.updated_at = utc_now()
        self.db_session.commit()
        return self.serialize_run(run)

    def list_conversations(self, user_id, root_id):
        self._require_enabled()
        self._require_root(root_id, user_id)
        rows = self.db_session.query(AgentEmbeddedConversation).filter_by(
            user_id=user_id, root_id=root_id,
        ).order_by(AgentEmbeddedConversation.updated_at.desc()).limit(50).all()
        return {"items": [self.serialize_conversation(row, include_messages=False) for row in rows]}

    def get_conversation(self, user_id, conversation_id, *, before=None, limit=CONVERSATION_PAGE_SIZE):
        self._require_enabled()
        conversation = self.db_session.query(AgentEmbeddedConversation).filter_by(
            id=conversation_id, user_id=user_id,
        ).first()
        if not conversation:
            raise AgentHarnessError("Conversation not found", 404, "not_found")
        return self.serialize_conversation(conversation, before=before, limit=limit)

    def _provider_history(self, conversation_id, current_message_id, token_budget):
        """Return recent chronological history while always preserving the full current request."""
        current = self.db_session.query(AgentEmbeddedMessage).filter_by(
            id=current_message_id,
            conversation_id=conversation_id,
            role="user",
        ).one()
        previous = self.db_session.query(AgentEmbeddedMessage).filter(
            AgentEmbeddedMessage.conversation_id == conversation_id,
            AgentEmbeddedMessage.id != current_message_id,
        ).order_by(
            AgentEmbeddedMessage.created_at.desc(), AgentEmbeddedMessage.id.desc(),
        ).limit(100).all()
        selected = []
        used_tokens = self._estimated_message_tokens(current.content)
        history_limit = min(MAX_HISTORY_INPUT_TOKENS, max(512, int(token_budget * 0.6)))
        for row in previous:
            estimate = self._estimated_message_tokens(row.content)
            if used_tokens + estimate > history_limit:
                break
            selected.append(row)
            used_tokens += estimate
        selected.reverse()
        return selected + [current]

    @staticmethod
    def _estimated_message_tokens(content):
        # Provider tokenizers differ. Four UTF-8 bytes per token is a deliberately
        # conservative admission estimate for the bounded plain-text history.
        return (len(str(content).encode("utf-8")) + 3) // 4 + 8

    @staticmethod
    def _estimated_request_tokens(payload):
        return (len(_canonical_json(payload).encode("utf-8")) + 3) // 4 + 32

    @staticmethod
    def _cost_microdollars(input_tokens, output_tokens, provider):
        input_rate, output_rate = AgentEmbeddedService._provider_rates(provider)
        cost = (
            Decimal(str(input_rate)) * max(0, int(input_tokens))
            + Decimal(str(output_rate)) * max(0, int(output_tokens))
        )
        return int(cost.to_integral_value(rounding=ROUND_CEILING))

    def _ensure_daily_budgets(self, scope_keys, usage_date):
        values = [
            {
                "scope_key": key,
                "usage_date": usage_date,
                "reserved_microdollars": 0,
                "charged_microdollars": 0,
                "updated_at": utc_now(),
            }
            for key in sorted(scope_keys)
        ]
        dialect = self.db_session.get_bind().dialect.name
        table = AgentEmbeddedDailyBudget.__table__
        if dialect == "postgresql":
            from sqlalchemy.dialects.postgresql import insert as dialect_insert
        elif dialect == "sqlite":
            from sqlalchemy.dialects.sqlite import insert as dialect_insert
        else:
            raise AgentHarnessError("Embedded spend limits require PostgreSQL", 503, "spend_store_unavailable")
        self.db_session.execute(
            dialect_insert(table).values(values).on_conflict_do_nothing(
                index_elements=["scope_key", "usage_date"],
            )
        )
        budgets = self.db_session.query(AgentEmbeddedDailyBudget).filter(
            AgentEmbeddedDailyBudget.scope_key.in_(scope_keys),
            AgentEmbeddedDailyBudget.usage_date == usage_date,
        ).order_by(AgentEmbeddedDailyBudget.scope_key).with_for_update().all()
        if len(budgets) != len(scope_keys):
            raise AgentHarnessError("Could not reserve the provider spend budget", 503, "spend_store_unavailable")
        return {row.scope_key: row for row in budgets}

    def _reserve_provider_call(
        self, run_id, worker_id, fencing_token, *, provider, model,
        estimated_input_tokens, requested_output_tokens,
    ):
        self._require_cost_controls(provider)
        now = utc_now()
        run = self.db_session.query(AgentEmbeddedRun).filter_by(
            id=run_id, lease_owner=worker_id, fencing_token=fencing_token, status="running",
        ).with_for_update().first()
        if not run or not run.lease_expires_at or _aware(run.lease_expires_at) <= now:
            self.db_session.rollback()
            raise AgentHarnessError("Assistant run lease was lost", 409, "lease_lost")
        if run.cancel_requested_at:
            self.db_session.rollback()
            raise AgentHarnessError("Assistant run was cancelled", 409, "cancelled")
        if run.started_at and (now - _aware(run.started_at)).total_seconds() >= config.AGENT_EMBEDDED_MAX_SECONDS:
            self.db_session.rollback()
            raise AgentHarnessError("This turn reached its time limit", 409, "time_budget_exceeded")

        input_tokens = max(1, int(estimated_input_tokens))
        # Reservations must consume the turn budget before the provider call,
        # including calls whose outcome is still unknown after a worker crash.
        # Otherwise a read → tool → proposal turn can admit a second request
        # after the first request has already consumed the entire budget.
        reserved_tokens = self.db_session.query(AgentEmbeddedUsage).filter(
            AgentEmbeddedUsage.run_id == run.id,
            AgentEmbeddedUsage.status.in_(("reserved", "unknown")),
        ).with_entities(
            sa.func.coalesce(sa.func.sum(
                AgentEmbeddedUsage.estimated_input_tokens + AgentEmbeddedUsage.reserved_output_tokens
            ), 0)
        ).scalar() or 0
        # Reserve a tokenizer safety margin plus fixed framing overhead. A
        # request with unknown outcome keeps this full reservation until reviewed.
        reserved_input_tokens = (input_tokens * 5 + 3) // 4 + 128
        remaining = run.token_budget - run.tokens_used - int(reserved_tokens)
        output_tokens = min(max(1, int(requested_output_tokens)), remaining - reserved_input_tokens)
        if remaining <= reserved_input_tokens or output_tokens <= 0:
            self.db_session.rollback()
            raise AgentHarnessError("This turn reached its usage limit", 409, "budget_exceeded")
        reserved_cost = self._cost_microdollars(reserved_input_tokens, output_tokens, provider)
        usage_date = now.date()
        scopes = ("deployment", f"user:{run.user_id}")
        budgets = self._ensure_daily_budgets(scopes, usage_date)
        caps = {
            "deployment": int((Decimal(str(config.AGENT_EMBEDDED_DAILY_DEPLOYMENT_BUDGET_USD)) * 1_000_000)
                              .to_integral_value(rounding=ROUND_CEILING)),
            f"user:{run.user_id}": int((Decimal(str(config.AGENT_EMBEDDED_DAILY_USER_BUDGET_USD)) * 1_000_000)
                                         .to_integral_value(rounding=ROUND_CEILING)),
        }
        for scope_key, budget in budgets.items():
            if budget.charged_microdollars + budget.reserved_microdollars + reserved_cost > caps[scope_key]:
                self.db_session.rollback()
                raise AgentHarnessError(
                    "The configured daily provider spend limit has been reached",
                    429,
                    "daily_spend_limit",
                )
        for budget in budgets.values():
            budget.reserved_microdollars += reserved_cost
        run.provider_call_sequence += 1
        usage = AgentEmbeddedUsage(
            run_id=run.id,
            user_id=run.user_id,
            usage_date=usage_date,
            call_number=run.provider_call_sequence,
            fencing_token=fencing_token,
            provider=provider,
            model=model,
            status="reserved",
            estimated_input_tokens=reserved_input_tokens,
            reserved_output_tokens=output_tokens,
            reserved_microdollars=reserved_cost,
        )
        self.db_session.add(usage)
        self.db_session.commit()
        return {
            "call_number": usage.call_number,
            "max_output_tokens": output_tokens,
        }

    def _record_provider_response(
        self, run_id, worker_id, fencing_token, call_number, response_payload,
    ):
        now = utc_now()
        run = self.db_session.query(AgentEmbeddedRun).filter_by(
            id=run_id, lease_owner=worker_id, fencing_token=fencing_token, status="running",
        ).with_for_update().first()
        if not run or not run.lease_expires_at or _aware(run.lease_expires_at) <= now:
            self.db_session.rollback()
            raise AgentHarnessError("Assistant run lease was lost", 409, "lease_lost")
        usage = self.db_session.query(AgentEmbeddedUsage).filter_by(
            run_id=run_id,
            call_number=call_number,
            fencing_token=fencing_token,
        ).with_for_update().first()
        if not usage or usage.status != "reserved":
            self.db_session.rollback()
            raise AgentHarnessError("Provider call reservation could not be reconciled", 409, "usage_ledger_conflict")
        scopes = ("deployment", f"user:{run.user_id}")
        budgets = self.db_session.query(AgentEmbeddedDailyBudget).filter(
            AgentEmbeddedDailyBudget.scope_key.in_(scopes),
            AgentEmbeddedDailyBudget.usage_date == usage.usage_date,
        ).order_by(AgentEmbeddedDailyBudget.scope_key).with_for_update().all()
        if len(budgets) != 2:
            self.db_session.rollback()
            raise AgentHarnessError("Provider spend ledger is unavailable", 503, "spend_store_unavailable")
        input_tokens = response_payload.get("input_tokens")
        output_tokens = response_payload.get("output_tokens")
        input_tokens = usage.estimated_input_tokens if input_tokens is None else max(0, int(input_tokens))
        output_tokens = usage.reserved_output_tokens if output_tokens is None else max(0, int(output_tokens))
        actual_cost = self._cost_microdollars(input_tokens, output_tokens, usage.provider)
        for budget in budgets:
            if budget.reserved_microdollars < usage.reserved_microdollars:
                self.db_session.rollback()
                raise AgentHarnessError("Provider spend ledger is inconsistent", 503, "usage_ledger_conflict")
            budget.reserved_microdollars -= usage.reserved_microdollars
            budget.charged_microdollars += actual_cost
        usage.status = "completed"
        usage.actual_input_tokens = input_tokens
        usage.actual_output_tokens = output_tokens
        usage.actual_microdollars = actual_cost
        usage.completed_at = now
        run.tokens_used += input_tokens + output_tokens
        cancelled = run.cancel_requested_at is not None
        if not cancelled:
            run.checkpoint = {
                **(run.checkpoint or {}),
                "provider_response": response_payload,
            }
        self.db_session.commit()
        return run, cancelled

    def _mark_provider_call_ambiguous(self, run_id, worker_id, fencing_token, call_number):
        run = self.db_session.query(AgentEmbeddedRun).filter_by(
            id=run_id, lease_owner=worker_id, fencing_token=fencing_token, status="running",
        ).with_for_update().first()
        usage = self.db_session.query(AgentEmbeddedUsage).filter_by(
            run_id=run_id, call_number=call_number, fencing_token=fencing_token,
        ).with_for_update().first()
        if run and usage and usage.status == "reserved":
            usage.status = "unknown"
            self.db_session.commit()
        else:
            self.db_session.rollback()

    def _reject_unresolved_provider_call(self, run_id):
        usage = self.db_session.query(AgentEmbeddedUsage).filter(
            AgentEmbeddedUsage.run_id == run_id,
            AgentEmbeddedUsage.status.in_(("reserved", "unknown")),
        ).order_by(AgentEmbeddedUsage.call_number.desc()).first()
        if usage:
            if usage.status == "reserved":
                usage.status = "unknown"
                self.db_session.commit()
            raise AgentHarnessError(
                "The prior provider request has an unknown outcome; it was not retried. Review usage before starting another turn.",
                409,
                "provider_outcome_unknown",
            )

    def get_run(self, user_id, run_id):
        self._require_enabled()
        run = self.db_session.query(AgentEmbeddedRun).filter_by(
            id=run_id, user_id=user_id,
        ).first()
        if not run:
            raise AgentHarnessError("Assistant run not found", 404, "not_found")
        return self.serialize_run(run)

    def cancel(self, user_id, run_id):
        self._require_enabled()
        run = self.db_session.query(AgentEmbeddedRun).filter_by(
            id=run_id, user_id=user_id,
        ).with_for_update().first()
        if not run:
            raise AgentHarnessError("Assistant run not found", 404, "not_found")
        if run.status in {"succeeded", "failed", "cancelled"}:
            return self.serialize_run(run)
        run.cancel_requested_at = utc_now()
        if run.status == "queued":
            run.status = "cancelled"
            run.finished_at = utc_now()
        self.db_session.commit()
        return self.serialize_run(run)

    def serialize_run(self, run):
        proposal = self.db_session.query(AgentProposal).filter_by(id=run.proposal_id).first() if run.proposal_id else None
        return {
            "id": run.id,
            "conversation_id": run.conversation_id,
            "root_id": run.root_id,
            "status": run.status,
            "steps_used": run.steps_used,
            "step_budget": run.step_budget,
            "tokens_used": run.tokens_used,
            "token_budget": run.token_budget,
            "proposal_id": run.proposal_id,
            "proposal_task_id": proposal.task_id if proposal else None,
            "proposal": AgentHarnessService(self.db_session).serialize_proposal(proposal) if proposal else None,
            "error": {"code": run.error_code, "message": run.error_message} if run.error_code else None,
            "created_at": run.created_at.isoformat() if run.created_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        }

    def serialize_conversation(
        self, conversation, *, include_messages=True, before=None,
        limit=CONVERSATION_PAGE_SIZE,
    ):
        payload = {
            "id": conversation.id,
            "root_id": conversation.root_id,
            "provider": conversation.provider,
            "model": conversation.model,
            "timezone": conversation.timezone,
            "updated_at": conversation.updated_at.isoformat() if conversation.updated_at else None,
        }
        if include_messages:
            page_size = min(100, max(1, int(limit or CONVERSATION_PAGE_SIZE)))
            query = self.db_session.query(AgentEmbeddedMessage).filter_by(
                conversation_id=conversation.id,
            )
            if before:
                cursor = self.db_session.query(AgentEmbeddedMessage).filter_by(
                    id=before, conversation_id=conversation.id,
                ).first()
                if not cursor:
                    raise AgentHarnessError("Conversation message cursor was not found", 404, "not_found")
                query = query.filter(
                    (AgentEmbeddedMessage.created_at < cursor.created_at)
                    | ((AgentEmbeddedMessage.created_at == cursor.created_at)
                       & (AgentEmbeddedMessage.id < cursor.id))
                )
            rows = query.order_by(
                AgentEmbeddedMessage.created_at.desc(), AgentEmbeddedMessage.id.desc(),
            ).limit(page_size + 1).all()
            has_older = len(rows) > page_size
            rows = list(reversed(rows[:page_size]))
            payload["messages"] = [
                {"id": row.id, "role": row.role, "content": row.content,
                 "created_at": row.created_at.isoformat() if row.created_at else None}
                for row in rows
            ]
            payload["message_page"] = {
                "has_older": has_older,
                "next_before": rows[0].id if has_older and rows else None,
            }
            payload["runs"] = [
                self.serialize_run(row) for row in self.db_session.query(AgentEmbeddedRun).filter_by(
                    conversation_id=conversation.id,
                ).order_by(AgentEmbeddedRun.created_at.desc()).limit(20).all()
            ]
        return payload
