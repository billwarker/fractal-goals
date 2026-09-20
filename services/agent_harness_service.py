"""Public composition for delegated AI tasks, proposals, and runs."""

from services.agent_harness_common import AgentHarnessError
from services.agent_harness_context import AgentContextMixin
from services.agent_harness_proposals import AgentProposalsMixin
from services.agent_harness_runs import AgentRunsMixin


class AgentHarnessService(AgentContextMixin, AgentProposalsMixin, AgentRunsMixin):
    def __init__(self, db_session):
        self.db_session = db_session
