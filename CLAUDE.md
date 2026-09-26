# CLAUDE.md — Xpredict One

**Every session: read this file first, then `context/01-PROJECT-STATE.md`.**
That file is the single source of truth for where the project stands right now.

> **`context/` and `.claude/` are local-only and deliberately not in version control.**
> If you are on a clone and those directories are absent, that is expected --- not a
> broken checkout. This file still applies; the project state and decision history
> simply live on the owner's machine. Ask the owner for them rather than
> reconstructing decisions from the code.

---

## Session bootstrap protocol (do this before any work)

1. Read `context/01-PROJECT-STATE.md` — current phase, what exists, what's next, blockers.
2. Read `context/02-DECISIONS.md` — what is settled and what is still contested.
   **Do not re-litigate a `[Decided]` entry.** Do not build on a `[CONFLICT]` entry
   without resolving it with the owner first.
3. Skim `context/03-IMPLEMENTATION-PLAN.md` for the task you're about to pick up.
4. If the task touches an entry in `context/04-OPEN-QUESTIONS.md`, ask the owner
   before assuming an answer.
5. Only read `context/source/` when you need the original long-form reasoning.
   Those files are **frozen historical input**, not current truth — where they
   disagree with `02-DECISIONS.md`, the decisions file wins.

## Session wrap protocol (before the session ends)

Run `/session-wrap`, or do it by hand:

1. Update `context/01-PROJECT-STATE.md` — move items between Done / In progress / Next.
2. Append a dated entry to `context/05-SESSION-LOG.md` (what changed, what was decided,
   what the next session should pick up).
3. Record any new decision in `context/02-DECISIONS.md` with its status and rationale.
4. Add any new unknown to `context/04-OPEN-QUESTIONS.md`.

**A session that changed project state but did not update these files has not finished.**

---

## Context file map

| File | What it holds | Who edits it |
|---|---|---|
| `context/01-PROJECT-STATE.md` | Current phase, done / in-progress / next, blockers | Every session |
| `context/02-DECISIONS.md` | Decision log with status + rationale | When a decision is made |
| `context/03-IMPLEMENTATION-PLAN.md` | Phased build plan with checkboxes | When a phase advances |
| `context/04-OPEN-QUESTIONS.md` | Unanswered questions blocking work | When one is found or answered |
| `context/05-SESSION-LOG.md` | Append-only history, one entry per session | Every session, at the end |
| `context/source/` | Frozen original design docs from the planning chat | Never — append new files instead |

---

## Project in one paragraph

A multi-tenant SaaS platform (Zoho-style) built as a **Django modular monolith** with a
**React + TypeScript** frontend. One login, one app launcher, shared platform services,
separate apps: **DMS** (dealership management), **CRM**, and **E-commerce**. The tenant
is the **Organization**, and each organization gets its **own PostgreSQL database**.
Authentication is **JWT, issued by the platform layer (`core/`) — never by the apps.**
DMS is **unit-aware**: an organization's dealerships are `BusinessUnit` rows, and
dealers manage their own scoped users. CRM and E-commerce have no business units;
their users belong to the organization directly.

**Build order: DMS first.** CRM later. **E-commerce is deferred** — do not design its
roles, permissions or models until it is explicitly picked up.

**Administration is two-level:** dealers are managed at the **organization** level;
each dealer's users are managed at the **dealer** level. An org admin reaching into a
dealer's users is an audited override, not the normal path.

Full rationale: `context/02-DECISIONS.md` C1–C7 — all `[Decided]`. Don't reopen them.

## Status

**Pre-implementation, unblocked.** No code has been written yet. The architecture is
fully settled and Phase 1 (project scaffold) is ready to start. One mechanism still
needs an answer inside Phase 2, which does not block Phase 1: **Q17** — how JWTs are
revoked on logout and on disabling a user.

---

## Where code goes

A **product** (`products/dms/`) is a container package, not a Django app. Each
**module** inside it is its own Django app with a product-prefixed label, because
Django app labels are global and `sales` alone would collide across products:

