/**
 * GSTIN and PAN on a dealership: the check digit, and the PAN that fills
 * itself in.
 *
 * TWO LAYERS, TESTED SEPARATELY ON PURPOSE. `gstin.ts` is arithmetic and takes
 * no time to exercise exhaustively; the form is where the derivation lives and
 * where somebody can actually be confused by it. Mixing the two would mean
 * driving a dialog to prove a modulo.
 *
 * WHAT IS *NOT* HERE. This does not test that an invalid GSTIN is refused by
 * the server -- `core/organizations/tests/test_dealers_api.py` does, and it is
 * the one that decides (C19: the browser mirrors the backend and is never the
 * source). What these tests pin is that somebody learns about a typo while
 * they are still looking at the field instead of after a round trip.
 *
 * THE DERIVATION IS THE PART THAT WILL BREAK. It depends on React Hook Form's
 * `dirtyFields` to know whether the person has taken the PAN over by hand, and
 * that is exactly the kind of coupling that survives a library upgrade in
 * appearance only -- the field still renders, it just stops following the
 * GSTIN, and nothing says so. Hence a test per direction.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type * as dealersApi from "../admin/api/dealers";
import { createDealer, fetchDealers, updateDealer } from "../admin/api/dealers";
import { DealersScreen } from "../admin/screens/DealersScreen";
import { fetchMe } from "../api/auth";
import type * as authApi from "../api/auth";
import { extractPan, gstinCheckCharacter, isValidGstin, isValidPan } from "../admin/gstin";
import { renderRoute } from "./harness";
import { me, ownerMembership } from "./factories";

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof authApi>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../admin/api/dealers", async (importOriginal) => ({
  ...(await importOriginal<typeof dealersApi>()),
  fetchDealers: vi.fn(),
  createDealer: vi.fn(),
  updateDealer: vi.fn(),
}));

const mockFetchMe = vi.mocked(fetchMe);
const mockFetchDealers = vi.mocked(fetchDealers);
const mockCreateDealer = vi.mocked(createDealer);
const mockUpdateDealer = vi.mocked(updateDealer);

/*
 * REAL GSTINs. There is no such thing as a made-up one that validates, so a
 * fixture with an invented number would be refused by the form under test and
 * every assertion below would fail for the wrong reason.
 */
const GSTIN = "33AAPFU0939F1Z2";
const GSTIN_PAN = "AAPFU0939F";
const OTHER_GSTIN = "29AAGCB7383J1Z4";
const OTHER_GSTIN_PAN = "AAGCB7383J";

