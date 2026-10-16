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
is the **Organization**, and each organization gets its **own MySQL database** (C39
replaced PostgreSQL; nothing else about the tenancy model changed).
Authentication is **JWT, issued by the platform layer (`core/`) — never by the apps.**
DMS is **unit-aware**: an organization's dealerships are `BusinessUnit` rows, and
dealers manage their own scoped users. CRM and E-commerce have no business units;
their users belong to the organization directly.

**Build order: DMS first.** CRM later. **E-commerce is deferred** — do not design its
roles, permissions or models until it is explicitly picked up.

**Administration is two-level:** dealers are managed at the **organization** level;
each dealer's users are managed at the **dealer** level. An org admin reaching into a
dealer's users is an audited override, not the normal path.

Full rationale: `context/02-DECISIONS.md` C1–C67 — all `[Decided]`. Don't reopen them.

## Status

**The frontend ships Administration; the backend runs on MySQL and signs people in.**
Keep this section current — it is the first thing a new developer reads.

**Frontend — built, merged, and running on Django.** Sign-in, the app launcher, the
shell and Administration (Users, Dealers, Roles) all work in a browser against the
real backend. **NO `USE_FAKE_*` FLAG IS SWITCHED ON ANYWHERE.** Administration's
three went in PR #20 and `USE_FAKE_DEALER_STATUS` went with **C63**, which answered
**Q21** and gave closing a dealership a real endpoint. `USE_FAKE_AUTH` and
`USE_FAKE_SIGNUP` still EXIST as `false` constants with their blocks intact --- which
this file claimed for several sessions were gone, so they are named here rather than
described as deleted.

**The five DMS modules are merged** --- sales, site-services, tech support, tools and
the `ecommerce` MODULE (C64, not the deferred suite app). Their screens are live and
their endpoints authorise properly (C66, C67).

**Backend — it runs on a database now.** Django 5.2.17 on **MySQL 8.0** (C39), split
settings, the fail-closed `TenantRouter`, `shared/base_models.py`, Celery wiring and 15
apps with unique labels (5 control-plane, 10 tenant). **Plain DRF** — drf-spectacular was removed (C43), so there is
no schema endpoint and no generated client. **`migrate` has run** and `xpredict_control`
holds **23 tables**, and each organisation gets its own database beside it.

Set the database up once, as a MySQL admin: `mysql -u root -p < backend/scripts/create_dev_db.sql`.

**The control plane is BUILT and MIGRATED.** Eleven models: `Organization`,
`BusinessUnit`, `Membership`, `Invitation`, `InvitationAppGrant` in `core/organizations`;
`Permission`, `Role`, `RolePermission`, `AppAccess` in `core/permissions`;
`AppSubscription` in `core/billing`; and `User`, which was already there. **55 permissions
and nine roles are seeded** — 48 by `core/permissions/migrations/0002_seed_catalogue.py`
from `core/permissions/catalogue.py`, and seven more by `0004` for the DMS reference
library, tools and store orders (C67). Both are idempotent and reversible, and 0002
withdraws a grant the catalogue no longer makes.

**Permissions are ROWS, not a Python registry (C44)** — reversing the last part of C42,
because the owner wants the list queryable in Workbench rather than readable only by
somebody who knows where to look. Adding a capability is therefore **a data migration**,
not a one-line diff. Everything else in C42 stands: the `app.resource.action` shape,
scope staying out of the name, export as its own action, and **modules derived from
`Permission.module`** rather than stored anywhere.

**Three rules the schema enforces itself, and they will bite you:** a membership with
standing `owner` or `admin` must have `unit_id IS NULL` (C40); there is exactly one owner
per organisation, via a nullable `owner_marker` and a unique pair, because **MySQL has no
partial indexes**; and `admin` can never be granted on `AppAccess` or sold on
`AppSubscription` (C44).

> **`Applying <app>.0001_initial... OK` does not mean tables were created.** Django
> prints it whether it built them or the router refused every operation, so a migration
> that did nothing reads exactly like one that worked. **Check the tables.**

**Authentication is built.** Login, refresh, logout and `GET /api/v1/auth/session/`,
with the token in an **httpOnly cookie** the frontend never reads (C12). Send
`X-CSRFToken` on anything that changes state, and `credentials: "include"` on every
request. **`GET /api/v1/me/` is built** — user, memberships, and per organisation the
standing, unit, app access, modules and permissions. It is control plane only, so it
needs no tenant database.

