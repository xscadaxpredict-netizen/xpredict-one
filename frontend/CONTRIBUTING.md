# Frontend workflow

How we build screens. Read this before your first pull request.

The backend is a Django modular monolith with strict module boundaries. The frontend
mirrors that on purpose — same shape, same rules, so a change stays inside one folder
and four people can work without stepping on each other.

---

## 1. Where your code goes

You own one module. Everything you write lives inside it:

```
products/dms/sales/
├── api/
│   ├── keys.ts              query keys — read section 4, this one bites
│   └── enquiries.ts         thin wrappers over the generated client
├── hooks/
│   ├── useEnquiries.ts      reads  (queries)
│   └── useCreateEnquiry.ts  writes (mutations)
├── components/              presentational, this module only
│   ├── EnquiryTable.tsx
│   └── EnquiryTable.module.css
├── screens/                 one per route; composes hooks + components
│   ├── EnquiryListScreen.tsx
│   └── EnquiryDetailScreen.tsx
├── schemas.ts               Zod schemas for forms
└── routes.tsx               this module's routes
```

**You never edit another module's folder.** If you need something from `service/`, it
belongs in `packages/ui` or `packages/auth` instead — and ESLint fails the build if you
try, so this is not a guideline.

### Working with npm workspaces

One `npm install` at `frontend/` installs every workspace and links the local
`@xpredict/*` packages. There is no build step for them — `apps/web` imports their
TypeScript source directly through Vite.

```bash
npm install                      # from frontend/, installs everything
npm run dev                      # starts apps/web
npm run lint                     # every workspace
npm install zod -w web           # add a dependency to ONE workspace
npm install -D vitest -w @xpredict/ui
```

`-w <name>` takes the package's `name` field, not its folder: `web`,
`@xpredict/ui`, `@xpredict/auth`, `@xpredict/api-client`.

Local packages are declared as `"@xpredict/ui": "*"`. npm resolves `*` to the
workspace copy because the name matches an entry in the root `workspaces` globs —
it does not go to the registry.

**One thing to watch.** npm hoists dependencies into the root `node_modules`, so a
workspace can import a package it never declared and it will work — until someone
removes it from the workspace that *did* declare it, and an unrelated app breaks.
If you `import` it, add it to that workspace's `package.json`.

---

## 2. Four layers, one direction

```
screens/      compose: call hooks, render components, own the four states
   ↓
hooks/        server state: TanStack Query. The ONLY place data is fetched.
   ↓
api/          thin functions over the generated client. No React in here.
   ↓
packages/api-client   generated from the backend's OpenAPI schema. Nobody edits it.
```

`components/` sits to the side: screens pass data **down** as props.

**Why components do not fetch.** A component that fetches cannot be rendered in a
different context, cannot be tested without a network, and hides what a screen costs —
you find out a page fires eleven requests only in production. Data flows from a screen
you can read top to bottom.

The one exception: a genuinely self-contained widget used in several screens — a
`<DealerPicker />` that loads its own dealer list — may own its query. If you are
unsure, pass props; it is the easier mistake to undo.

---

## 3. The workflow, one screen end to end

Follow this order. It is deliberate: each step gives the next one something real to work
against, so you never build a component and then discover the data does not fit.

### Step 1 — Agree the API shape, then mock it

The backend is paused, so **the MSW handler is the contract**. Write it first.

```ts
// src/mocks/handlers/sales.ts
import { http, HttpResponse } from 'msw';

export const salesHandlers = [
  http.get('/api/v1/orgs/:orgSlug/dms/sales/enquiries', () =>
    HttpResponse.json({
      results: [
        {
          id: '0b6b…',
          reference: 'ENQ-00412',
          status: 'new',
          source: 'walk_in',
          customer_name: 'Priya Raghunathan',
          assigned_to_user_id: null,
          unit_id: 'e41…',
          created_at: '2026-09-25T09:12:00Z',
        },
      ],
      count: 42,
    }),
  ),
];
```

Mock the **failures** too, in the exact shape the backend sends (section 8). A screen whose
error path was never exercised has no error path.

### Step 2 — Query keys

Every key starts with the organisation. Read section 4 before writing this — it is the one
mistake in this document that leaks data between customers.

### Step 3 — The api function

No React, no hooks. Just the call.

```ts
// api/enquiries.ts
import { apiGet, apiPost } from '@xpredict/api-client';
import type { Enquiry, EnquiryFilters, NewEnquiry } from './types';

export function fetchEnquiries(orgSlug: string, filters: EnquiryFilters) {
  return apiGet<{ results: Enquiry[]; count: number }>(
    `/api/v1/orgs/${orgSlug}/dms/sales/enquiries`,
    { params: filters },
  );
}

export function createEnquiry(orgSlug: string, body: NewEnquiry) {
  return apiPost<Enquiry>(`/api/v1/orgs/${orgSlug}/dms/sales/enquiries`, body);
}
```

### Step 4 — The hook