function dealer(overrides: Partial<dealersApi.Dealer> & { id: string }): dealersApi.Dealer {
  return {
    name: "Chennai — Guindy",
    code: "CHN-GUI",
    gstin: GSTIN,
    pan: GSTIN_PAN,
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

const dealerRoutes = [
  { path: "admin/dealers", element: <DealersScreen /> },
  { path: "admin/dealers/:dealerId", element: <DealersScreen /> },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchMe.mockResolvedValue(me({ memberships: [ownerMembership()] }));
  mockFetchDealers.mockResolvedValue([dealer({ id: "unit-1" })]);
  mockCreateDealer.mockResolvedValue(dealer({ id: "unit-new" }));
  mockUpdateDealer.mockResolvedValue(dealer({ id: "unit-1" }));
});

async function openAddDealer() {
  renderRoute({ path: "/acme-motors/admin/dealers", children: dealerRoutes });
  fireEvent.click(await screen.findByRole("button", { name: /Add dealer/ }));
  return screen.findByRole("dialog");
}

/** Fills everything except the two identifiers, which each test sets itself. */
function fillTheRest(dialog: HTMLElement) {
  const type = (label: RegExp, value: string) => {
    fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  };

  type(/Dealership name/, "Madurai — Ring Road");
  type(/Contact person/, "Sanjay Desai");
  type(/Registered email/, "madurai@acmemotors.in");
  type(/Mobile \/ phone/, "+91 452 234 9900");
  type(/^City/, "Madurai");
  type(/^State/, "Tamil Nadu");
  type(/Postal \/ ZIP/, "625010");
}

// `getByLabelText` already narrows to HTMLInputElement here, so an assertion
// would be a cast that changes nothing -- which the lint rule says, correctly.
function gstinField(dialog: HTMLElement) {
  return within(dialog).getByLabelText<HTMLInputElement>(/GSTIN/);
}

function panField(dialog: HTMLElement) {
  return within(dialog).getByLabelText<HTMLInputElement>(/^PAN/);
}

describe("the GSTIN check digit", () => {
  it("accepts a real GSTIN", () => {
    expect(isValidGstin(GSTIN)).toBe(true);
    expect(isValidGstin(OTHER_GSTIN)).toBe(true);
  });

  it("computes the same check character the number carries", () => {
    expect(gstinCheckCharacter(GSTIN.slice(0, 14))).toBe(GSTIN[14]);
  });

  it("refuses every single-character change to a valid one", () => {
    /*
     * THE PROPERTY THAT MATTERS, and the reason the checksum is worth having
     * at all: a format check passes every one of these. Luhn mod 36 catches
     * the lot, so this asserts none slip through rather than counting how many.
     */
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const accepted: string[] = [];

    for (let i = 0; i < GSTIN.length; i += 1) {
      for (const replacement of alphabet) {
        if (replacement === GSTIN[i]) continue;

        const mutated = GSTIN.slice(0, i) + replacement + GSTIN.slice(i + 1);
        if (isValidGstin(mutated)) accepted.push(mutated);
      }
    }

    expect(accepted).toEqual([]);
  });

  it("refuses a malformed one without throwing", () => {
    for (const value of ["", "NOT-A-GSTIN", "33AAPFU0939F1Z", "33aapfu0939f1z2"]) {
      expect(isValidGstin(value)).toBe(false);
    }
  });

  it("extracts the PAN, and nothing from a half-typed number", () => {
    expect(extractPan(GSTIN)).toBe(GSTIN_PAN);
    expect(isValidPan(extractPan(GSTIN))).toBe(true);
    // Every intermediate value while somebody types is invalid, and a hopeful
    // slice would prefill the PAN with four characters of nonsense.
    expect(extractPan("33AAPFU")).toBe("");
    expect(extractPan("33AAPFU0939F1ZX")).toBe("");
  });
});

describe("the PAN fills itself in from the GSTIN", () => {
  it("derives it as soon as the GSTIN is complete", async () => {
    const dialog = await openAddDealer();

    fireEvent.change(gstinField(dialog), { target: { value: GSTIN } });

    await waitFor(() => {
      expect(panField(dialog).value).toBe(GSTIN_PAN);
    });
  });

  it("writes nothing while the GSTIN is still half-typed", async () => {
    const dialog = await openAddDealer();

    fireEvent.change(gstinField(dialog), { target: { value: "33AAPFU09" } });

    // Still empty rather than showing part of a PAN, which would look answered.
    expect(panField(dialog).value).toBe("");
  });

  it("follows a corrected GSTIN", async () => {
    const dialog = await openAddDealer();

    fireEvent.change(gstinField(dialog), { target: { value: GSTIN } });
    await waitFor(() => {
      expect(panField(dialog).value).toBe(GSTIN_PAN);
    });

    fireEvent.change(gstinField(dialog), { target: { value: OTHER_GSTIN } });
    await waitFor(() => {
      expect(panField(dialog).value).toBe(OTHER_GSTIN_PAN);
    });
  });

  it("clears the PAN when the GSTIN is cleared", async () => {
    /*
     * REPORTED BY THE OWNER. The PAN belongs to the GSTIN it came from, so a
     * GSTIN that is no longer there must not leave its PAN sitting in the
     * field -- the next person to look at the form sees an answered field
     * under an empty one and has no way to know the two disagree.
     */
    const dialog = await openAddDealer();

    fireEvent.change(gstinField(dialog), { target: { value: GSTIN } });
    await waitFor(() => {
      expect(panField(dialog).value).toBe(GSTIN_PAN);
    });

    fireEvent.change(gstinField(dialog), { target: { value: "" } });

    await waitFor(() => {
      expect(panField(dialog).value).toBe("");
    });
  });

  it("clears the PAN while the GSTIN is being retyped", async () => {
    /*
     * ALSO REPORTED, and the same fault seen from the other side: somebody
     * replacing a GSTIN deletes it first, and every intermediate value is
     * invalid. The PAN must not hold the old one during that.
     */
    const dialog = await openAddDealer();

    fireEvent.change(gstinField(dialog), { target: { value: GSTIN } });
    await waitFor(() => {
      expect(panField(dialog).value).toBe(GSTIN_PAN);
    });

    fireEvent.change(gstinField(dialog), { target: { value: "29AAGCB" } });

    await waitFor(() => {
      expect(panField(dialog).value).toBe("");
    });
  });

  it("follows a GSTIN retyped character by character, not replaced at once", async () => {
    /*
     * HOW A PERSON ACTUALLY EDITS A FIELD, which is what the first version of
     * "follows a corrected GSTIN" above did not do -- it fired one change
     * event carrying the whole new value, and a wholesale replacement is not
     * how anybody types.
     */
    const dialog = await openAddDealer();

    fireEvent.change(gstinField(dialog), { target: { value: GSTIN } });
    await waitFor(() => {
      expect(panField(dialog).value).toBe(GSTIN_PAN);
    });

    fireEvent.change(gstinField(dialog), { target: { value: "" } });
    for (let i = 1; i <= OTHER_GSTIN.length; i += 1) {
      fireEvent.change(gstinField(dialog), { target: { value: OTHER_GSTIN.slice(0, i) } });
    }

    await waitFor(() => {
      expect(panField(dialog).value).toBe(OTHER_GSTIN_PAN);
    });
  });

  it("clears the PAN when the GSTIN becomes invalid", async () => {
    /*
     * A changed check digit is still fifteen characters, so the field looks
     * complete. The PAN it derived from is no longer supported by it.
     */
    const dialog = await openAddDealer();

    fireEvent.change(gstinField(dialog), { target: { value: GSTIN } });
    await waitFor(() => {
      expect(panField(dialog).value).toBe(GSTIN_PAN);
    });

    fireEvent.change(gstinField(dialog), { target: { value: "33AAPFU0939F1ZX" } });

    await waitFor(() => {
      expect(panField(dialog).value).toBe("");
    });
  });

  it("stops following it once somebody edits the PAN by hand", async () => {
    /*
     * WITHOUT THIS THE FIELD CANNOT BE CORRECTED AT ALL -- every keystroke in
     * it would be overwritten on the next render, which is the bug the
     * `dirtyFields` check exists to prevent. A GSTIN issued against a
     * predecessor entity's PAN is the real case.
     */
    const dialog = await openAddDealer();

    fireEvent.change(gstinField(dialog), { target: { value: GSTIN } });
    await waitFor(() => {
      expect(panField(dialog).value).toBe(GSTIN_PAN);
    });

    fireEvent.change(panField(dialog), { target: { value: "ZZZPK1234Q" } });
    fireEvent.change(gstinField(dialog), { target: { value: OTHER_GSTIN } });

    await waitFor(() => {
      expect(gstinField(dialog).value).toBe(OTHER_GSTIN);
    });
    expect(panField(dialog).value).toBe("ZZZPK1234Q");
  });

  it("says which of the two is happening", async () => {
    const dialog = await openAddDealer();

    expect(dialog).toHaveTextContent(/Taken from the GSTIN/i);

    fireEvent.change(gstinField(dialog), { target: { value: GSTIN } });
    fireEvent.change(panField(dialog), { target: { value: "ZZZPK1234Q" } });

    await waitFor(() => {
      expect(dialog).toHaveTextContent(/Edited by hand/i);
    });
  });
});

describe("a dealership whose PAN was deliberately overridden", () => {
  /*
   * THE CASE THE FIX COULD HAVE BROKEN, and the reason `panOverridden` is
   * seeded from the incoming values rather than starting false.
   *
   * The PAN follows the GSTIN whenever it is not overridden — so an edit
   * dialog opening with a stored PAN that is NOT its GSTIN's would have had it
   * silently corrected on mount, and thrown the override away on the next
   * save. A GSTIN issued against a predecessor entity's PAN is the whole
   * reason the field is editable, so this is not a hypothetical.
   */
  async function openEdit(overrides: Partial<dealersApi.Dealer>) {
    mockFetchDealers.mockResolvedValue([dealer({ id: "unit-1", ...overrides })]);
    renderRoute({ path: "/acme-motors/admin/dealers/unit-1", children: dealerRoutes });
    const panel = await screen.findByRole("complementary", { name: /Guindy/ });
    fireEvent.click(within(panel).getByRole("button", { name: "Edit" }));
    return screen.findByRole("dialog");
  }

  it("keeps the stored PAN rather than re-deriving over it", async () => {
    const dialog = await openEdit({ gstin: GSTIN, pan: "ZZZPK1234Q" });

    expect(panField(dialog).value).toBe("ZZZPK1234Q");
    // And it stays put: the effect has had every chance to run by now.
    await waitFor(() => {
      expect(gstinField(dialog).value).toBe(GSTIN);
    });
    expect(panField(dialog).value).toBe("ZZZPK1234Q");
  });

  it("says it was edited by hand", async () => {
    const dialog = await openEdit({ gstin: GSTIN, pan: "ZZZPK1234Q" });

    expect(dialog).toHaveTextContent(/Edited by hand/i);
  });

  it("does not claim an ordinary derived PAN was edited by hand", async () => {
    const dialog = await openEdit({ gstin: GSTIN, pan: GSTIN_PAN });

    expect(dialog).toHaveTextContent(/Taken from the GSTIN/i);
  });

  it("follows the GSTIN again once the override is cleared and left empty", async () => {
    /*
     * WHAT THE HINT PROMISES. Checked on blur rather than on change, so
     * clearing the box in order to retype does not refill it under the cursor.
     */
    const dialog = await openEdit({ gstin: GSTIN, pan: "ZZZPK1234Q" });

    fireEvent.change(panField(dialog), { target: { value: "" } });
    fireEvent.blur(panField(dialog));

    await waitFor(() => {
      expect(panField(dialog).value).toBe(GSTIN_PAN);
    });
  });
});

describe("submitting", () => {
  it("sends both identifiers, uppercased", async () => {
    const dialog = await openAddDealer();
    fillTheRest(dialog);

    // Typed in lowercase, which is what somebody actually does.
    fireEvent.change(gstinField(dialog), { target: { value: GSTIN.toLowerCase() } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add dealer" }));

    await waitFor(() => {
      expect(mockCreateDealer).toHaveBeenCalled();
    });

    // `[1]`, not `[0]`: `createDealer(orgSlug, body)` takes the slug first.
    expect(mockCreateDealer.mock.calls[0]?.[1]).toMatchObject({
      gstin: GSTIN,
      pan: GSTIN_PAN,
    });
  });

  it("refuses a GSTIN with a bad check digit before any request", async () => {
    const dialog = await openAddDealer();
    fillTheRest(dialog);

    // A real GSTIN with its last character changed: right shape, wrong sum.
    fireEvent.change(gstinField(dialog), { target: { value: "33AAPFU0939F1ZX" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add dealer" }));

    expect(await within(dialog).findByText(/not valid/i)).toBeInTheDocument();
    expect(mockCreateDealer).not.toHaveBeenCalled();
  });

  it("will not submit without a GSTIN", async () => {
    const dialog = await openAddDealer();
    fillTheRest(dialog);

    fireEvent.click(within(dialog).getByRole("button", { name: "Add dealer" }));

    expect(await within(dialog).findByText(/Enter this dealership/i)).toBeInTheDocument();
    expect(mockCreateDealer).not.toHaveBeenCalled();
  });

  it("refuses a hand-typed PAN that is not a PAN", async () => {
    const dialog = await openAddDealer();
    fillTheRest(dialog);

    fireEvent.change(gstinField(dialog), { target: { value: GSTIN } });
    fireEvent.change(panField(dialog), { target: { value: "NOPE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add dealer" }));

    expect(await within(dialog).findByText(/five letters, four digits/i)).toBeInTheDocument();
    expect(mockCreateDealer).not.toHaveBeenCalled();
  });
});

describe("the detail panel", () => {
  it("shows the GSTIN and the PAN", async () => {
    renderRoute({ path: "/acme-motors/admin/dealers/unit-1", children: dealerRoutes });

    const panel = await screen.findByRole("complementary", { name: /Guindy/ });

    expect(panel).toHaveTextContent(GSTIN);
    expect(panel).toHaveTextContent(new RegExp("PAN " + GSTIN_PAN));
  });

  it("says so rather than showing a blank row for a dealership that predates the field", async () => {
    /*
     * THE ORGANISATION'S FOUR EXISTING DEALERSHIPS. Both columns are NOT NULL
     * with an empty default, so those rows read as "" -- and an empty value
     * beside a label reads as a broken panel rather than as missing data.
     */
    mockFetchDealers.mockResolvedValue([dealer({ id: "unit-1", gstin: "", pan: "" })]);

    renderRoute({ path: "/acme-motors/admin/dealers/unit-1", children: dealerRoutes });

    const panel = await screen.findByRole("complementary", { name: /Guindy/ });

    expect(panel).toHaveTextContent(/No GSTIN recorded/i);
  });
});