**THE FRONTEND RUNS ON THIS, NOT ON FAKES.** Signing up, signing in, the launcher,
the sidebar and the whole of Administration read Django. `USE_FAKE_USERS`,
`USE_FAKE_DEALERS` and `USE_FAKE_ROLES` are gone (PR #20).

**ADMINISTRATION IS ELEVEN ENDPOINTS UNDER `/orgs/<slug>/admin/`** — users, dealers
and roles. Three rules run through them and are not interchangeable: **scope fails
with 404** (a person outside your dealership must look like one who does not exist),
**capability fails with 403**, and **state fails with 409** (the owner, a taken
address, a locked sign-in address).

**A VIEW DECLARES `required_permissions`, AND NOT DECLARING IT IS A 500** — the
default is `None`, not `[]`, so a view nobody finished is loud on its first request
instead of quietly permitting everybody. An endpoint that genuinely needs none says
`[]` and says why. `required_any_permission` and `method_permissions` cover "any one
of these" and "more for this HTTP method".

**AND NO BASE CLASS MAY SUPPLY THAT DEFAULT (C66).** `TenantAPIView` set
`required_permissions = []`, which switched the rule above off for the whole of DMS:
with `[]` inherited, the value is never `None`, the check can never fire, and
"we decided this needs nothing" becomes indistinguishable from "nobody got round to
it". Thirteen views were in the second state and nine write actions were open to any
member of the organisation, up to rewriting the capacity calculator's constants.
**`tests/test_org_scoped_permissions.py` had pinned the rule since it was written and
did not catch it**, because it tests a view inheriting `OrgScopedAPIView` while every
DMS view inherits `TenantAPIView`. A product base class needs its own assertion —
inheriting a rule is not the same as being covered by its test.

**WHICH ROLE MAY WRITE FOLLOWS THE SCOPE OF THE DATA, NOT SENIORITY (C67).** A
`UnitScopedModel` row belongs to one dealership, so a Manager may write it and
`allowed_units` confines them. A `BaseModel` row has no `unit_id` — one copy per
organisation, read by every dealership — so it is granted at organisation level only,
to `dms.group_operations`. Notably **not** to `dms.system_admin`, which sounds like an
admin and is unit-level; a test asserts that absence so reversing it is deliberate.

**EVERY ADMIN URL ENDS IN A SLASH, and that is not style.** `APPEND_SLASH` makes a
slashless GET 301 silently and a slashless POST **raise** — so a frontend calling
`/admin/users` renders the list perfectly and 500s on every button.

**WHAT YOU MAY GRANT IS WHAT THE ORGANISATION BOUGHT** (C55), never what the admin
filling in the form can open. `visibleApps()` is the launcher's rule and hides an app
you are subscribed to but cannot open; using it for a grant form let an owner untick
their own DMS and make it ungrantable for everybody. `grantableApps()` is the other
question, and the backend refuses a grant for an unsubscribed app.

**`X-CSRFToken` IS SENT BY `csrfHeaders()` in `packages/api-client`**, used by all
five `request()` helpers. The rule above was in this file for four sessions and
implemented by none of them, which made logout answer 403 and leave people signed
in. The `csrftoken` cookie is deliberately readable by JavaScript while `xp_access`
is httpOnly — that asymmetry is the mechanism, not an oversight.

**Tenancy is live.** Signup fires a Celery task on `transaction.on_commit` that
creates and migrates the organisation's own database (C1), and
`config/middleware.py` binds it per request from the URL slug, resetting the
contextvars in a `finally`. **Dev runs Celery eagerly and caches in memory**,
because Redis is still not installed.

**Only tenant apps are migrated into a tenant database**, by label. A bare
`migrate` records all 39 control-plane migrations as applied — Django records a
migration whether or not the router allowed one of its operations — which is a
trap for whoever first moves an app between `CONTROL_PLANE_APPS` and
`TENANT_APPS`.

**TENANT APPS HAVE MODELS NOW, AND THIS FILE SAID OTHERWISE FOR MONTHS.** The five
DMS modules bring **23 model classes and 19 tenant migrations**, so a freshly
provisioned organisation gets real tables --- it is no longer true that "a fresh
tenant database has no tables at all", and a test that asserted exactly that had to
be rewritten when the modules landed.

**WHICH MEANS EVERY ORGANISATION PROVISIONED BEFORE THE MERGE IS EMPTY AND ITS DMS
PAGES WILL 500.** `provision_tenant` only runs at signup, so existing tenant
databases do not gain the new tables by themselves. Run **`manage.py
migrate_all_tenants --plan`** first, then without `--plan`. This is the first time
that command has ever had anything to apply.

**A provision that failed for good is repaired with
`manage.py reprovision_tenant <slug>`** (C50). The launcher refuses to open an
app whose workspace is not ready, so nobody lands in a product that would 500.
Nothing *notices* a stuck organisation yet — that is the rest of **Q33** and it
wants Sentry.

**EVERY ENDPOINT UNDER `/api/v1/orgs/<slug>/` INHERITS `OrgScopedAPIView`**
(C49, answering Q32). It verifies active membership before the handler runs and
exposes the organisation as **`self.organization`** — which is the only way to
reach it, because the middleware stows it under a private name. A view written
without the base class does not get an insecure endpoint; it gets one that
cannot see the organisation at all.

This used to be a function each view called, and forgetting it meant any
signed-in stranger could read another organisation's rows — while the tests
passed, because you naturally test as a member. **`request.organization` is
gone**; reaching for it now raises, which becomes an opaque 500 rather than a
silent bypass.

The split stays: the middleware decides WHICH database and deliberately refuses
nothing for an unknown slug, because refusing there leaked which organisations
exist. The base view decides WHO. It is also the first link of the Phase 3
authorization chain, so the rest hangs off it.

**PEOPLE CAN JOIN NOW — the invitation flow is complete (C56, PR #22).** And
**there is no email**: `GET /orgs/<slug>/admin/users/<id>/invite-link/` hands the
link to an admin, who sends it however they already talk to the person. **Show and
Resend are different verbs** — Show reveals the same link as often as you like,
Resend mints a new token and kills the old one. Nothing reaches the clipboard until
the copy icon is pressed.

**THE TOKEN IN THAT LINK IS THE CREDENTIAL and nothing else guards it.** True of
every "set your password" link ever sent; the difference is that a chat message is
backed up, searchable and forwardable in ways a mailbox is not.

**`/api/v1/invitations/<token>/` IS NOT UNDER `/orgs/<slug>/`, AND CANNOT BE.**
Everything under that prefix inherits `OrgScopedAPIView`, which verifies an active
membership before the handler runs (C49) — and the holder of a link is precisely
somebody without one. The token names the organisation, which also keeps a
customer's slug out of a URL pasted into chat.

**`accept_invitation()` RUNS UNDER `select_for_update`**, so a link clicked twice
cannot produce two memberships — without it the unique constraint on
`(user, organization)` turns the second click into a 500. Every rule is re-checked
at accept time, because an invitation can sit for a fortnight and the app can be
unsubscribed in that time (C55).

**`FRONTEND_BASE_URL` MUST BE SET or no invitation can be handed out at all.**
`invitation_link()` raises on an empty value rather than building a relative URL —
a link that is quietly wrong is noticed only by the person who cannot use it. Dev
takes it from the Vite origin; production has to be told.

**ZERO MEMBERSHIPS MEANS TWO THINGS NOW** (C58): "you were removed" and "invited,
not yet joined". Somebody removed from their only organisation and then re-invited
signs in with none, so `RedirectIfSignedIn` and `LoginScreen` both have to know —
they used to send that person nowhere and tell them their access had been removed.

**PASSWORDS GO THROUGH ONE VALIDATOR** (C57): `validate_password_strength` in
`core/accounts/api/serializers.py`, shared by signup and by accepting.
`AUTH_PASSWORD_VALIDATORS` had been configured since Phase 1 and **nothing had ever
called it** — signup would take `12345678`. A refused password's reason is in the
response's `errors` list, never in `detail`, which is generic for every validation
failure; a form that renders `detail` alone says nothing useful.

**THE SESSION REFRESHES ITSELF, FROM ONE PLACE** (C59).
`packages/api-client/src/request.ts` is the only code that fetches: a 401 refreshes
once and replays once, and a failed refresh lets the 401 through so the shell can
send somebody to sign in. **The refresh is SINGLE-FLIGHT and that is load-bearing** —
rotation plus blacklisting means three concurrent refreshes sign the person out, so
one shared promise serves every caller. Endpoints where 401 is a real answer — login,
the two signup steps, both invitation endpoints — pass `public: true`; the default
refreshes, so forgetting it costs one wasted request rather than breaking recovery.

**THERE IS ONE `request()` AND SIX MODULES USE IT.** There were six copies until
PR #24. A seventh API module imports it; it does not paste one.

**A REFRESH VERIFIES THE ACCOUNT, NOT JUST THE TOKEN** (C60). `RefreshToken()` checks
a signature, an expiry and a denylist and **never loads the user**, so a deleted or
deactivated person refreshed happily for seven days while every other request answered
401 — a session that could not die, and 41,269 requests from one stale browser tab.
`rotate_tokens()` loads the account now and refuses. It also closes the gap under Q17:
disabling somebody took effect on their next request, but their refresh token carried
on working.

**A HINT INSIDE A DIALOG MUST BEAT Z-INDEX 61** (C61). The ladder is 40 detail panel,
50 menus and popovers, 60 dialog overlay, 61 dialog content, 70 `InfoHint`. **jsdom
applies no CSS Modules, so no test in `apps/web` can catch a stacking mistake** —
every `z-index` reads 0 there. It was found by clicking, and if it bites again the fix
is to move the ladder into design tokens.

**Blocked on:** nothing. **UPLOADS IN PRODUCTION ARE FIXED**, and the fix is four
parts because any one alone still looks broken: the `/media/` location in
`deploy/nginx-xpredict.conf`, `MEDIA_ROOT` created in the runbook at **755 not 750**
(Nginx reads it as `www-data`), uploads added to `backup-databases.sh`, and a
verification step that reads the response BODY because the status is 200 either way.

> **The old bug, kept because the failure mode is the lesson.** With no `/media/`
> block, `/media/signature.png` fell through to the SPA's `try_files ...
> /index.html` and returned index.html **with a 200**. Broken images everywhere and
> nothing in any log.

**`X_FRAME_OPTIONS` WAS A FALSE ALARM, and this file said otherwise for one day.**
It claimed `prod.py`'s `DENY` silently breaks the PDF preview in production. It does
not. In production **Nginx serves `/media/` by alias, so Django is not in that
request** and neither `DENY` nor `SAMEORIGIN` ever reaches the file. Measured both
ways: a dev request to `/media/` (where Django DOES serve it) returns
`X-Frame-Options: SAMEORIGIN`, and the Nginx config set no such header anywhere.

The real gap was the opposite --- those responses had **no framing protection at
all**, so any site could embed a customer's signed report. The `/media/` block sets
`SAMEORIGIN` itself; `prod.py` keeps `DENY`, which is correct for the API and the
admin and costs the preview nothing.

**WHAT IS STILL OPEN IS Q48: uploaded files are public to anyone with the URL.**
`upload_to` carries no tenant segment --- `"reports/signatures/client/"`, not
`"<org>/reports/..."` --- so every organisation's files share one tree, and a
forwarded link reads a customer's signed service report. That is what the
application already assumes (the serializers hand out `FileField.url`, the frontend
fetches it with no credentials, and the public sign links depend on it), so the fix
is an authorised endpoint plus `X-Accel-Redirect` --- a design change across both
halves, not a patch.

**Redis is still missing**, which leaves the Celery broker
round-trip unverified — and now also means the throttle counter and cache are
per-process in development. **An unreachable cache is not a missing rate limit, it
is a 500:** DRF keeps throttle history there, which is how nine sessions of
`CACHES` pointing at an uninstalled Redis finally surfaced.

**Q17 is answered** — and its premise was wrong in a useful way. simplejwt loads the
user row on every request and refuses an inactive one, so **disabling somebody takes
effect on their next request**, not after a token expires. The 15-minute access
lifetime is how long a STOLEN token survives a logout.

**Gates, all green:** `npm run test -w web` (194), `npm run typecheck -w web`,
`npm run lint`, and in `backend/`: `pytest` (447), `ruff check .`, and
`.venv/Scripts/lint-imports.exe` — **not** `python -m importlinter.cli`, which exits 0
without running. Run them before pushing.

**One branch per FEATURE, not per commit.** Commit as the work goes; the owner merges
when the whole feature is done.

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

`products/dms/sales/` is the worked reference — copy its shape. Its **models.py is
deliberately empty**: the illustrative model was deleted once it became clear that a
placeholder would create a real table in every tenant database. The conventions it
taught are the file's docstring.

## Error handling

Seven domain categories in `shared/exceptions.py`; `config/exception_handler.py` is the
only place they become HTTP. Full rationale: `context/02-DECISIONS.md` C9.

- **Services raise domain exceptions. Views never catch them.** A try/except around a
  service call duplicates the handler and will drift from it.
- **Never raise DRF exceptions from a service** — it couples business logic to HTTP and
  breaks the same service being called from a Celery task.
- **`AuthenticationError` is 401, `AuthorizationError` is 403**, and they are not
  interchangeable. 401 means authenticate and try again, which is what sends somebody
  to the sign-in page; 403 means we know who you are and the answer is still no, which
  should leave them where they are.
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
