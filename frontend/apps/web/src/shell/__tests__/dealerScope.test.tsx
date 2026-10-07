/**
 * C27 — a person who belongs to one dealer may hold DMS and Administration,
 * never an organisation-wide product.
 *
 * WHY THESE TESTS EXIST. Before C27 the coupling between the apps list and the
 * dealer picker ran ONE WAY: clearing DMS cleared the dealer. Nothing stopped an
 * organisation admin ticking DMS *and* CRM *and* picking a dealer, which creates
 * exactly the leak the architecture is built to prevent — CRM does no dealer
 * filtering, so that person would see every dealer's customers.
 *
 * The Administration case is the one worth guarding hardest. "DMS only" is the
 * obvious reading of C27 and it is wrong: a dealer admin is a dealer-scoped
 * membership holding Administration (C23), and that is how an organisation hands
 * a dealership its own administrator. A rule that locked Administration would
 * quietly make dealer admins impossible to create, and every other test here
 * would still pass.
 *
 * NONE OF THIS IS SECURITY. Django refuses the grant in `grant_app_access()`
 * regardless (C19). These tests pin down what the form offers.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type * as dealersApi from "../admin/api/dealers";
import { fetchDealers } from "../admin/api/dealers";
import type * as rolesApi from "../admin/api/roles";
import { fetchRoles } from "../admin/api/roles";
import type * as usersApi from "../admin/api/users";
import { fetchUsers, inviteUser, updateUser } from "../admin/api/users";
import { DealersScreen } from "../admin/screens/DealersScreen";
import { UsersScreen } from "../admin/screens/UsersScreen";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { renderRoute } from "./harness";
import {
  appAccess,
  dealerAdminMembership,
  me,
  membership,
  ownerMembership,
  roleCatalogue,
} from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/users", async (importOriginal) => ({
  ...(await importOriginal<typeof usersApi>()),
  fetchUsers: vi.fn(),
  /*
   * RESOLVES WITH A ROW, not `undefined`. The dialog now reads the created
   * invitation's id so it can show the link to copy (C56) -- there is no
   * email -- so a mock returning nothing sends it down its error path while
   * these tests, which only assert the payload, carry on passing.
   */
  inviteUser: vi.fn().mockResolvedValue({
    id: "invitation-1",
    first_name: "Asha",
    last_name: "Pillai",
    email: "asha.p@acmemotors.in",
    unit_id: null,
    unit_name: null,
    role: "member",
    status: "invited",
    apps: [],
    administers: null,
  }),
  fetchInviteLink: vi.fn().mockResolvedValue({
    link: "http://localhost:5173/invite/token-for-invitation-1",
    expires_at: "2026-10-21T00:00:00Z",
  }),
  updateUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/dealers", async (importOriginal) => ({
  ...(await importOriginal<typeof dealersApi>()),
  fetchDealers: vi.fn(),
}));

