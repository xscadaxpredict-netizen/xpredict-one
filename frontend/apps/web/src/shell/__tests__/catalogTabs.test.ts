/**
 * The tabs in the app catalogue (C79): a sub-module's tabs are written once,
 * on its item in `navigation.ts`, and its page draws them from there.
 */

import { describe, expect, it } from "vitest";

import { tabsOf } from "../navigation";
import { ADMIN_PANEL_TREE } from "./factories";

describe("tabsOf", () => {
  it("gives Admins and Roles its three tabs, in order, with their sections", () => {
    expect(tabsOf("admin", "admins-and-roles")).toEqual([
      { label: "Admins", path: "", section: "admin" },
      { label: "App Admins", path: "app-admins", section: "app_admin", comingSoon: true },
      { label: "Roles", path: "roles", section: "role" },
    ]);
  });

  it("matches the tabs of the tree `/me` sends, section for section", () => {
    const fromMe = ADMIN_PANEL_TREE.flatMap((module) => module.sub_modules).find(
      (sub) => sub.code === "admins_and_roles",
    )?.tabs;

    expect(tabsOf("admin", "admins-and-roles").map((tab) => tab.section)).toEqual(fromMe);
  });

  it("refuses a page with no tabs rather than drawing an empty row", () => {
    expect(() => tabsOf("admin", "users")).toThrow(/No tabs/);
    expect(() => tabsOf("admin", "no-such-page")).toThrow(/No tabs/);
  });
});
