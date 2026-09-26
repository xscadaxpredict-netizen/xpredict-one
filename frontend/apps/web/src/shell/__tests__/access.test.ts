/**
 * Privilege tests for the access rules (CLAUDE.md: "Privilege tests").
 *
 * These are unit tests of `accessFor`, which is the single function the
 * sidebar, the route guard and every button ask. If it is wrong, all three are
 * wrong in the same direction — which is exactly why it is one function and
 * exactly why it is tested on its own.
 */

import { describe, expect, it } from "vitest";

import { accessFor } from "../access";
import {
  appAccess,
  dealerAdminMembership,
  membership,
  ownerMembership,
  salespersonMembership,
} from "./factories";

describe("accessFor", () => {
  it("grants the modules and permissions the server sent", () => {
    const access = accessFor(salespersonMembership(), "dms");

    expect(access.hasModule("sales")).toBe(true);
    expect(access.can("dms.enquiry.create")).toBe(true);
  });

  it("refuses a module the server did not send", () => {
    const access = accessFor(salespersonMembership(), "dms");

    expect(access.hasModule("service")).toBe(false);
    expect(access.hasModule("tech-support")).toBe(false);
    // The dealer-settings area is a dealer ADMIN's job, not a salesperson's.
    expect(access.hasModule("settings")).toBe(false);
  });

  it("refuses a permission the server did not send", () => {
    const access = accessFor(salespersonMembership(), "dms");

    expect(access.can("dms.enquiry.delete")).toBe(false);
    expect(access.can("dms.unit.manage_people")).toBe(false);
  });

  /*
   * The important negative case. A salesperson is not an administrator, and
   * the launcher already hides the app — but hiding is not refusing, and this
   * is the function everything else trusts.
   */
  it("grants nothing for an app the person cannot access", () => {
    const access = accessFor(salespersonMembership(), "admin");

    expect(access.hasModule("users")).toBe(false);
    expect(access.can("org.person.invite")).toBe(false);
    expect(access.permissions).toEqual([]);
  });

  it("grants nothing for an app the organisation has not subscribed to", () => {
    // Even with modules and permissions attached: an unpaid app grants nothing,
    // so a stale grant left on a cancelled subscription cannot be used.
    const stale = membership({
      apps: [
        appAccess("ecommerce", {
          subscribed: false,
          accessible: true,
          modules: ["storefront"],
          permissions: ["ecommerce.order.refund"],
        }),
      ],
    });

    const access = accessFor(stale, "ecommerce");

    expect(access.hasModule("storefront")).toBe(false);
    expect(access.can("ecommerce.order.refund")).toBe(false);
  });

  it("grants nothing for an app that is not in the membership at all", () => {
    expect(accessFor(salespersonMembership(), "nonexistent").can("anything")).toBe(false);
  });

  /*
   * The launcher. No app is open, so nothing is granted — rather than the
   * previous app's rules lingering while the tiles are on screen.
   */
  it("grants nothing when no app is open", () => {
    const access = accessFor(ownerMembership(), undefined);

    expect(access.hasModule("sales")).toBe(false);
    expect(access.can("dms.enquiry.create")).toBe(false);
  });

  it("fails closed on an empty membership", () => {
    const access = accessFor(membership({ apps: [] }), "dms");

    expect(access.modules).toEqual([]);
    expect(access.hasModule("sales")).toBe(false);
  });

  /*
   * A dealer admin (C23). Administration is open to them, but only its Users
   * module — the organisation's dealers, roles and billing are not theirs.
   * This is the case where "has the app" and "may do everything in it" come
   * apart, which is the whole reason modules exist alongside apps.
   */
  describe("a dealer admin", () => {
    it("can open Administration", () => {
      expect(accessFor(dealerAdminMembership(), "admin").hasModule("users")).toBe(true);
    });

    it("cannot reach the organisation's own screens inside it", () => {
      const access = accessFor(dealerAdminMembership(), "admin");

      expect(access.hasModule("dealers")).toBe(false);
      expect(access.hasModule("roles")).toBe(false);
      expect(access.hasModule("billing")).toBe(false);
      expect(access.hasModule("audit")).toBe(false);
    });

    it("has a dealer on their membership, which is what narrows them", () => {
      const membershipUnderTest = dealerAdminMembership();

      // The frontend reads this to decide it is showing the dealer view; the
      // backend reads the same field to decide what the list contains.
      expect(membershipUnderTest.unit_id).toBe("unit-2");
      expect(membershipUnderTest.unit_name).toBe("Bangalore — Whitefield");
    });

    it("is distinguishable from an organisation admin by exactly that", () => {
      expect(ownerMembership().unit_id).toBeNull();
    });
  });

  it("gives an owner their whole app", () => {
    const access = accessFor(ownerMembership(), "dms");

    expect(access.hasModule("sales")).toBe(true);
    expect(access.hasModule("tech-support")).toBe(true);
    expect(access.hasModule("settings")).toBe(true);
  });
});
