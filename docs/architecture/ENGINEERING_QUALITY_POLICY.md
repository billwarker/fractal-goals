# Engineering Quality Policy

This document defines standing review gates. Feature plans hold implementation detail;
`index.md` remains an architectural map.

## Tests are part of the contract

- Any function that returns a classification, count, state, page boundary, or cursor must
  have table-driven boundary coverage: empty input, one item, adjacent sizes, the stated
  maximum, one over the maximum, transitions, and broken/restarted sequences where relevant.
- Bug fixes begin with a failing regression and include neighbouring cases, not only the
  reported example.
- Backend coverage is measured over `services/` and `blueprints/`. The threshold in
  `pytest.ini` is an honest floor and a ratchet: raise it at each whole-point gain; never
  lower it to land a change. `scripts/check_backend_coverage_gate.py` prevents CI overrides.
- Performance-sensitive reads require a bounded-input invariant plus query-count or payload
  evidence proportional to their risk.

## Maintainability and error boundaries

- Prefer ownership seams over line-count-only splitting. Frontend files above the normal
  800-line ceiling must be explicitly capped by the maintainability audit and may not grow.
  The backend applies the same rule through `scripts/check_backend_maintainability.py`.
- Extract a module when a stable concern can own its own state, tests, or public contract.
  Do not create pass-through fragments merely to reduce a number.
- Broad exception catches are allowed only at true process, event, provider, cache, or HTTP
  boundaries where the operation must degrade safely. They must log context unless logging
  itself is the best-effort operation. Domain parsing catches named exception types.
- Route handlers should stay thin. New route families use shared API helpers and service
  results; do not copy rollback/log/500 boilerplate into new endpoints. The current
  SQLAlchemy catch count is capped so that this debt can shrink but cannot spread.

## Review and commits

- One commit should express one coherent behavioural or architectural change. Subjects use
  an imperative phrase with a meaningful scope; temporary subjects such as `ix:` are not
  acceptable on shared branches.
- Goal, session, landing, and mobile changes require focused manual QA before merge because
  repository history shows that they have the highest short-lag corrective-change rate.
- Reviewers explicitly look for dead compatibility paths and competing implementations.
  Removal is part of completion when a replacement becomes canonical.
