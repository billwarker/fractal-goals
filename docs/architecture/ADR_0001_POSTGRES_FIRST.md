# ADR 0001: Postgres-First Persistence

## Status

Accepted

## Date

March 7, 2026

## Context

The application previously carried mixed assumptions about development and runtime persistence, including lingering SQLite-oriented code paths and operational habits. That created several structural problems:

- SQLite locking behavior under concurrent writes was at odds with the app's autosave-heavy session flows.
- The codebase accumulated conditional logic and comments that implied multiple database backends were still part of the supported architecture.
- Refactoring backend services and transactions was harder because the lowest common denominator was defined by an outdated local-dev path rather than the production architecture.

The backend has since been refactored around SQLAlchemy sessions, nested transactions, and multi-write flows that align with Postgres semantics.

## Decision

The application is Postgres-first across development, testing, and production.

That means:

- Postgres is the only supported database backend for active development.
- New backend code should not add SQLite compatibility branches, comments, or fallback behavior.
- Test setup, local environment guidance, and operational scripts should assume a Postgres test database.
- Migration, validation, and transaction design should optimize for Postgres behavior and guarantees.

## Consequences

### Positive

- Concurrency and autosave-heavy workflows behave more like production in local and test environments.
- Service-layer transaction handling can be designed around one real backend instead of a least-common-denominator abstraction.
- Operational documentation and troubleshooting become simpler.

### Negative

- Local setup requires Postgres availability instead of a zero-dependency SQLite path.
- Older scripts or assumptions that referenced SQLite need to be removed or updated.

## Follow-up

- Keep `.env.testing`, `run-tests.sh`, and test fixtures aligned with Postgres expectations.
- Remove stale SQLite references when encountered during future cleanup tranches.