// `fetchRoles` READS DJANGO NOW, so it has to be mocked like the rest. It used
// to answer from the module's own fake, which is why these tests never
// mentioned roles while asserting the exact contents of a role picker.
// `importOriginal` keeps the module's real exports; only the request is
// replaced.
vi.mock("../admin/api/roles", async (importOriginal) => ({
  ...(await importOriginal<typeof rolesApi>()),
  fetchRoles: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchUsers = vi.mocked(fetchUsers);
const mockFetchDealers = vi.mocked(fetchDealers);
const mockInviteUser = vi.mocked(inviteUser);
const mockUpdateUser = vi.mocked(updateUser);
const mockFetchRoles = vi.mocked(fetchRoles);

function user(overrides: Partial<usersApi.OrgUser> & { id: string }): usersApi.OrgUser {
  return {
    first_name: "First",
    last_name: "Last",
    email: `${overrides.id}@acmemotors.in`,
    unit_name: null,
    unit_id: null,
    role: "member",
    status: "active",
    apps: [{ app: "dms", role_code: "dms.sales_representative", role_name: "Sales representative" }],
    administers: null,
    ...overrides,
  };
}

function dealer(overrides: Partial<dealersApi.Dealer> & { id: string }): dealersApi.Dealer {
  return {
    name: "Chennai — Guindy",
    code: null,
    contact_person: "R. Menon",
    email: "guindy@acmemotors.in",
    phone: "+91 44 4000 0000",
    city: "Chennai",
    state: "Tamil Nadu",
    postal_code: "600032",
    status: "active",
    user_count: 4,
    created_at: "2026-01-04T09:00:00Z",
    ...overrides,
  };
}

const GUINDY = dealer({ id: "unit-1" });

/** Somebody organisation-wide, so the edit form shows every field. */
const ANITA = user({ id: "anita", first_name: "Anita", last_name: "Fernandes" });

/**
 * A record C27 forbids: scoped to a dealer AND holding CRM.
 *
 * Unreachable through the form now, which is the point — it stands for a row
 * created before this rule existed, or by a backend that let it through. The
 * form has to let an admin unwind it.
 */
const LEGACY = user({
  id: "sanjay",
  first_name: "Sanjay",
  last_name: "Desai",
  unit_id: "unit-1",
  unit_name: "Chennai — Guindy",
  apps: [
    { app: "dms", role_code: "dms.sales_representative", role_name: "Sales representative" },
    { app: "crm", role_code: "crm.member", role_name: "CRM user" },
  ],
});

const routes = [
  { path: "admin/users", element: <UsersScreen /> },
  { path: "admin/users/:userId", element: <UsersScreen /> },
];

const dealerRoutes = [
  { path: "admin/dealers", element: <DealersScreen /> },
  { path: "admin/dealers/:dealerId", element: <DealersScreen /> },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchUsers.mockResolvedValue([ANITA, LEGACY]);
  mockFetchDealers.mockResolvedValue([GUINDY]);
  mockFetchRoles.mockResolvedValue(roleCatalogue());
});

async function openInviteForm() {
  renderRoute({ path: "/acme-motors/admin/users", children: routes });
  fireEvent.click(await screen.findByRole("button", { name: "Invite user" }));
  return screen.findByRole("dialog");
}

async function openEditForm(userId: string, name: string) {
  renderRoute({ path: `/acme-motors/admin/users/${userId}`, children: routes });
  await screen.findByRole("complementary", { name });
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  return screen.findByRole("dialog");
}

/**
 * Waits for the dealer list to arrive before selecting from it.
 *
 * The `<select>` renders before its options do, and setting a value that has no
 * matching option is silently a no-op — so asserting straight after the change
 * tests nothing and passes for the wrong reason.
 */
async function chooseDealer(dialog: HTMLElement, name: string, id: string) {
  await within(dialog).findByRole("option", { name });
  // "Dealership" on the invite form, "Dealer" on the edit form, which still
  // uses the older layout. Whichever this dialog has.
  const picker =
    within(dialog).queryByLabelText("Select dealer") ?? within(dialog).getByLabelText("Dealer");
  fireEvent.change(picker, { target: { value: id } });
}

/** The scope radio. Choosing a dealership is what narrows everything else. */
function chooseScope(dialog: HTMLElement, label: string) {
  fireEvent.click(within(dialog).getByRole("radio", { name: label }));
}

/**
 * Picks a role, which is REQUIRED wherever more than one is possible.
 *
 * Nothing is preselected in that case on purpose: the list is ordered
 * most-capable first, so a silent default would hand out the most powerful
 * role to anybody who did not look.
 */
async function chooseRole(dialog: HTMLElement, appName: string, code: string) {
  const picker = await within(dialog).findByLabelText(`Role in ${appName}`);
  fireEvent.change(picker, { target: { value: code } });
}

describe("inviting somebody into one dealership", () => {
  /*
   * The strongest form of C27 on this screen: for a dealer-scoped person the
   * organisation-wide apps are NOT OFFERED, rather than offered and disabled.
   * A checkbox list where two of three are permanently greyed is asking a
   * question with one answer.
   *
   * Asserts what IS there as well as what is not — "CRM is absent" alone would
   * pass if the fieldset failed to render at all.
   */
  it("offers no organisation-wide app once the person belongs to a dealership", async () => {
    const dialog = await openInviteForm();

    chooseScope(dialog, "Dealership");
    await chooseDealer(dialog, "Chennai — Guindy", "unit-1");

    expect(within(dialog).queryByRole("checkbox", { name: "CRM" })).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent(/CRM and E-commerce are\s+organisation-wide/i);
    expect(await within(dialog).findByLabelText("Role in DMS")).toBeInTheDocument();
  });

  /*
   * ONE CONTROL ANSWERS "WHAT IS THIS PERSON AT THIS DEALERSHIP?" (C34).
   *
   * It was three things in turn: an "Administration" tick plus a dealership,
   * which granted the power by deduction; then a separate "also let them manage
   * users" tick, which read as redundant beside a role called Dealer manager;
   * and now the role itself.
   */
  it("makes the dealer-admin grant a role rather than a second control", async () => {
    const dialog = await openInviteForm();

    chooseScope(dialog, "Dealership");
    await chooseDealer(dialog, "Chennai — Guindy", "unit-1");

    const picker = await within(dialog).findByLabelText("Role in DMS");

    expect(within(picker).getByRole("option", { name: "Manager" })).toBeInTheDocument();

    /*
     * NO TICK BESIDE IT, in any form. Two controls writing one value look
     * identical in the payload and identical to a passing test — the only place
     * the duplicate shows is on screen, which is where the last one was found.
     */
    expect(within(dialog).queryAllByRole("checkbox")).toHaveLength(0);
    expect(dialog).not.toHaveTextContent(/manage users at this dealer/i);
  });

  /*
   * Asserts both directions deliberately. Checking only that the apps come back
   * would pass against a form that never hid them, and prove nothing.
   */
  it("restores the full app list when they work across the organisation", async () => {
    const dialog = await openInviteForm();

    chooseScope(dialog, "Dealership");
    expect(within(dialog).queryByRole("checkbox", { name: "CRM" })).not.toBeInTheDocument();

    chooseScope(dialog, "Organisation");

    expect(within(dialog).getByRole("checkbox", { name: "CRM" })).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "DMS" })).toBeInTheDocument();
    // No dealership to pick when they are not scoped to one.
    expect(within(dialog).queryByLabelText("Select dealer")).not.toBeInTheDocument();
  });

  /*
   * There is no "no dealership" option in the picker any more — that is the
   * other radio — so an empty one means the question was skipped. Submitting it
   * would send `unit_id: ""` and the backend would be right to refuse.
   */
  it("will not send an invitation with the dealership unanswered", async () => {
    const dialog = await openInviteForm();

    chooseScope(dialog, "Dealership");
    fireEvent.change(within(dialog).getByLabelText(/First name/), { target: { value: "Asha" } });
    fireEvent.change(within(dialog).getByLabelText(/Last name/), { target: { value: "Pillai" } });
    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "asha.p@acmemotors.in" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Create invitation/ }));

    expect(await within(dialog).findByText(/Select the dealer this user belongs to/i)).toBeInTheDocument();
    expect(mockInviteUser).not.toHaveBeenCalled();
  });
});