```python
class SalesConfig(AppConfig):
    name = "products.dms.sales"
    label = "dms_sales"      # product-prefixed, always
```

Every module has the same anatomy:

| File | Holds | Never holds |
|---|---|---|
| `models.py` | Structure; validation and computed properties | Anything that changes another module's data |
| `services.py` | **All** write logic; one public function per user action, one transaction | Anything HTTP-aware |
| `selectors.py` | Read/query logic, shared by endpoints, exports and dashboards | Writes |
| `api/serializers.py` | Shape and field-level validation | Business rules |
| `api/views.py` | Permission → deserialize → call service/selector → serialize | Business rules; an `if` about a rule belongs in services |
| `api/urls.py` | Routes, mounted under `/api/v1/orgs/<slug>/<app>/<module>/` | — |
| `handlers.py` | Reactions to other modules' events; **idempotent** | — |
| `tasks.py` | Celery tasks; each takes `org_id` and sets its own context | — |
| `migrations/` | This module's own history | — |

Adding a module means adding it to `TENANT_APPS` (or `CONTROL_PLANE_APPS`) in
`config/settings/base.py`. A module missing from those lists never migrates, silently.

`products/dms/sales/` is the worked reference --- copy its shape.

## Error handling

Six domain categories in `shared/exceptions.py`; `config/exception_handler.py` is the
only place they become HTTP. Full rationale: `context/02-DECISIONS.md` C9.

- **Services raise domain exceptions. Views never catch them.** A try/except around a
  service call duplicates the handler and will drift from it.
- **Never raise DRF exceptions from a service** — it couples business logic to HTTP and
  breaks the same service being called from a Celery task.
- **Cross-scope access raises `NotFoundError`, not `AuthorizationError`.** 404, not 403
  — a record the caller may not see must be indistinguishable from one that never
  existed. `AuthorizationError` is only for entitled-but-not-permitted.
- **Exception `context` is for logs, never the response.** It carries IDs the caller
  may not be entitled to see.
- **A 5xx body carries no detail.** Constraint names, SQL and stack traces all disclose
  internals — and in a multi-tenant system, another organization's data shape.
- Module-specific exceptions go in `<module>/exceptions.py`, subclassing a category,
  named after the business situation (`EnquiryAlreadyClosedError`, not `EnquiryConflict`).

## Working conventions

These hold regardless of how the open conflicts resolve.

- **Business logic lives in services/selectors** — never in views or serializers.
- **A module never writes another module's models directly.** Call the owning module's
  service function so it can enforce its own numbering, tax, validation, audit, events.
- **Products depend on `core`; products never depend on each other's internals.**
  Cross-product communication goes through events or a small public service interface.
  Enforce with `import-linter` in CI.
- **No HTTP calls between modules inside the monolith.** HTTP only after a module is
  genuinely extracted into its own service.
- **One user action = one API request**, running in one DB transaction.
- **Fail closed on tenant context.** If the tenant is missing, raise — never fall back
  to an unscoped query or the default database.
- **Per-request state lives in `contextvars`**, never module globals or class attributes,
  and middleware always resets them in a `finally` block.
- **UUID primary keys everywhere.** No foreign keys across databases/schemas — reference
  control-plane rows with plain UUID fields.
- **Cross-tenant leaks return 404, not 403.**
- Never name a Python package `platform/` — it shadows the stdlib module.

## Testing requirements

Any work that touches tenancy, scoping, or permissions must ship with:

- **Tenant isolation tests** — two orgs; no endpoint can read, update, or reference the other's data.
- **Unit/dealer isolation tests** — two dealers in one org; dealer users get 404 on each
  other's records and users; org users see both.
- **Privilege tests** — a dealer admin cannot create dealers, assign org-level roles,
  or manage another dealer's users.
- **Context tests** — contextvars reset after requests and tasks; missing context raises
  rather than returning unscoped data.
- Service-level unit tests for every service function.
