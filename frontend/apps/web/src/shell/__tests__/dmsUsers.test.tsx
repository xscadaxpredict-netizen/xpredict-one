/**
 * DMS settings -> Users & Roles -> Users (the owner, 2026-11-23): everybody who
 * holds DMS, in the Admin panel's list format, the owner first and always.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { fetchDmsUsers, type AppUser } from "../../products/dms/app-settings/api";
import DmsSettingsRoutes from "../../products/dms/app-settings/routes";
import { useUiStore } from "../../stores/uiStore";
import { renderRoute } from "./harness";
import { me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../products/dms/app-settings/api", () => ({ fetchDmsUsers: vi.fn() }));

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
const mockFetchDmsUsers = vi.mocked(fetchDmsUsers);

const screens = [{ path: "dms/settings/*", element: <DmsSettingsRoutes /> }];
const PAGE = "/acme-motors/dms/settings/users";

function person(overrides: Partial<AppUser>): AppUser {
  return {
    id: "m-1",
    first_name: "",
    last_name: "",
    email: "someone@acme.test",
    is_owner: false,
    role: { code: "dms.manager", name: "Manager" },
    territories: [],
    status: "active",
    ...overrides,
  };
}

const PEOPLE: AppUser[] = [
  person({
    id: "owner",
    first_name: "Asha",
    last_name: "Rao",
    email: "asha@acme.test",
    is_owner: true,
    role: null,
  }),
  person({
    id: "nish",
    first_name: "Nishanth",
    last_name: "K",
    email: "nish@acme.test",
    role: { code: "dms.sales_representative", name: "Sales representative" },
    territories: ["Chennai — Guindy"],
  }),
  person({
    id: "off",
    first_name: "Ravi",
    last_name: "S",
    email: "ravi@acme.test",
    territories: ["Delhi East"],
    status: "inactive",
  }),
  person({
    id: "inv",
    first_name: "Priya",
    last_name: "M",
    email: "priya@acme.test",
    role: { code: "dms.technician", name: "Technician" },
    status: "pending",
  }),
];

function rows() {
  // The first row is the headings.
  return screen.getAllByRole("row").slice(1);
}

function cellsOf(row: HTMLElement) {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
}

beforeEach(() => {
  mockFetchMe.mockReset();
  mockFetchDmsUsers.mockReset();
  window.localStorage.clear();
  useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
});

describe("DMS users", () => {
  it("lists everybody who holds DMS, the owner first as Owner, everywhere", async () => {
    mockFetchDmsUsers.mockResolvedValue(PEOPLE);

    renderRoute({ path: PAGE, children: screens });

    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    const [owner, nish, ravi, priya] = rows();

    expect(within(owner!).getByText("Owner", { selector: "span" })).toBeInTheDocument();
    expect(cellsOf(owner!)).toEqual(["Owner", "All", "Active", ""]);
    expect(cellsOf(nish!)).toEqual(["Sales representative", "Chennai — Guindy", "Active", ""]);
    expect(cellsOf(ravi!)).toEqual(["Manager", "Delhi East", "Inactive", ""]);
    // Pending: not placed yet, so no territory.
    expect(cellsOf(priya!)).toEqual(["Technician", "—", "Pending", ""]);
    expect(screen.getByText("4 users")).toBeInTheDocument();
  });

  it("filters by status", async () => {
    mockFetchDmsUsers.mockResolvedValue(PEOPLE);

    renderRoute({ path: PAGE, children: screens });
    await screen.findByText("Asha Rao");

    fireEvent.change(screen.getByRole("combobox", { name: "Show" }), {
      target: { value: "pending" },
    });

    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Priya M")).toBeInTheDocument();
    expect(screen.getByText("1 user")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Show" }), {
      target: { value: "inactive" },
    });
    expect(screen.getByText("Ravi S")).toBeInTheDocument();
    expect(screen.queryByText("Asha Rao")).not.toBeInTheDocument();
  });

  it("is searched from the topbar, by name or email", async () => {
    mockFetchDmsUsers.mockResolvedValue(PEOPLE);

    renderRoute({ path: PAGE, children: screens });
    await screen.findByText("Asha Rao");

    const search = screen.getByPlaceholderText("Search users");
    fireEvent.change(search, { target: { value: "nish@" } });
    expect(rows()).toHaveLength(1);
    expect(screen.getByText("Nishanth K")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "nobody" } });
    expect(screen.getByText("No users match “nobody”.")).toBeInTheDocument();
  });

  it("draws Invite User and each ⋮, greyed out, for now", async () => {
    mockFetchDmsUsers.mockResolvedValue(PEOPLE);

    renderRoute({ path: PAGE, children: screens });
    await screen.findByText("Asha Rao");

    expect(screen.getByRole("button", { name: /Invite User/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("button", { name: "More actions for Asha Rao" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("says so, with a retry, when the list cannot load", async () => {
    mockFetchDmsUsers.mockRejectedValue(new Error("boom"));

    renderRoute({ path: PAGE, children: screens });

    expect(await screen.findByText("Could not load users")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again|retry/i })).toBeInTheDocument();
  });
});
