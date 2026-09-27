/**
 * The dealership tree, and the rule that keeps it a tree.
 *
 * A dealership must never end up reporting to itself or to one of its own
 * branches. That is not a tidiness rule: a cycle means a subtree whose parent
 * chain never reaches the organisation, so every scope query walking upwards
 * runs forever and every one walking downwards visits the same rows twice.
 *
 * `dealerAndDescendants` is what the edit form uses to decide which parents
 * NOT to offer, and what the fake backend uses to refuse one anyway. Worth
 * testing on its own because it is pure, and because the case that breaks it
 * is three levels deep — which nobody reaches by clicking around.
 */

import { describe, expect, it } from "vitest";

import { dealerAndDescendants, type Dealer } from "../admin/api/dealers";

/** Only the fields the hierarchy cares about; the rest is noise here. */
function dealer(id: string, parentId: string | null): Dealer {
  return {
    id,
    name: id,
    code: null,
    parent_id: parentId,
    parent_name: null,
    contact_person: "Someone",
    email: "someone@example.com",
    phone: "+91 44 0000 0000",
    city: "City",
    state: "State",
    postal_code: "000000",
    status: "active",
    user_count: 0,
    created_at: "2024-01-01T00:00:00Z",
  };
}

/*
 *   chennai
 *     ├── coimbatore
 *     │     └── erode
 *     └── madurai
 *   bangalore   (separate top-level tree)
 */
const dealers: Dealer[] = [
  dealer("chennai", null),
  dealer("coimbatore", "chennai"),
  dealer("erode", "coimbatore"),
  dealer("madurai", "chennai"),
  dealer("bangalore", null),
];

describe("dealerAndDescendants", () => {
  it("includes the dealership itself", () => {
    expect(dealerAndDescendants(dealers, "bangalore")).toEqual(new Set(["bangalore"]));
  });

  it("includes direct branches", () => {
    expect(dealerAndDescendants(dealers, "coimbatore")).toEqual(
      new Set(["coimbatore", "erode"]),
    );
  });

  /*
   * The case that matters, and the one clicking around does not reach. Erode
   * is a grandchild of Chennai; making Chennai report to Erode would cut all
   * four of them off from the organisation.
   */
  it("reaches branches of branches", () => {
    expect(dealerAndDescendants(dealers, "chennai")).toEqual(
      new Set(["chennai", "coimbatore", "erode", "madurai"]),
    );
  });

  it("does not wander into a separate tree", () => {
    expect(dealerAndDescendants(dealers, "chennai").has("bangalore")).toBe(false);
  });

  it("leaves a valid parent available", () => {
    // What the edit form is actually asking: may Chennai report to Bangalore?
    const forbidden = dealerAndDescendants(dealers, "chennai");

    expect(forbidden.has("bangalore")).toBe(false);
    expect(forbidden.has("chennai")).toBe(true);
  });

  /*
   * Defensive. The frontend cannot create a cycle and the backend refuses
   * one, but data arriving with a loop already in it must not hang the
   * browser — which a naive recursive walk would do.
   */
  it("terminates on data that already contains a cycle", () => {
    const looped: Dealer[] = [dealer("a", "b"), dealer("b", "a")];

    expect(dealerAndDescendants(looped, "a")).toEqual(new Set(["a", "b"]));
  });

  it("copes with a parent that is not in the list", () => {
    // A dealership whose parent was closed and filtered out upstream.
    const orphan: Dealer[] = [dealer("child", "missing-parent")];

    expect(dealerAndDescendants(orphan, "child")).toEqual(new Set(["child"]));
  });
});
