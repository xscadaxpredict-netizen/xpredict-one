/**
 * DMS settings -> Security & Controls -> Territory Management (the owner,
 * 2026-11-24): DMS's territory tree as a chart, a box's side panel, New
 * Territory and Edit on their own page, Close and Reopen.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@xpredict/api-client";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import {
  assignPeople,
  createTerritory,
  deleteTerritory,
  fetchDeletePreview,
  fetchTerritories,
  fetchTerritoryPeople,
  movePerson,
  removePerson,
  setTerritoryStatus,
  updateTerritory,
  type DmsTerritory,
  type TerritoryPerson,
} from "../../products/dms/app-settings/territories";
import { fetchDmsUsers, type AppUser } from "../../products/dms/app-settings/api";
import type * as territoriesApi from "../../products/dms/app-settings/territories";
import DmsSettingsRoutes from "../../products/dms/app-settings/routes";
import { useUiStore } from "../../stores/uiStore";
import { renderRoute } from "./harness";
import { me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

// The rules (kinds, what may sit under what) are real; only the calls are mocked.
vi.mock("../../products/dms/app-settings/territories", async (importOriginal) => ({
  ...(await importOriginal<typeof territoriesApi>()),
  fetchTerritories: vi.fn(),
  createTerritory: vi.fn(),
  updateTerritory: vi.fn(),
  setTerritoryStatus: vi.fn(),
  fetchTerritoryPeople: vi.fn(),
  assignPeople: vi.fn(),
  removePerson: vi.fn(),
  movePerson: vi.fn(),
  fetchDeletePreview: vi.fn(),
  deleteTerritory: vi.fn(),
}));

// Assign users lists DMS's users.
vi.mock("../../products/dms/app-settings/api", () => ({
  fetchDmsUsers: vi.fn(),
}));

vi.mock("../hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: [],
    readIds: new Set<string>(),
    unreadCount: 0,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  }),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchTerritories = vi.mocked(fetchTerritories);
const mockCreateTerritory = vi.mocked(createTerritory);
const mockUpdateTerritory = vi.mocked(updateTerritory);
const mockSetTerritoryStatus = vi.mocked(setTerritoryStatus);
const mockFetchPeople = vi.mocked(fetchTerritoryPeople);
const mockAssignPeople = vi.mocked(assignPeople);
const mockRemovePerson = vi.mocked(removePerson);
const mockMovePerson = vi.mocked(movePerson);
const mockFetchDmsUsers = vi.mocked(fetchDmsUsers);
const mockFetchDeletePreview = vi.mocked(fetchDeletePreview);
const mockDeleteTerritory = vi.mocked(deleteTerritory);

const GSTIN = "27AAPFU0939F1ZV";
const GSTIN_PAN = "AAPFU0939F";

/** The owner as `/me` really sends them: every DMS permission by rule (C72). */
function realOwner() {
  const owner = ownerMembership();
  return {
    ...owner,
    apps: owner.apps.map((app) =>
      app.key === "dms"
        ? {
            ...app,
            permissions: [
              ...app.permissions,
              "dms.territory.view",
              "dms.territory.create",
              "dms.territory.update",
              "dms.territory.set_status",
              "dms.territory.delete",
              "dms.user.view",
              "dms.user.update",
            ],
          }
        : app,
    ),
  };
}

function box(overrides: Partial<DmsTerritory>): DmsTerritory {
  return {
    id: "x",
    kind: "region",
    name: "",
    parent_id: "root",
    is_root: false,
    status: "active",
    code: null,
    gstin: "",
    pan: "",
    contact_person: "",
    email: "",
    phone: "",
    city: "",
    state: "",
    postal_code: "",
    people_count: 0,
    ...overrides,
  };
}

/** In tree order, as the server sends it. */
const TREE: DmsTerritory[] = [
  box({ id: "root", kind: "organisation", name: "Acme Motors", parent_id: null, is_root: true }),
  box({ id: "north", name: "North", people_count: 1 }),
  box({
    id: "delhi",
    kind: "dealer",
    name: "Delhi Motors",
    parent_id: "north",
    code: "DLM-01",
    gstin: GSTIN,
    pan: GSTIN_PAN,
    city: "New Delhi",
    people_count: 3,
  }),
  box({ id: "noida", kind: "branch", name: "Noida", parent_id: "delhi", people_count: 2 }),
  box({
    id: "jaipur",
    kind: "dealer",
    name: "Jaipur Motors",
    parent_id: "north",
    status: "disabled",
  }),
  box({ id: "south", name: "South" }),
];