describe("what standing an invited person gets", () => {
  /** The invitation body, once the call has been asserted to have happened. */
  function inviteBody() {
    const call = mockInviteUser.mock.calls[0];
    if (!call) throw new Error("inviteUser was never called");
    return call[1];
  }

  function fillNames(dialog: HTMLElement) {
    fireEvent.change(within(dialog).getByLabelText(/First name/), { target: { value: "Asha" } });
    fireEvent.change(within(dialog).getByLabelText(/Last name/), { target: { value: "Pillai" } });
    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "asha.p@acmemotors.in" },
    });
  }

  /*
   * A DEALER USER IS NOT AUTOMATICALLY THE ADMIN, and under C40 the DMS role is
   * the ONLY thing that says so. Standing stays `member` for everybody with a
   * dealership, whichever role they hold — so these two tests now differ in the
   * `apps` they send and agree on `role`.
   */
  it("leaves a dealer user a member when their role does not administer", async () => {
    const dialog = await openInviteForm();

    chooseScope(dialog, "Dealership");
    await chooseDealer(dialog, "Chennai — Guindy", "unit-1");
    await chooseRole(dialog, "DMS", "dms.manager");
    fillNames(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: /Create invitation/ }));

    await waitFor(() => {
      expect(mockInviteUser).toHaveBeenCalled();
    });
    /*
     * MANAGER, deliberately. It is the role most likely to be assumed to
     * administer — it carried `administers` for an hour — so it is the one
     * worth pinning as not doing so (C36).
     */
    expect(inviteBody()).toMatchObject({
      unit_id: "unit-1",
      apps: [{ app: "dms", role: "dms.manager" }],
      role: "member",
    });
  });

  /*
   * THE SAME TEST FOR THE ROLE THAT DOES ADMINISTER, and it is the one that
   * changed with C40. It used to assert `role: "admin"` — standing escalated by
   * the app role, which C31 called a dealer admin.
   *
   * C40 made the two independent: the DMS System administrator role carries the
   * power by itself and standing stays `member`. This is not cosmetic. The
   * database now REFUSES `admin` with a dealership attached, so the old payload
   * would be rejected on write.
   */
  it("still leaves standing at member when the role does administer", async () => {
    const dialog = await openInviteForm();

    chooseScope(dialog, "Dealership");
    await chooseDealer(dialog, "Chennai — Guindy", "unit-1");
    await chooseRole(dialog, "DMS", "dms.system_admin");
    fillNames(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: /Create invitation/ }));

    await waitFor(() => {
      expect(mockInviteUser).toHaveBeenCalled();
    });

    const body = inviteBody();

    expect(body).toMatchObject({
      unit_id: "unit-1",
      apps: [{ app: "dms", role: "dms.system_admin" }],
      // NOT "admin" (C40). What they administer travels in the DMS role above;
      // standing is a separate axis and a dealership person is always a member.
      role: "member",
    });
    /*
     * ADMINISTRATION IS NOT SENT AS AN APP. It comes with the platform, and the
     * server derives it from the permissions this DMS role grants (C40).
     * Sending it too would mean two sources for one thing, and they would
     * eventually disagree — which is exactly the record this form used to
     * produce: admin access with member standing.
     */
    expect(body.apps.map((grant) => grant.app)).not.toContain("admin");
  });

  /*
   * Before this, everybody arrived as a member and had to be promoted in a
   * second pass through Edit — and the dealer-admin toggle had no way to say
   * what it meant.
   */
  it("can invite an organisation admin in one step", async () => {
    const dialog = await openInviteForm();

    expect(within(dialog).queryByRole("checkbox", { name: "Administration" })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Organisation role"), {
      target: { value: "admin" },
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "DMS" }));
    await chooseRole(dialog, "DMS", "dms.fleet_viewer");
    fillNames(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: /Create invitation/ }));

    await waitFor(() => {
      expect(mockInviteUser).toHaveBeenCalled();
    });
    expect(inviteBody()).toMatchObject({
      unit_id: null,
      // Organisation-wide in DMS means Fleet viewer — the only org-level DMS
      // role, and read-only, because such a person is unrestricted across every
      // dealership (C32).
      apps: [{ app: "dms", role: "dms.fleet_viewer" }],
      role: "admin",
    });
  });
});

