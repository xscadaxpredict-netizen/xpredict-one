/**
 * What has been typed into the topbar's search box, for the page that owns it.
 *
 * THE TOPBAR SEARCH FOLLOWS THE PAGE (C78). A page that can be searched says
 * so in the catalogue (`NavItem.search`); while it is open the topbar box is
 * that page's search — "Search applications" — and the page filters by what
 * is typed here. The box is in the topbar and the list is in the page, so the
 * text has to live somewhere both can reach: here.
 *
 * NOT PERSISTED, and cleared by the topbar whenever the address changes, so a
 * search never follows you to another page — or another organisation.
 */

import { create } from "zustand";

interface PageSearchState {
  query: string;
  setQuery: (query: string) => void;
}

export const usePageSearch = create<PageSearchState>()((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));