const screens = [{ path: "dms/settings/*", element: <DmsSettingsRoutes /> }];
const PAGE = "/acme-motors/dms/settings/territories";

beforeEach(() => {
  mockFetchMe.mockReset();
  mockFetchTerritories.mockReset();
  mockCreateTerritory.mockReset();
  mockUpdateTerritory.mockReset();
  mockSetTerritoryStatus.mockReset();
  window.localStorage.clear();
  useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
  mockFetchMe.mockResolvedValue(me({ memberships: [realOwner()] }));
  mockFetchTerritories.mockResolvedValue(TREE);
  mockFetchPeople.mockReset();
  mockAssignPeople.mockReset();
  mockRemovePerson.mockReset();
  mockMovePerson.mockReset();
  mockFetchDmsUsers.mockReset();
});

/** A box: its accessible name starts with its kind, which the fold button's does not. */
function boxPattern(name: string) {
  return new RegExp(`^(Organisation|Region|Dealer|Branch|Warehouse) ${name}`);
}

function boxNamed(name: string) {
  return screen.getByRole("button", { name: boxPattern(name) });
}

async function showTree(path = PAGE) {
  const rendered = renderRoute({ path, children: screens });
  await screen.findByRole("button", { name: boxPattern("Delhi Motors") });
  return rendered;
}

describe("the tree", () => {
  it("draws the organisation at the top and every box with its kind and counts", async () => {
    await showTree();

    expect(screen.getByRole("heading", { name: "Territory Management" })).toBeInTheDocument();
    expect(boxNamed("Acme Motors")).toHaveTextContent("Organisation");
    expect(boxNamed("Acme Motors")).toHaveTextContent("5 below · 6 people");
    expect(boxNamed("North")).toHaveTextContent("Region");
    expect(boxNamed("North")).toHaveTextContent("3 below · 6 people");
    expect(boxNamed("Delhi Motors")).toHaveTextContent("1 below · 5 people");
    expect(boxNamed("Noida")).toHaveTextContent("2 people");
    // Not counting the organisation itself.
    expect(screen.getByText("5 territories")).toBeInTheDocument();
  });

  it("shows a closed territory as closed", async () => {
    await showTree();

    expect(boxNamed("Jaipur Motors")).toHaveTextContent("Closed");
    expect(boxNamed("Jaipur Motors")).toHaveAttribute("data-closed");
    expect(boxNamed("Delhi Motors")).not.toHaveAttribute("data-closed");
  });

  it("folds and unfolds what is under a box", async () => {
    await showTree();

    fireEvent.click(screen.getByRole("button", { name: "Fold North" }));
    expect(screen.queryByRole("button", { name: boxPattern("Delhi Motors") })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unfold North" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Unfold North" }));
    expect(boxNamed("Delhi Motors")).toBeInTheDocument();
  });

  it("collapses to the first level, and expands everything again", async () => {
    await showTree();

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(boxNamed("North")).toBeInTheDocument();
    expect(boxNamed("South")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: boxPattern("Delhi Motors") })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(boxNamed("Noida")).toBeInTheDocument();
  });

  it("is searched from the topbar, opening whatever hides a match", async () => {
    await showTree();
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));

    fireEvent.change(screen.getByPlaceholderText("Search territories"), {
      target: { value: "noida" },
    });

    expect(boxNamed("Noida")).toHaveAttribute("data-match");
    expect(boxNamed("Delhi Motors")).not.toHaveAttribute("data-match");
    expect(screen.getByText("1 match")).toBeInTheDocument();
  });
});