describe("the role somebody holds inside an app", () => {
  /*
   * THE SCOPE DECIDES WHICH ROLES EXIST. A dealer-scoped person can hold only
   * `unit` roles and somebody organisation-wide only `org` ones (C32) — offering
   * the wrong ones would produce records the backend is right to refuse.
   */
  it("offers the six dealership roles to somebody at a dealership", async () => {
    const dialog = await openInviteForm();

    chooseScope(dialog, "Dealership");
    await chooseDealer(dialog, "Chennai — Guindy", "unit-1");

    const picker = await within(dialog).findByLabelText("Role in DMS");
    const names = within(picker)
      .getAllByRole("option")
      .map((option) => option.textContent);

    expect(names).toEqual([
      // Nothing is preselected where there is a real choice, so the form opens
      // on a prompt rather than on the most capable role.
      "Select a role…",
      // Only System administrator administers the dealership (C36).
      "Manager",
      "System administrator",
      "Sales representative",
      "Service advisor",
      "Technician",
      "Tech support",
    ]);
    // Roles that span every dealership are not things you can be AT one.
    expect(names).not.toContain("Fleet viewer");
    expect(names).not.toContain("Group operations");
  });

  /*
   * Somebody organisation-wide in DMS has no dealership to be scoped to, so
   * `resolve_allowed_units()` returns unrestricted and they see every
   * dealership's records (C7). Both org-level roles reflect that: one reads
   * everywhere, the other acts everywhere.
   */
  it("offers the organisation-wide roles as a real choice", async () => {
    const dialog = await openInviteForm();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "DMS" }));

    const picker = await within(dialog).findByLabelText("Role in DMS");
    const names = within(picker)
      .getAllByRole("option")
      .map((option) => option.textContent);

    expect(names).toEqual(["Select a role…", "Fleet viewer", "Group operations"]);
    // Dealership roles are not things you can be across ALL of them.
    expect(names).not.toContain("Sales representative");
    expect(picker).toHaveValue("");
  });

  /*
   * ONE OPTION IS PRESELECTED, because there is no decision to make and asking
   * somebody to confirm it would be the wasted question C23 warns about. The
   * control is still a select rather than a line of text, so granting a role
   * always looks like the same act.
   */
  it("preselects an app that has only one role", async () => {
    const dialog = await openInviteForm();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "CRM" }));

    const picker = await within(dialog).findByLabelText("Role in CRM");

    expect(picker).toHaveValue("crm.member");
    expect(within(picker).queryByText("Select a role…")).not.toBeInTheDocument();
  });

  /*
   * The other half of failing closed: an app granted with its role unanswered
   * is access to something with no permissions inside it. The message names
   * the app rather than making the person hunt for which one.
   */
  it("refuses to send until every granted app has a role", async () => {
    const dialog = await openInviteForm();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "DMS" }));
    await within(dialog).findByLabelText("Role in DMS");
    fireEvent.change(within(dialog).getByLabelText(/First name/), { target: { value: "Asha" } });
    fireEvent.change(within(dialog).getByLabelText(/Last name/), { target: { value: "Pillai" } });
    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "asha.p@acmemotors.in" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Create invitation/ }));

    expect(await within(dialog).findByText(/Choose a role for DMS/i)).toBeInTheDocument();
    expect(mockInviteUser).not.toHaveBeenCalled();
  });

  it("sends the role that was chosen", async () => {
    const dialog = await openInviteForm();

    chooseScope(dialog, "Dealership");
    await chooseDealer(dialog, "Chennai — Guindy", "unit-1");

    fireEvent.change(await within(dialog).findByLabelText("Role in DMS"), {
      target: { value: "dms.service_advisor" },
    });

    fireEvent.change(within(dialog).getByLabelText(/First name/), { target: { value: "Asha" } });
    fireEvent.change(within(dialog).getByLabelText(/Last name/), { target: { value: "Pillai" } });
    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "asha.p@acmemotors.in" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Create invitation/ }));

    await waitFor(() => {
      expect(mockInviteUser).toHaveBeenCalled();
    });

    const call = mockInviteUser.mock.calls[0];
    if (!call) throw new Error("inviteUser was never called");

    expect(call[1].apps).toEqual([{ app: "dms", role: "dms.service_advisor" }]);
  });

  /*
   * A DEALER ADMIN STILL PICKS ONE. Which dealership and which app are decided
   * for them (C23), but a salesperson and a service advisor are different jobs
   * and only the person hiring knows which this is. The other fields stay
   * absent — this is the one question they get.
   */
  it("asks a dealer admin for it, and nothing else", async () => {
    mockFetchMe.mockResolvedValue(me({ memberships: [dealerAdminMembership()] }));

    const dialog = await openInviteForm();

    expect(await within(dialog).findByLabelText("Role in DMS")).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Select dealer")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Organisation role")).not.toBeInTheDocument();
  });
});

