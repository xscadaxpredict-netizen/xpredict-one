/**
 * Administration → Roles, the reference page.
 *
 * WHAT IS WORTH PINNING HERE is not that twelve rows render — it is the two
 * things a reader could be misled about:
 *
 *   the LEVEL, because it decides which roles somebody can even be offered;
 *   and which roles ADMINISTER, because that is the only property of a role
 *   that changes standing in the organisation rather than describing what it
 *   does (C31), and it is not visible from a job title.
 *
 * A page that quietly showed every role as "Dealer", or dropped the badge from
 * System administrator, would look completely normal.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

import { fetchRoles } from "../admin/api/roles";
import type * as rolesApi from "../admin/api/roles";
import { RolesScreen } from "../admin/screens/RolesScreen";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import { me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof rolesApi>()),
  fetchRoles: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchRoles = vi.mocked(fetchRoles);

const routes = [{ path: "admin/roles", element: <RolesScreen /> }];

/** Only the fields the page reads; the rest is noise here. */
function role(overrides: Partial<rolesApi.Role> & { code: string }): rolesApi.Role {
  return {
    name: overrides.code,
    app: "dms",
    level: "unit",
    summary: "Does things.",
    administers: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
});

/** The row for a role, found by its name. */
async function rowFor(name: string) {
  const term = await screen.findByText(name);
  const row = term.closest("div");
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe("the Roles reference page", () => {
  /*
   * The whole reason this page has two sections. Somebody who sees "Admin"
   * against a person on Users and then opens Roles has to find it here, or
   * they will reasonably decide the page is incomplete — and go looking for an
   * app role called Admin that does not exist.
   */
  it("explains the organisation roles as well as the app ones", async () => {
    mockFetchRoles.mockResolvedValue([role({ code: "dms.manager", name: "Manager" })]);

    renderRoute({ path: "/acme-motors/admin/roles", children: routes });

    expect(await screen.findByRole("heading", { name: "Organisation roles" })).toBeInTheDocument();
    for (const name of ["Owner", "Admin", "Member"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }

    expect(await screen.findByRole("heading", { name: "DMS roles" })).toBeInTheDocument();
  });

  it("says which scope each app role belongs to", async () => {
    mockFetchRoles.mockResolvedValue([
      role({ code: "dms.manager", name: "Manager", level: "unit" }),
      role({ code: "dms.fleet_viewer", name: "Fleet viewer", level: "org" }),
    ]);

    renderRoute({ path: "/acme-motors/admin/roles", children: routes });

    expect(await rowFor("Manager")).toHaveTextContent("Dealer");
    expect(await rowFor("Fleet viewer")).toHaveTextContent("Organisation");
  });

  /*
   * `administers` means the role grants `admin.*` permissions, and it writes
   * nothing into standing (C40 — C31's write-back is gone). A role that
   * carries it grants more than its description implies, so the page marks it
   * — and must not mark the ones that do not.
   */
  it("marks only the roles that manage users", async () => {
    mockFetchRoles.mockResolvedValue([
      role({ code: "dms.manager", name: "Manager", administers: false }),
      role({ code: "dms.system_admin", name: "System administrator", administers: true }),
    ]);

    renderRoute({ path: "/acme-motors/admin/roles", children: routes });

    expect(await rowFor("System administrator")).toHaveTextContent("Manages users");
    expect(await rowFor("Manager")).not.toHaveTextContent("Manages users");
  });

  /*
   * An app the server names that this frontend has never heard of still
   * appears, under its raw key. Dropping it would hide a role somebody can
   * actually be given, which is worse than an unpolished heading.
   */
  it("shows an app it does not recognise rather than hiding its roles", async () => {
    mockFetchRoles.mockResolvedValue([
      role({ code: "warranty.assessor", name: "Assessor", app: "warranty" }),
    ]);

    renderRoute({ path: "/acme-motors/admin/roles", children: routes });

    expect(await screen.findByRole("heading", { name: "warranty roles" })).toBeInTheDocument();
    expect(screen.getByText("Assessor")).toBeInTheDocument();
  });

  it("offers a retry when the roles cannot be loaded", async () => {
    mockFetchRoles.mockRejectedValue(new Error("nope"));

    renderRoute({ path: "/acme-motors/admin/roles", children: routes });

    expect(await screen.findByText(/Could not load app roles/i)).toBeInTheDocument();

    // The organisation roles are written here, so they survive the failure —
    // half a page beats an error where three constants could have been shown.
    expect(within(await rowFor("Owner")).getByText("Owner")).toBeInTheDocument();
  });
});