```ts
// hooks/useEnquiries.ts
import { useQuery } from '@tanstack/react-query';
import { useOrgSlug } from '@xpredict/auth';
import { fetchEnquiries } from '../api/enquiries';
import { salesKeys } from '../api/keys';
import type { EnquiryFilters } from '../api/types';

export function useEnquiries(filters: EnquiryFilters) {
  const orgSlug = useOrgSlug();

  return useQuery({
    queryKey: salesKeys.enquiryList(orgSlug, filters),
    queryFn: () => fetchEnquiries(orgSlug, filters),
  });
}
```

### Step 5 — Components, dumb

Props in, markup out. No `useQuery`, no router, no `orgSlug`.

### Step 6 — The screen

Calls the hook, handles all four states (section 9), renders components.

### Step 7 — Register the route

`routes.tsx` is the **only file your module shares with the other two**. Agree its shape
once, up front, and merge conflicts stop happening.

### Step 8 — Test

Vitest + Testing Library, with MSW answering the network. Test what a user does —
"renders the empty state when there are no enquiries" — not that a hook was called.

---

## 4. Query keys: enforced, not remembered

**You cannot write a cache key without the organisation in it.** Not "you must
remember to" — the signature does not allow it.

Product code never imports `useQuery` or `useMutation`. ESLint refuses:

```
error  Use useOrgQuery / useOrgMutation from @xpredict/api-client. They scope the
       cache key to the current organisation  no-restricted-imports
```

Instead:

```ts
// api/keys.ts — module-relative. No org here; the hook adds it.
export const salesKeys = {
  all: () => ["dms", "sales"] as const,
  enquiries: () => [...salesKeys.all(), "enquiries"] as const,
  list: (filters: EnquiryFilters) => [...salesKeys.enquiries(), "list", filters] as const,
};

// hooks/useEnquiries.ts
export function useEnquiries(filters: EnquiryFilters = {}) {
  return useOrgQuery({
    key: salesKeys.list(filters),
    queryFn: (orgSlug) => fetchEnquiries(orgSlug, filters),
  });
}
```

`useOrgQuery` reads the org from the route, prepends it to the key, and hands it
to your `queryFn` — so the URL cannot miss it either.

**Why this is machine-enforced when most of this document is not.** A key like
`["enquiries", "list"]` works perfectly in development, where you are only ever
signed into one organisation. It breaks the first time a real user with two
memberships switches org in the topbar: TanStack Query finds a cache hit and
renders Acme's enquiries inside Northway. The backend behaved correctly. The
cache did it. To the person looking at the screen it is indistinguishable from a
data breach — and a rule in a document does not survive four developers and a
deadline.

The same applies to invalidation. `invalidates: [salesKeys.enquiries()]` is
org-scoped too, so a write in one organisation never refetches another's cached
data.

## 5. Mutations are the frontend's services

The backend gives one endpoint per user action, each in one transaction. Mirror that:
**one mutation per user action.** Not a generic `useUpdateEnquiry` that patches
arbitrary fields — `useAssignEnquiry`, `useMarkEnquiryLost`.

```ts
// hooks/useCreateEnquiry.ts
export function useCreateEnquiry() {
  const orgSlug = useOrgSlug();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: NewEnquiry) => createEnquiry(orgSlug, body),
    onSuccess: () => {
      // Invalidate the branch, not every key: this org's enquiries only.
      void queryClient.invalidateQueries({ queryKey: salesKeys.enquiries(orgSlug) });
    },
  });
}
```

Why named mutations: the name documents the rule the backend enforces. `markLost`
requires a reason and refuses on an already-closed enquiry. A generic patch hides that,
and the first person to reuse it will not know.

**Do not add optimistic updates by default.** They are worth it for a toggle the user
repeats; for anything with a server-side rule, an optimistic update shows success for an
action the backend is about to reject.

---

## 6. Components

- **CSS Modules only.** One `Foo.module.css` beside `Foo.tsx`.
- **Tokens, never raw values.** `var(--color-primary)`, never `#2450B5`. A hex in a diff
  is a review comment, every time. The full set is in `styles/tokens.css`.
- **Radix for anything with behaviour** — dialog, dropdown, tooltip, tabs, popover.
  Focus traps and keyboard navigation are not worth rewriting, and yours will be worse.
- **Real elements.** `<button>`, `<a href>`, `<label htmlFor>`. Never a clickable
  `<div>` — Tab skips it, and a dealership back office runs on keyboards.
- **No `any`.** Already an ESLint error. Server types come from the generated client, so
  an `any` means someone bypassed the API contract.
- Props typed explicitly. No `React.FC`.

### When to put a component in `packages/ui`

**Not yet.** Build it in your own `components/` folder first.

When a **second** module needs the same thing, promote it — and only then. A shared
component designed from one use case grows a prop for every later caller and becomes
unmaintainable. Two real callers is the smallest number that shows you its actual shape.

This also means **nobody waits.** If the DataTable you need does not exist, write one in
your module today.

---

## 7. Where state goes

Three kinds of state, three homes. Putting one in the wrong home is the most
common structural mistake in a React app, and the hardest to unpick later.