describe("a box's panel", () => {
  it("opens beside the tree at the box's own address, with its Basic Info", async () => {
    const { router } = await showTree();

    fireEvent.click(boxNamed("Delhi Motors"));

    await waitFor(() => expect(router.state.location.pathname).toBe(`${PAGE}/delhi`));
    const panel = await screen.findByRole("complementary", { name: "Delhi Motors" });
    expect(within(panel).getByText("Dealer · in North")).toBeInTheDocument();
    expect(within(panel).getByText(GSTIN)).toBeInTheDocument();
    expect(within(panel).getByText("DLM-01")).toBeInTheDocument();
    expect(within(panel).getByText("New Delhi")).toBeInTheDocument();
    expect(within(panel).getByText("2 more in the territory under it.")).toBeInTheDocument();
    expect(boxNamed("Delhi Motors")).toHaveAttribute("aria-current", "true");
  });

  it("offers nothing on the organisation itself", async () => {
    await showTree(`${PAGE}/root`);

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Acme Motors" }), {
      key: "Enter",
    });
    const menu = await screen.findByRole("menu");

    expect(within(menu).getByRole("menuitem", { name: "Edit" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(menu).getByRole("menuitem", { name: "Close" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("closes a territory after asking", async () => {
    mockSetTerritoryStatus.mockResolvedValue({ ...TREE[1]!, status: "disabled" });
    await showTree(`${PAGE}/north`);

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for North" }), {
      key: "Enter",
    });
    fireEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Close" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Close North?" });
    expect(mockSetTerritoryStatus).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(mockSetTerritoryStatus).toHaveBeenCalledWith("acme-motors", "north", "close"),
    );
  });

  it("reopens a closed territory straight away", async () => {
    mockSetTerritoryStatus.mockResolvedValue({ ...TREE[4]!, status: "active" });
    await showTree(`${PAGE}/jaipur`);

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Jaipur Motors" }), {
      key: "Enter",
    });
    fireEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Reopen" }),
    );

    await waitFor(() =>
      expect(mockSetTerritoryStatus).toHaveBeenCalledWith("acme-motors", "jaipur", "reopen"),
    );
  });

  it("goes to the Edit page from the ⋮", async () => {
    const { router } = await showTree(`${PAGE}/delhi`);

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Delhi Motors" }), {
      key: "Enter",
    });
    fireEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Edit" }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`${PAGE}/delhi/edit`));
    expect(await screen.findByRole("heading", { name: "Edit territory" })).toBeInTheDocument();
  });
});

describe("New Territory", () => {
  async function openNew() {
    const rendered = renderRoute({ path: `${PAGE}/new`, children: screens });
    await screen.findByRole("heading", { name: "New Territory" });
    await screen.findByRole("option", { name: /Acme Motors/ });
    return rendered;
  }

  function parentOptions() {
    return within(screen.getByLabelText(/Parent territory/))
      .getAllByRole("option")
      .map((option) => option.textContent);
  }

  it("offers only the places the kind may sit", async () => {
    await openNew();

    // A dealer: the organisation or a region.
    expect(parentOptions()).toEqual([
      "Acme Motors (Organisation)",
      "North (Region)",
      "South (Region)",
    ]);

    fireEvent.change(screen.getByLabelText(/Kind/), { target: { value: "branch" } });

    // A branch: inside a dealer only -- the closed one says so.
    expect(parentOptions()).toEqual([
      "Delhi Motors (Dealer)",
      "Jaipur Motors (Dealer, closed)",
    ]);
  });

  it("takes the PAN from the GSTIN", async () => {
    await openNew();

    fireEvent.change(screen.getByLabelText(/GSTIN/), { target: { value: GSTIN.toLowerCase() } });

    expect(screen.getByLabelText(/PAN/)).toHaveValue(GSTIN_PAN);
  });

  it("will not send a dealer with no GSTIN", async () => {
    await openNew();
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Chandigarh Auto" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("A dealer needs its GSTIN.", { selector: "p[id]" })).toBeInTheDocument();
    expect(mockCreateTerritory).not.toHaveBeenCalled();
  });

  it("saves and opens the new box beside the tree", async () => {
    mockCreateTerritory.mockResolvedValue(
      box({ id: "chd", kind: "dealer", name: "Chandigarh Auto", parent_id: "north" }),
    );
    const { router } = await openNew();

    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: " Chandigarh Auto " } });
    fireEvent.change(screen.getByLabelText(/Parent territory/), { target: { value: "north" } });
    fireEvent.change(screen.getByLabelText(/Code/), { target: { value: "CHA-01" } });
    fireEvent.change(screen.getByLabelText(/GSTIN/), { target: { value: GSTIN } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: "Chandigarh" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockCreateTerritory).toHaveBeenCalledWith("acme-motors", {
        kind: "dealer",
        parent_id: "north",
        name: "Chandigarh Auto",
        code: "CHA-01",
        gstin: GSTIN,
        pan: GSTIN_PAN,
        contact_person: "",
        email: "",
        phone: "",
        city: "Chandigarh",
        state: "",
        postal_code: "",
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(`${PAGE}/chd`));
  });

  it("shows the server's refusal on the field it names", async () => {
    mockCreateTerritory.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Unprocessable",
        status: 422,
        detail: "The submitted data is not valid.",
        code: "validation_failed",
        trace_id: "t-1",
        errors: [{ field: "email", code: "invalid", detail: "Enter a valid email address." }],
      }),
    );
    await openNew();
    fireEvent.change(screen.getByLabelText(/Kind/), { target: { value: "region" } });
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "East" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("says a name already in use above the form", async () => {
    mockCreateTerritory.mockRejectedValue(
      new ApiError({
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "Another territory already uses that name.",
        code: "territory_name_taken",
        trace_id: "t-1",
      }),
    );
    await openNew();
    fireEvent.change(screen.getByLabelText(/Kind/), { target: { value: "region" } });
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "North" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Another territory already uses that name.")).toBeInTheDocument();
  });
});

