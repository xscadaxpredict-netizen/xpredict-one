# Xpredict One

A multi-tenant SaaS platform: **DMS** (dealership management), **CRM**, and
E-commerce, under one login and one app launcher.

Django REST backend + React/TypeScript frontend. **DMS is being built first.**

---

## Get it running

### You need

| | Version | Check with |
|---|---|---|
| **Node** | **24 LTS** | `node --version` |
| Python | 3.12+ | `python --version` |
| Docker Desktop | any current | `docker --version` |

> **Node 18 will not work.** It is end-of-life and Vite refuses it. If
> `node --version` shows v18, install the LTS before anything else:
> `winget install OpenJS.NodeJS.LTS` in an **administrator** PowerShell. If a
> previous Node was installed via winget, uninstall that package first —
> `winget upgrade` will not move you off a version-pinned package.

### Frontend — works today

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. You land on `/login`.

**Signing in is faked for now.** Any email and any password gets you in; the
password `wrong` shows the failure path. Real authentication needs the backend
to set its cookies, which is not built yet — see `USE_FAKE_AUTH` in
`apps/web/src/shell/api/auth.ts`, one constant and three branches to delete.

Useful commands, all from `frontend/`:

```bash
npm run dev          # start the app
npm run lint         # every workspace
npm run typecheck    # every workspace
npm test             # every workspace
npm install zod -w web            # add a dependency to ONE workspace
```

`-w` takes the package **name**, not the folder: `web`, `@xpredict/ui`,
`@xpredict/auth`, `@xpredict/api-client`.

### Backend — not runnable yet

The Django project is scaffolded and its tests pass, but it has **never
connected to a database**. PostgreSQL and Redis come from Docker, which nobody
has installed yet.

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.lock.txt
python -m pytest tests/ -q      # passes: no database needed
python manage.py check
```

`docker compose up -d` and `manage.py migrate` are the next steps, once Docker
is on the machine.

---

## Read before your first pull request

| File | What it covers |
|---|---|
| **`frontend/CONTRIBUTING.md`** | How we build screens. **Read this first.** |
| `CLAUDE.md` | Architecture, backend conventions, error handling |

`frontend/CONTRIBUTING.md` is the important one. It covers the folder shape, the
four layers, where each kind of state goes, and a checklist for your first PR.

**The decision log is not in this repository.** The reasoning behind the
architecture — why database-per-tenant, why httpOnly cookies, what was rejected
— lives on the owner's machine. `CLAUDE.md` states *what* was decided; ask the
owner for the *why* rather than assuming a rule is arbitrary and working around
it.

---

## Who owns what

```
frontend/apps/web/src/
├── shell/                  owner — topbar, launcher, org switcher, admin
├── products/dms/sales/     dev 1
├── products/dms/service/   dev 2
├── products/dms/tech_support/  dev 3
└── products/dms/routes.tsx SHARED — agree changes together

frontend/packages/
├── ui/                     owner — shared components
├── auth/                   owner — current user, org, permissions
└── api-client/             generated — nobody edits by hand
```

**Work only inside your own module.** ESLint fails the build if one product
imports another, so this is enforced rather than requested.

**Need a component that does not exist?** Build it in your own module's
`components/` folder. Do not wait for anyone. It moves into `packages/ui` when a
**second** module needs the same thing — not before, because a shared component
designed from one use case grows a prop per caller and becomes unmaintainable.

---

## Two rules worth knowing before you read any code

**Every cache key starts with the organisation.** You cannot get this wrong by
accident — product code is forbidden from importing `useQuery` directly, and
`useOrgQuery` adds the organisation itself. If ESLint blocks that import, it is
working as designed; use `useOrgQuery` from `@xpredict/api-client`.

Why it matters: a user who belongs to two organisations switches between them,
and a cache key without the organisation serves one customer's data inside
another's account. The backend does nothing wrong; the cache does it.

**Every list screen ships four states.** Loading, empty, no-results, error.
"Nothing here yet" and "nothing matched your filter" are different screens with
different exits. See `products/dms/sales/screens/EnquiryListScreen.tsx`.

---

## Where to start reading

`frontend/apps/web/src/products/dms/sales/` is the reference module — copy its
shape:

```
sales/
├── api/          plain functions + cache keys. No React.
├── hooks/        server state (TanStack Query). The only place data is fetched.
├── components/   presentational. Props in, markup out.
└── screens/      one per route. Composes the above.
```

For the shell side, `apps/web/src/shell/screens/LoginScreen.tsx` is a complete
worked example: Zod validation, a mutation, error handling, redirect.

---

## Honest status

| | |
|---|---|
| Login screen | Works, with faked authentication |
| DMS screens | Not started — stubs only |
| App shell (topbar, launcher) | Not started |
| Backend | Scaffolded, tests pass, never run against a database |
| Real auth, API calls | Blocked on the backend |

Nothing talks to a real server yet. The frontend is where the work is right now.
