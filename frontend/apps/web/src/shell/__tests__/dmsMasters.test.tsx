/**
 * DMS settings -> Masters (the owner, 2026-11-25): Load Master Data's tabs,
 * moved behind the gear and drawn in the shared list format.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import type * as enquiriesApi from "../../products/dms/sales/api/enquiries";
import DmsSettingsRoutes from "../../products/dms/app-settings/routes";
import { useUiStore } from "../../stores/uiStore";
import { renderRoute } from "./harness";
import { me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../products/dms/sales/api/enquiries", async (importOriginal) => ({
  ...(await importOriginal<typeof enquiriesApi>()),
  fetchBanks: vi.fn().mockResolvedValue([
    {
      id: "b1",
      unit_id: null,
      is_org_bank: true,
      bank_name: "Head Office Bank",
      account_no: "000111",
      ifsc_code: "HOBK0001",
      branch_name: "Main",
      is_default: true,
    },
    {
      id: "b2",
      unit_id: "dealer-1",
      is_org_bank: false,
      bank_name: "Dealer Bank",
      account_no: "000222",
      ifsc_code: "DLBK0002",
    },
  ]),
  fetchProductPresets: vi.fn().mockResolvedValue([
    {
      id: "p1",
      unit_id: null,
      is_global: true,
      type: "NORMAL",
      name: "STP Machine",
      description: "Packaged sewage treatment",
      hsn: "842121",
      base_price: 100000,
      margin: 10,
      gst_rate: 18,
      specs: ["10 KLD"],
    },
  ]),
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

const screens = [
  { path: "dms/settings/*", element: <DmsSettingsRoutes /> },
  { path: "dms/*", element: <p>DMS home</p> },
];

beforeEach(() => {
  vi.mocked(fetchMe).mockResolvedValue(me({ memberships: [ownerMembership()] }));
  window.localStorage.clear();
  useUiStore.setState({ openSettingsModule: {}, isSidebarCollapsed: false });
});

describe("Masters in the list format", () => {
  it("lists bank accounts in a table, with who each belongs to and a ⋮", async () => {
    renderRoute({ path: "/acme-motors/dms/settings/bank-accounts", children: screens });

    const table = await screen.findByRole("table");
    const head = within(table).getByRole("rowheader", { name: /Head Office Bank/ });
    expect(within(head).getByText("Default")).toBeInTheDocument();
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByText("Organisation")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Dealership")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More actions for Dealer Bank" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Bank Account/ })).toBeInTheDocument();
  });

  it("opens a product beside the catalog at its own address", async () => {
    renderRoute({ path: "/acme-motors/dms/settings/product-catalog/p1", children: screens });

    expect(await screen.findByRole("heading", { level: 2, name: "STP Machine" })).toBeInTheDocument();
    const details = screen.getByRole("tabpanel");
    expect(within(details).getByText("842121")).toBeInTheDocument();
    expect(within(details).getByText("10 KLD")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "STP Machine" })).toHaveAttribute("aria-current", "page");
  });
});