describe("Edit territory", () => {
  it("fills the form, shows the kind without changing it, and saves the details", async () => {
    mockUpdateTerritory.mockResolvedValue({ ...TREE[2]!, name: "Delhi Motors Ltd" });
    const { router } = renderRoute({ path: `${PAGE}/delhi/edit`, children: screens });

    const name = await screen.findByLabelText(/Name/);
    expect(name).toHaveValue("Delhi Motors");
    expect(screen.getByLabelText(/GSTIN/)).toHaveValue(GSTIN);
    // The kind is shown, not offered: the only box is the parent territory.
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.getByLabelText(/Parent territory/)).toHaveValue("north");

    fireEvent.change(name, { target: { value: "Delhi Motors Ltd" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mockUpdateTerritory).toHaveBeenCalledWith("acme-motors", "delhi", {
        name: "Delhi Motors Ltd",
        code: "DLM-01",
        gstin: GSTIN,
        pan: GSTIN_PAN,
        contact_person: "",
        email: "",
        phone: "",
        city: "New Delhi",
        state: "",
        postal_code: "",
        parent_id: "north",
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(`${PAGE}/delhi`));
  });

  it("moves it by choosing another parent territory, never itself or below it", async () => {
    mockUpdateTerritory.mockResolvedValue({ ...TREE[2]!, parent_id: "root" });
    renderRoute({ path: `${PAGE}/delhi/edit`, children: screens });
    const parent = await screen.findByLabelText(/Parent territory/);

    // A dealer's parent: the organisation or a region -- not Delhi or Noida.
    expect(
      within(parent)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Acme Motors (Organisation)", "North (Region)", "South (Region)"]);
    expect(screen.getByText(/Changing it moves Delhi Motors and everything under it/)).toBeInTheDocument();

    fireEvent.change(parent, { target: { value: "south" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mockUpdateTerritory).toHaveBeenCalledWith(
        "acme-motors",
        "delhi",
        expect.objectContaining({ parent_id: "south" }),
      ),
    );
  });

  it("does not edit the organisation itself", async () => {
    renderRoute({ path: `${PAGE}/root/edit`, children: screens });

    expect(
      await screen.findByText(/This is the organisation itself/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });
});

// --- A territory's People tab (2026-11-24) -------------------------------------------

function personAt(overrides: Partial<TerritoryPerson>): TerritoryPerson {
  return {
    id: "p",
    first_name: "",
    last_name: "",
    email: "p@acme.test",
    role: { code: "dms.manager", name: "Manager" },
    other_places: [],
    access_status: "active",
    other_apps: [],
    ...overrides,
  };
}

const AT_DELHI: TerritoryPerson[] = [
  personAt({ id: "ravi", first_name: "Ravi", last_name: "Sharma", email: "ravi@acme.test" }),
  personAt({
    id: "priya",
    first_name: "Priya",
    last_name: "Mehta",
    email: "priya@acme.test",
    role: { code: "dms.sales_representative", name: "Sales representative" },
    other_places: ["Jaipur Motors"],
  }),
];

function dmsUser(overrides: Partial<AppUser>): AppUser {
  return {
    id: "u",
    first_name: "",
    last_name: "",
    email: "u@acme.test",
    is_owner: false,
    role: { code: "dms.technician", name: "Technician" },
    territories: [],
    places: [],
    other_apps: [],
    status: "active",
    access_status: "active",
    ...overrides,
  };
}

const DMS_USERS: AppUser[] = [
  dmsUser({ id: "owner", first_name: "Asha", last_name: "Rao", is_owner: true, role: null }),
  dmsUser({ id: "ravi", first_name: "Ravi", last_name: "Sharma", places: [{ id: "delhi", name: "Delhi Motors" }] }),
  dmsUser({ id: "arjun", first_name: "Arjun", last_name: "Kumar" }),
  dmsUser({ id: "meera", first_name: "Meera", last_name: "Iyer", places: [{ id: "jaipur", name: "Jaipur Motors" }] }),
  dmsUser({ id: "mehul", first_name: "Mehul", last_name: "E", status: "pending", access_status: null }),
  dmsUser({ id: "nish", first_name: "Nishanth", last_name: "S", other_apps: ["the Admin panel"] }),
];

async function openPeople() {
  mockFetchPeople.mockResolvedValue(AT_DELHI);
  const rendered = await showTree(`${PAGE}/delhi`);
  const panel = await screen.findByRole("complementary", { name: "Delhi Motors" });
  fireEvent.click(within(panel).getByRole("tab", { name: /People/ }));
  await within(panel).findByText("Ravi Sharma");
  return { ...rendered, panel };
}

describe("a territory's People tab", () => {
  it("lists who works here, with their role and where else", async () => {
    const { panel } = await openPeople();

    expect(within(panel).getByRole("tab", { name: "People (3)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(mockFetchPeople).toHaveBeenCalledWith("acme-motors", "delhi");
    const list = within(panel).getByRole("list", { name: "People at Delhi Motors" });
    expect(within(list).getByText("Sales representative")).toBeInTheDocument();
    expect(within(list).getByText(/also at Jaipur Motors/)).toBeInTheDocument();
    expect(
      within(panel).getByText("Placed at Delhi Motors. They see its records and everything under it."),
    ).toBeInTheDocument();
    // Noida's two people.
    expect(within(panel).getByText(/2 more people work in the territories under it/)).toBeInTheDocument();
  });

  it("assigns DMS users, greying who is here already and who has not joined", async () => {
    mockFetchDmsUsers.mockResolvedValue(DMS_USERS);
    mockAssignPeople.mockResolvedValue(AT_DELHI);
    const { panel } = await openPeople();

    fireEvent.click(within(panel).getByRole("button", { name: "+ Assign users" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign users" });
    await within(dialog).findByText("Arjun Kumar");

    // Never the owner; no role field, no "current place" choice.
    expect(within(dialog).queryByText("Asha Rao")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: /Ravi Sharma/ })).toBeDisabled();
    expect(within(dialog).getByText("Already at Delhi Motors")).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: /Mehul E/ })).toBeDisabled();
    expect(within(dialog).getByText(/Technician · at Jaipur Motors/)).toBeInTheDocument();
    // A territory's people hold DMS only (2026-11-24).
    expect(within(dialog).getByRole("checkbox", { name: /Nishanth S/ })).toBeDisabled();
    expect(
      within(dialog).getByText("Also holds the Admin panel — remove it in the Admin panel first"),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Arjun Kumar/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Meera Iyer/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign (2)" }));

    await waitFor(() =>
      expect(mockAssignPeople).toHaveBeenCalledWith("acme-motors", "delhi", ["arjun", "meera"]),
    );
  });

  it("removes somebody from their only place after saying what that means", async () => {
    mockRemovePerson.mockResolvedValue(undefined);
    await openPeople();

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Ravi Sharma" }), {
      key: "Enter",
    });
    fireEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", {
        name: "Remove from territory",
      }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Remove Ravi Sharma from Delhi Motors?",
    });
    expect(within(dialog).getByText(/see no DMS records until/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(mockRemovePerson).toHaveBeenCalledWith("acme-motors", "delhi", "ravi"),
    );
  });

  it("moves somebody to another territory", async () => {
    mockMovePerson.mockResolvedValue(undefined);
    await openPeople();

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Priya Mehta" }), {
      key: "Enter",
    });
    fireEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", {
        name: "Move to another territory",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Move Priya Mehta" });
    // Anywhere but here.
    expect(within(dialog).queryByRole("option", { name: /^Delhi Motors/ })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Move to"), { target: { value: "south" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Move" }));

    await waitFor(() =>
      expect(mockMovePerson).toHaveBeenCalledWith("acme-motors", "delhi", "priya", "south"),
    );
  });
});

