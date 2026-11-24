/**
 * The flat list `/territories/` sends, turned into a tree in one pass -- the
 * list comes in tree order, every box after its parent. No React here.
 */

import type { DmsTerritory } from "./territories";

export interface TreeNode {
  territory: DmsTerritory;
  parent: TreeNode | null;
  children: TreeNode[];
  /** Every territory under this one, at any depth. */
  below: number;
  /** People placed here AND anywhere under it. */
  people: number;
}

export interface Tree {
  root: TreeNode | null;
  byId: Map<string, TreeNode>;
}

export function buildTree(territories: DmsTerritory[]): Tree {
  const byId = new Map<string, TreeNode>();
  let root: TreeNode | null = null;

  for (const territory of territories) {
    const parent = territory.parent_id ? (byId.get(territory.parent_id) ?? null) : null;
    const node: TreeNode = {
      territory,
      parent,
      children: [],
      below: 0,
      people: 0,
    };
    byId.set(territory.id, node);
    if (parent) parent.children.push(node);
    else if (territory.is_root) root = node;
  }

  // Counts from the bottom up: tree order reversed puts every child first.
  for (const node of [...byId.values()].reverse()) {
    node.people += node.territory.people_count;
    if (node.parent) {
      node.parent.below += node.below + 1;
      node.parent.people += node.people;
    }
  }

  return { root, byId };
}

/** The ids of every box above this one, nearest first. */
export function ancestorsOf(node: TreeNode): string[] {
  const ids: string[] = [];
  for (let up = node.parent; up; up = up.parent) ids.push(up.territory.id);
  return ids;
}

/** Does this box answer to the search: its name or its code, ignoring case. */
export function matchesSearch(territory: DmsTerritory, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return `${territory.name} ${territory.code ?? ""}`.toLowerCase().includes(needle);
}

/** "2 below · 6 people" -- what a box says under its name. */
export function countsLine(node: TreeNode): string {
  const people = node.people === 1 ? "1 person" : `${String(node.people)} people`;
  return node.below > 0 ? `${String(node.below)} below · ${people}` : people;
}

/** Two letters for the panel's badge. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? words
          .slice(0, 2)
          .map((word) => word.charAt(0))
          .join("")
      : name.trim().slice(0, 2);
  return letters.toUpperCase();
}