describe("what a stored user shows", () => {
  /*
   * The forms send role CODES; a stored user carries the display NAME, which
   * the server resolves from the Role table the way it resolves `unit_name`
   * from a dealership.
   *
   * The fake used to keep a second hardcoded map for this, so adding a role
   * meant remembering to add it in two places. It was forgotten the first time
   * — a brand new Dealer admin appeared in the panel as the literal string
   * "dms.manager". It now reads the role list itself.
   */
  it("resolves a role code to its name", async () => {
    const dialog = await openInviteForm();

    chooseScope(dialog, "Dealership");
    await chooseDealer(dialog, "Chennai — Guindy", "unit-1");
    await chooseRole(dialog, "DMS", "dms.system_admin");

    fireEvent.change(within(dialog).getByLabelText(/First name/), { target: { value: "Kiran" } });
    fireEvent.change(within(dialog).getByLabelText(/Last name/), { target: { value: "Bose" } });
    fireEvent.change(within(dialog).getByLabelText(/Email/), {
      target: { value: "kiran.b@acmemotors.in" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Create invitation/ }));

    await waitFor(() => {
      expect(mockInviteUser).toHaveBeenCalled();
    });

    const call = mockInviteUser.mock.calls[0];
    if (!call) throw new Error("inviteUser was never called");

    // THE CODE GOES OUT, not the display name. Resolving it back to
    // "System administrator" was asserted here against the fake; Django owns
    // that mapping now and `test_roles_api.py` pins it on the other side.
    expect(call[1].apps).toEqual([{ app: "dms", role: "dms.system_admin" }]);
  });
});

