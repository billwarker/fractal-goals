"""Public composition for delegated AI tasks, proposals, and runs."""

from services.agent_harness_common import AgentHarnessError
from services.agent_harness_context import AgentContextMixin
from services.agent_harness_proposals import AgentProposalsMixin
from services.agent_harness_preview import AgentProposalPreviewMixin
from services.agent_harness_runs import AgentRunsMixin
from services.agent_harness_run_queries import AgentRunQueriesMixin


class AgentHarnessService(
    AgentContextMixin,
    AgentProposalPreviewMixin,
    AgentProposalsMixin,
    AgentRunsMixin,
    AgentRunQueriesMixin,
):
    def __init__(self, db_session):
        self.db_session = db_session