describe("a territory's people hold DMS only", () => {
  it("lets somebody holding another app be assigned to the organisation", async () => {
    mockFetchDmsUsers.mockResolvedValue(DMS_USERS);
    mockFetchPeople.mockResolvedValue([]);
    await showTree(`${PAGE}/root`);
    const panel = await screen.findByRole("complementary", { name: "Acme Motors" });
    fireEvent.click(within(panel).getByRole("tab", { name: /People/ }));

    fireEvent.click(await within(panel).findByRole("button", { name: "+ Assign users" }));
    const dialog = await screen.findByRole("dialog", { name: "Assign users" });
    await within(dialog).findByText("Nishanth S");

    expect(within(dialog).getByRole("checkbox", { name: /Nishanth S/ })).toBeEnabled();
  });

  it("offers only the organisation in Move to somebody holding another app", async () => {
    mockFetchPeople.mockResolvedValue([
      personAt({
        id: "nish",
        first_name: "Nishanth",
        last_name: "S",
        email: "nish@acme.test",
        other_apps: ["the Admin panel"],
      }),
    ]);
    await showTree(`${PAGE}/root`);
    const panel = await screen.findByRole("complementary", { name: "Acme Motors" });
    fireEvent.click(within(panel).getByRole("tab", { name: /People/ }));
    await within(panel).findByText("Nishanth S");

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Nishanth S" }), {
      key: "Enter",
    });
    fireEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", {
        name: "Move to another territory",
      }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Move Nishanth S" });

    expect(within(dialog).getByRole("option", { name: /North \(Region\)/ })).toBeDisabled();
    expect(within(dialog).getByText(/can be placed only at the organisation/)).toBeInTheDocument();
  });
});