describe("editing somebody's role", () => {
  const ADVISOR = user({
    id: "ravi",
    first_name: "Ravi",
    last_name: "Shankar",
    unit_id: "unit-1",
    unit_name: "Chennai — Guindy",
    apps: [{ app: "dms", role_code: "dms.service_advisor", role_name: "Service advisor" }],
  });

  beforeEach(() => {
    mockFetchUsers.mockResolvedValue([ANITA, ADVISOR]);
  });

  /*
   * SEEDED FROM WHAT THEY HOLD, by display name, because that is what a stored
   * user carries while the form speaks in codes. Get this wrong and the picker
   * silently shows the first role in the list — so opening the dialog to fix a
   * spelling and saving would quietly demote a Dealer manager.
   */
  it("starts from the role they already hold", async () => {
    const dialog = await openEditForm("ravi", "Ravi Shankar");

    expect(await within(dialog).findByLabelText("Role in DMS")).toHaveValue(
      "dms.service_advisor",
    );
  });

  /*
   * C25's rule, which survives roles becoming assignable: granting another app
   * or moving somebody between dealerships must leave their existing roles
   * alone. Only an explicit change to this picker reassigns anything.
   */
  it("keeps it through an edit that was about something else", async () => {
    const dialog = await openEditForm("ravi", "Ravi Shankar");

    await within(dialog).findByLabelText("Role in DMS");
    fireEvent.change(within(dialog).getByLabelText(/First name/), {
      target: { value: "Ravindra" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Save changes/ }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalled();
    });

    const call = mockUpdateUser.mock.calls[0];
    if (!call) throw new Error("updateUser was never called");

    expect(call[2].apps).toEqual([{ app: "dms", role: "dms.service_advisor" }]);
    expect(call[2].first_name).toBe("Ravindra");
  });

  it("sends the new one when it is actually changed", async () => {
    const dialog = await openEditForm("ravi", "Ravi Shankar");

    fireEvent.change(await within(dialog).findByLabelText("Role in DMS"), {
      target: { value: "dms.manager" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Save changes/ }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalled();
    });

    const call = mockUpdateUser.mock.calls[0];
    if (!call) throw new Error("updateUser was never called");

    expect(call[2].apps).toEqual([{ app: "dms", role: "dms.manager" }]);
  });
});

