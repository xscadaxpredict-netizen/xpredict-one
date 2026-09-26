/**
 * Shell-wide UI state.
 *
 * WHAT BELONGS HERE
 *
 * Things the *browser* owns, that more than one component needs, and that no
 * parent can conveniently pass down as a prop. Sidebar collapsed, theme.
 *
 * WHAT DOES NOT BELONG HERE
 *
 * 1. Anything that came from an API response. Enquiries, dealers, the current
 *    user — all server state, all TanStack Query's job. Putting server data in
 *    a store means hand-writing caching, refetching, staleness and loading
 *    flags forever, and worse than the library already does it.
 *
 * 2. Anything specific to one organisation. This store lives outside React and
 *    outside the router, so it does NOT reset when someone switches from Acme
 *    to Northway — a selected dealer or a draft enquiry kept here would follow
 *    them across. Same family of bug as a cache key without the org in it.
 *
 *    If org-specific UI state ever genuinely has to live in a store, it needs
 *    an explicit reset when the org slug changes. Nothing here needs that yet,
 *    so that machinery is deliberately not built.
 *
 * 3. State only one screen cares about. A dialog's open/closed, the active
 *    filter chips — `useState` inside that screen. Hoisting it here means two
 *    screens start fighting over one value.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface UiState {
  isSidebarCollapsed: boolean;
  theme: Theme;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: Theme) => void;
}

/**
 * `create<UiState>()(...)` — the empty `()` between the type and the config is
 * not a typo. TypeScript needs the extra call to infer types correctly through
 * middleware like `persist`. Without middleware you would write
 * `create<UiState>((set) => ({...}))`.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      theme: "system",

      // `set` takes either a plain object to merge, or a function receiving the
      // current state. Use the function form whenever the new value depends on
      // the old one — two rapid clicks can otherwise both read the same stale value.
      toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      /*
       * `persist` saves to the browser's localStorage, so a refresh keeps your
       * sidebar and theme. That is safe ONLY because neither field is
       * organisation-specific or personal.
       *
       * Persisted state survives logout. The next person to use this machine
       * inherits whatever is in here — so never persist anything that answers
       * "who is this" or "which customer are we in".
       */
      name: "xpredict-ui",
    },
  ),
);
