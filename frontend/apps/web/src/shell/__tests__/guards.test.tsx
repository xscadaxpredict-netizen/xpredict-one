/**
 * The route guards, exercised through the router.
 *
 * Covers what CLAUDE.md demands of anything touching tenancy and permissions:
 * tenant isolation, unit/dealer privilege, and failing closed — from the
 * frontend's side. The backend's own versions of these tests are not optional
 * either; these only prove the screen is right.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { ApiError } from "@xpredict/api-client";

import type * as authApi from "../api/auth";
import { fetchMe } from "../api/auth";
import { ModuleRoutes, type ModuleRoute } from "../routing";
import AdminRoutes from "../admin/routes";
import { renderRoute } from "./harness";
import { appAccess, me, membership, ownerMembership, salespersonMembership } from "./factories";

/*
 * Only `fetchMe` and `logout` are replaced; the module's types and its other
 * exports stay real, so a rename in `auth.ts` breaks this file rather than
 * being silently mocked over.
 */
vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

const mockFetchMe = vi.mocked(fetchMe);

function unauthorised() {
  return new ApiError({
    type: "about:blank",
    title: "Authentication required",
    status: 401,
    detail: "Email or password is incorrect.",
    code: "invalid_credentials",
    trace_id: "test",
  });
}

const dmsRoutes: ModuleRoute[] = [
  { path: "sales", module: "sales", element: <h1>Sales</h1> },
  { path: "service", module: "service", element: <h1>Service</h1> },
  { path: "settings", module: "settings", element: <h1>Dealer settings</h1> },
];

const withDms = [{ path: "dms/*", element: <ModuleRoutes routes={dmsRoutes} /> }];

/*
 * The REAL Administration routes, so the module guard is what decides rather
 * than a missing route. Without this, `/admin/audit` simply falls through to
 * the catch-all and a test asserting "Page not found" passes whether or not
 * the module is granted — which is exactly what one of these did until the
 * revert check caught it.
 */
const withAdmin = [{ path: "admin/*", element: <AdminRoutes /> }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authentication", () => {
  it("sends a signed-out visitor to sign in", async () => {
    mockFetchMe.mockRejectedValue(unauthorised());

    renderRoute({ path: "/acme-motors/dms/sales", children: withDms });

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });

  it("does not render the protected screen before the answer arrives", () => {
    // Never resolves: the shell must show its waiting state rather than
    // optimistically rendering the page and pulling it back.
    mockFetchMe.mockReturnValue(new Promise(() => undefined));

    renderRoute({ path: "/acme-motors/dms/sales", children: withDms });

    expect(screen.queryByRole("heading", { name: "Sales" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("keeps a signed-in person off the sign-in screen", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/login" });

    expect(await screen.findByRole("heading", { name: "Your apps" })).toBeInTheDocument();
  });

  it("leaves someone with no organisation on the sign-in screen rather than looping", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [] }));

    renderRoute({ path: "/login" });

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("tenant isolation", () => {
  it("refuses an organisation the person is not a member of", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/northway-motors/dms/sales", children: withDms });

    expect(
      await screen.findByRole("heading", { name: "Organisation unavailable" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sales" })).not.toBeInTheDocument();
  });

  it("does not reveal whether the other organisation exists", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/northway-motors", children: withDms });

    await screen.findByRole("heading", { name: "Organisation unavailable" });

    /*
     * The slug came from the URL, so it is the visitor's own text — but nothing
     * about the real organisation may appear. A name rendered here would
     * confirm the slug is real, which is how a customer list gets enumerated
     * one guess at a time from the address bar.
     */
    expect(document.body.textContent).not.toContain("Northway Motors");
  });

  it("shows the deactivated user a message instead of a blank screen", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [] }));

    renderRoute({ path: "/acme-motors", children: withDms });

    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});

describe("app entitlement", () => {
  it("hides an app with no access, and shows one the organisation has not bought", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [salespersonMembership()] }));

    renderRoute({ path: "/acme-motors", children: withDms });

    await screen.findByRole("heading", { name: "Your apps" });

    // Subscribed but not accessible -> hidden. Not subscribed -> shown, disabled.
    expect(screen.queryByText("CRM")).not.toBeInTheDocument();
    expect(screen.queryByText("Administration")).not.toBeInTheDocument();
    expect(screen.getByText("E-commerce")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /E-commerce/ })).toBeDisabled();
  });

  it("sends someone typing the URL of an app they cannot open back to the launcher", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [salespersonMembership()] }));

    renderRoute({ path: "/acme-motors/admin/users", children: withAdmin });

    expect(await screen.findByRole("heading", { name: "Your apps" })).toBeInTheDocument();
  });
});

describe("module privilege", () => {
  it("opens a module the person has", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [salespersonMembership()] }));

    renderRoute({ path: "/acme-motors/dms/sales", children: withDms });

    expect(await screen.findByRole("heading", { name: "Sales" })).toBeInTheDocument();
  });

  it("does not render a module the person lacks", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [salespersonMembership()] }));

    renderRoute({ path: "/acme-motors/dms/service", children: withDms });

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Service" })).not.toBeInTheDocument();
  });

  /*
   * A dealer salesperson must not reach the dealer-settings area, which is a
   * dealer admin's job (C3). Same organisation, same dealer, same app — only
   * the privilege differs, so nothing about tenancy catches this one.
   */
  it("keeps a salesperson out of the dealer settings area", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [salespersonMembership()] }));

    renderRoute({ path: "/acme-motors/dms/settings", children: withDms });

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  /*
   * OUT OF THE FIRST RELEASE (C38), and that is expressed by not granting the
   * module — not by deleting the screen. The placeholder and its route still
   * exist, so shipping the feature later is the backend adding a word to
   * `modules[]`, with no frontend release.
   *
   * Worth a test because the failure is invisible: grant the module by
   * accident and an unfinished screen reads as a finished one.
   */
  it("does not expose a module held back from the release", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/admin/audit", children: withAdmin });

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.queryByText(/Not built yet/i)).not.toBeInTheDocument();
  });

  it("does not link to one either", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));

    renderRoute({ path: "/acme-motors/admin/users", children: withDms });

    await screen.findByRole("heading", { name: "Users" });

    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Audit log" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Apps & billing/ })).not.toBeInTheDocument();
  });

  it("hides links to modules the person lacks", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [salespersonMembership()] }));

    renderRoute({ path: "/acme-motors/dms/sales", children: withDms });

    await screen.findByRole("heading", { name: "Sales" });

    expect(screen.getByRole("link", { name: "Sales" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Service" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tech support" })).not.toBeInTheDocument();
  });

  it("does not name the modules it is hiding", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [salespersonMembership()] }));

    renderRoute({ path: "/acme-motors/dms/sales", children: withDms });

    await screen.findByRole("heading", { name: "Sales" });

    // The UI mock had a line reading "Tech support hidden — your role has no
    // access". C16 settled that a lacked permission is hidden, not advertised.
    expect(document.body.textContent).not.toContain("Tech support");
  });

  it("sends the app root to the first module the person actually has", async () => {
    // Service-only. A hardcoded redirect to "sales" would land this person on
    // a screen they cannot open — the bug the launcher exists to avoid, one
    // level down.
    const serviceOnly = membership({
      unit_name: "Chennai — Guindy",
      apps: [appAccess("dms", { modules: ["service"] })],
    });
    mockFetchMe.mockResolvedValue(me({ memberships: [serviceOnly] }));

    renderRoute({ path: "/acme-motors/dms", children: withDms });

    expect(await screen.findByRole("heading", { name: "Service" })).toBeInTheDocument();
  });
});