describe("staffing a dealership that has nobody in it", () => {
  /*
   * Creating a dealership used to end in a dead end: the Dealers screen knew
   * nobody worked there and could only describe the problem. The link carries
   * `?invite=<id>` into Users, which opens this dialog already scoped — so
   * "create a dealership, give it an admin" is two clicks rather than a hunt.
   */
  it("opens the invite dialog already scoped to that dealership", async () => {
    renderRoute({ path: "/acme-motors/admin/users?invite=unit-1", children: routes });

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("radio", { name: "Dealership" })).toBeChecked();
    await within(dialog).findByRole("option", { name: "Chennai — Guindy" });
    expect(within(dialog).getByLabelText("Select dealer")).toHaveValue("unit-1");

    // Scoped, so the organisation-wide apps are not on offer (C27).
    expect(within(dialog).queryByRole("checkbox", { name: "CRM" })).not.toBeInTheDocument();
  });

  /*
   * The parameter is consumed once and scrubbed. Left in the address bar it
   * would reopen the dialog on every refresh and every Back, long after the
   * person dealt with it — the same reason signup scrubs `?code=`.
   */
  /*
   * Found by running it: Madurai is closed, and the panel was offering to staff
   * it. A closed dealership is not in the invite picker, so the link led to a
   * form that could not be submitted and an error demanding an answer the form
   * refused to offer.
   */
  it("does not offer to staff a closed dealership", async () => {
    mockFetchDealers.mockResolvedValue([
      GUINDY,
      dealer({ id: "unit-4", name: "Madurai — Ring Road", status: "disabled", user_count: 0 }),
    ]);

    renderRoute({ path: "/acme-motors/admin/dealers/unit-4", children: dealerRoutes });

    const panel = await screen.findByRole("complementary", { name: /Madurai/ });

    expect(within(panel).queryByRole("link", { name: /Invite this dealership/i })).not.toBeInTheDocument();
    expect(panel).toHaveTextContent(/Reopen the dealership before staffing it/i);
  });

  it("offers to staff an open one", async () => {
    mockFetchDealers.mockResolvedValue([dealer({ id: "unit-1", user_count: 0 })]);

    renderRoute({ path: "/acme-motors/admin/dealers/unit-1", children: dealerRoutes });

    const panel = await screen.findByRole("complementary", { name: /Guindy/ });

    expect(within(panel).getByRole("link", { name: /Invite this dealership/i })).toHaveAttribute(
      "href",
      "/acme-motors/admin/users?invite=unit-1",
    );
  });

  it("does not leave the parameter in the URL", async () => {
    // The ROUTER's location, not window.location — createMemoryRouter never
    // touches the latter, so asserting against it passes whatever the code does.
    const { router } = renderRoute({
      path: "/acme-motors/admin/users?invite=unit-1",
      children: routes,
    });

    await screen.findByRole("dialog");

    await waitFor(() => {
      expect(router.state.location.search).toBe("");
    });
  });
});