describe("Delete territory", () => {
  it("is greyed while territories sit under it, and says why", async () => {
    await showTree(`${PAGE}/north`);

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for North" }), {
      key: "Enter",
    });
    const menu = await screen.findByRole("menu");

    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(within(menu).getByText(/first move or delete the territories under it/)).toBeInTheDocument();
  });

  it("transfers its records and people to the chosen territory, then goes back to the tree", async () => {
    mockFetchDeletePreview.mockResolvedValue({ records: 12, people: 2, children: 0 });
    mockDeleteTerritory.mockResolvedValue(undefined);
    const { router } = await showTree(`${PAGE}/noida`);

    fireEvent.keyDown(screen.getByRole("button", { name: "More actions for Noida" }), {
      key: "Enter",
    });
    fireEvent.click(
      within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Delete" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Delete Noida?" });

    expect(
      await within(dialog).findByText(/12 DMS records and 2 people work at Noida/),
    ).toBeInTheDocument();
    // Nothing chosen yet: nothing to confirm.
    expect(within(dialog).getByRole("button", { name: "Delete" })).toBeDisabled();
    // Anywhere but itself; no dashes.
    expect(within(dialog).getByRole("option", { name: "Delhi Motors (Dealer)" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("option", { name: /^Noida/ })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Transfer to"), { target: { value: "delhi" } });
    expect(within(dialog).getByText(/This cannot be undone/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(mockDeleteTerritory).toHaveBeenCalledWith("acme-motors", "noida", "delhi"),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(PAGE));
  });
});
