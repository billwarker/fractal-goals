"""Persist the trusted execution channel on tasks and runs.

Revision ID: 7c3e5a1b9d42
Revises: 6d4a2c9f1b83
"""

from alembic import op
import sqlalchemy as sa


revision = "7c3e5a1b9d42"
down_revision = "6d4a2c9f1b83"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "agent_task_briefs",
        sa.Column("execution_origin", sa.String(length=32), nullable=False, server_default="first_party"),
    )
    op.add_column(
        "agent_runs",
        sa.Column("execution_origin", sa.String(length=32), nullable=False, server_default="first_party"),
    )
    op.execute("UPDATE agent_task_briefs SET execution_origin = 'connector' WHERE grant_id IS NOT NULL")
    op.execute("""
        UPDATE agent_task_briefs AS task
        SET execution_origin = CASE conversation.provider
            WHEN 'openai' THEN 'embedded_openai'
            WHEN 'anthropic' THEN 'embedded_anthropic'
        END
        FROM agent_proposals AS proposal
        JOIN agent_embedded_runs AS embedded_run ON embedded_run.proposal_id = proposal.id
        JOIN agent_embedded_conversations AS conversation ON conversation.id = embedded_run.conversation_id
        WHERE proposal.task_id = task.id AND task.grant_id IS NULL
    """)
    op.execute("""
        UPDATE agent_runs AS run
        SET execution_origin = task.execution_origin
        FROM agent_proposals AS proposal
        JOIN agent_task_briefs AS task ON task.id = proposal.task_id
        WHERE run.proposal_id = proposal.id
    """)
    op.execute("UPDATE agent_runs SET execution_origin = 'connector' WHERE grant_id IS NOT NULL")
    with op.batch_alter_table("agent_task_briefs") as batch_op:
        batch_op.alter_column("execution_origin", server_default=None)
    with op.batch_alter_table("agent_runs") as batch_op:
        batch_op.alter_column("execution_origin", server_default=None)


def downgrade():
    op.drop_column("agent_runs", "execution_origin")
    op.drop_column("agent_task_briefs", "execution_origin")