| Kind | Example | Where it lives |
|---|---|---|
| **Server state** | Enquiries, dealers, the current user | TanStack Query, in `hooks/` |
| **Shared UI state** | Sidebar collapsed, theme | Zustand, in `stores/` |
| **Local UI state** | Is this dialog open, which filter chip is active | `useState` in the screen |

### The test

Ask **"who owns the truth?"**

- The *server* owns it → TanStack Query. It came from an API response.
- The *browser* owns it and several distant components need it → Zustand.
- The *browser* owns it and only this screen cares → `useState`. Start here.

Default to `useState` and move outward only when something forces you to. Most
state never needs to leave the screen it lives in.

### Never put server data in Zustand

You would be hand-writing caching, refetching, staleness, loading flags and
invalidation — forever, and worse than the library already does it. If it came
from an API response, it goes in TanStack Query.

The tell: a store field named `enquiries`, `users`, or anything plural you
fetched. That's the mistake.

### The organisation trap

A Zustand store lives outside React and outside the router. **It does not reset
when someone switches organisation.** Anything org-specific kept in a store —
a selected dealer, a draft record, a date range — follows the user from Acme
straight into Northway. Same family of bug as a cache key missing the org: the
backend is blameless, and the user is looking at one customer's context inside
another's.

So: **keep org-specific state out of stores.** Sidebar-collapsed and theme are
safe — they describe the person, not the customer. If something org-specific
genuinely must be shared, it needs an explicit reset when the org slug changes,
and that reset is your responsibility to write.

`persist` makes this sharper: persisted state survives **logout**, so the next
person at that machine inherits it. Never persist anything answering "who is
this" or "which customer are we in".

### Where store files go

- Shell-wide (sidebar, theme) → `apps/web/src/stores/`
- One module only → `products/<product>/<module>/stores/`

A store used by exactly one screen is a sign it should have been `useState`.

---

## 8. Errors

Every failure comes back as RFC 9457 `application/problem+json`:

```json
{
  "type": "https://api.xpredict.one/errors/enquiry-already-closed",
  "title": "Conflict",
  "status": 409,
  "detail": "This enquiry is closed and cannot be modified.",
  "code": "enquiry_already_closed",
  "trace_id": "9f2c4b1e…",
  "errors": [{ "field": "reason", "code": "required", "detail": "A reason is required." }]
}
```

**Switch on `code`, never on `detail`.** `code` is the contract; `detail` is prose the
backend may reword at any release. Matching on message text breaks silently.

**Field errors go back onto the form.** React Hook Form + Zod handles shape; the server
catches what a form cannot see (a discount over the dealer's limit, a plate already
registered):

```ts
onError: (error) => {
  const problem = asProblem(error);
  for (const fieldError of problem.errors ?? []) {
    form.setError(fieldError.field as keyof FormValues, {
      message: fieldError.detail,
    });
  }
}
```

**Show `trace_id` somewhere copyable on a 5xx.** It is how support finds the real error
— the response body deliberately tells the user nothing else.

**404 means gone, not forbidden.** The backend returns 404 for another dealer's record
on purpose, so existence does not leak. Never write "you do not have access to
ENQ-00412" — that sentence confirms it exists.

---

## 9. Every list screen ships four states

Not three. Written afterwards, they are always worse.

| State | What it must do |
|---|---|
| **Loading** | A skeleton shaped like the coming content. Not a centred spinner — that throws the layout down the page when data lands. |
| **Empty** | Nothing exists yet. Explain what will appear here, and offer the action that creates the first one. |
| **No results** | The filter is too narrow. Show the active filters and a "clear filters" exit. **Never** offer "New enquiry" here — the data exists; the filter is the problem. |
| **Error** | A message from `code`, a retry button, and the `trace_id`. |

Empty and no-results are different screens with different exits. Getting this wrong
sends someone to create a duplicate record because the list looked blank.

---

## 10. Permissions

```tsx
const canAssign = usePermission('dms', 'sales.enquiry.assign');
return canAssign ? <AssignButton /> : null;
```

**Hiding is a courtesy, never a control.** The backend enforces every permission
regardless of what renders. Never leave an action visible "because the API will reject
it anyway" — and never assume a hidden action is safe.

---

## 11. Before you open a pull request

- [ ] Query keys come from the module's key factory (the org is added by `useOrgQuery` — ESLint enforces this)
- [ ] All four states exist and are reachable in the mock
- [ ] No hex codes, no raw pixel font sizes — tokens only
- [ ] No `any`; no clickable `<div>`
- [ ] Errors switch on `code`, not on `detail`
- [ ] No server data in a Zustand store; nothing org-specific in one either
- [ ] Nothing imported from another product, or another module's internals
- [ ] `npm run lint && npm run typecheck && npm test` passes
- [ ] New shared component? Two real callers, or it stays in your module

---

## Status of this document

The code above is the pattern to follow, but **none of it has been run** — `npm install`
has not happened yet on this repo, so the dependency versions are unverified and the
TypeScript is unchecked. Treat the snippets as the shape, not as copy-paste-and-ship.
Fix and improve this file as the first real screens land.