describe("editing somebody who belongs to one dealer", () => {
  it("removes the organisation-wide apps rather than disabling them", async () => {
    /*
     * C27 ENFORCED BY ABSENCE, which is stronger than by a disabled control.
     *
     * This test used to tick DMS, pick a dealership from a dropdown, and then
     * assert the CRM checkbox had gone grey. The edit form now asks scope
     * FIRST (C30) and the dealership branch offers no app list at all —
     * somebody at a dealership may hold DMS and Administration and nothing
     * else, so there is no choice of app left to present. A list where two of
     * three entries are permanently disabled is a question with one answer.
     *
     * The rule is unchanged and better guarded: there is no control to get
     * wrong.
     */
    const dialog = await openEditForm("anita", "Anita Fernandes");

    chooseScope(dialog, "Dealership");
    await chooseDealer(dialog, "Chennai — Guindy", "unit-1");

    expect(within(dialog).queryByRole("checkbox", { name: "CRM" })).not.toBeInTheDocument();
    // And DMS is not offered as a choice either — it is implied by the scope.
    expect(within(dialog).queryByRole("checkbox", { name: "DMS" })).not.toBeInTheDocument();
  });

  /*
   * REMOVING IS NEVER BLOCKED, only adding. Locking an app somebody already
   * holds would leave a forbidden record permanently unfixable — the form would
   * refuse the one edit that brings it into line, and an admin would have no
   * way to act on the backend's own error message.
   */
  it("still lets a forbidden combination be unwound", async () => {
    const dialog = await openEditForm("sanjay", "Sanjay Desai");

    const crm = within(dialog).getByRole("checkbox", { name: "CRM" });

    expect(crm).toBeChecked();
    expect(crm).not.toBeDisabled();

    fireEvent.click(crm);

    expect(crm).not.toBeChecked();
    // Now that it is gone it cannot come back while the dealer stands.
    expect(crm).toBeDisabled();
  });
});

describe("what an administrator may hand out", () => {
  /*
   * THE OWNER'S ONE-WAY DOOR, found by the owner on their own organisation.
   *
   * They edited themselves, unticked DMS, and DMS vanished from the form —
   * not only on their own record but on everybody's, because the checkbox list
   * was built from `visibleApps()`, the LAUNCHER's rule. That rule hides an app
   * you are subscribed to but cannot open, which is right for a launcher (C22:
   * listing it tells you what you are not trusted with) and a trap for a grant
   * form. An organisation paying for DMS could no longer give it to anyone,
   * with no error and nothing to click.
   *
   * C41 explicitly lets an owner "drop what they never open". It never meant
   * the door opens one way.
   *
   * An admin grants on behalf of the ORGANISATION, not out of their own
   * pocket, so the list is what the organisation subscribes to.
   */
  it("offers an app the organisation bought but the editor cannot open", async () => {
    const strippedOwner = membership({
      role: "owner",
      apps: [
        // Paid for, and this admin has given up their own access to it.
        appAccess("dms", { accessible: false, modules: [], permissions: [] }),
        appAccess("admin", {
          modules: ["users", "dealers", "roles"],
          permissions: ["admin.person.invite", "admin.person.update", "admin.role.view"],
        }),
      ],
    });
    mockFetchMe.mockResolvedValue(me({ memberships: [strippedOwner] }));

    const dialog = await openInviteForm();

    expect(within(dialog).getByRole("checkbox", { name: "DMS" })).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "DMS" })).not.toBeDisabled();
  });

  it("does not offer an app the organisation has not bought", async () => {
    /*
     * The other direction, and the reason this is not simply "offer
     * everything". C16 keeps `subscribed` and `accessible` as two facts; this
     * list is the first of them, and the backend refuses a grant for an
     * unsubscribed app regardless (C19).
     */
    const noCrm = membership({
      role: "owner",
      apps: [
        appAccess("dms", { modules: ["sales"], permissions: ["dms.enquiry.view"] }),
        appAccess("crm", { subscribed: false, accessible: false }),
        appAccess("admin", {
          modules: ["users", "dealers", "roles"],
          permissions: ["admin.person.invite", "admin.role.view"],
        }),
      ],
    });
    mockFetchMe.mockResolvedValue(me({ memberships: [noCrm] }));

    const dialog = await openInviteForm();

    expect(within(dialog).getByRole("checkbox", { name: "DMS" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox", { name: "CRM" })).not.toBeInTheDocument();
  });
});
