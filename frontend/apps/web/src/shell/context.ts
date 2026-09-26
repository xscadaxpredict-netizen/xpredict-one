/**
 * What the shell has already resolved, available to everything inside it.
 *
 * A REAL REACT CONTEXT, NOT ROUTER OUTLET CONTEXT, and that distinction cost a
 * round of failing tests. `useOutletContext()` only reaches components rendered
 * *through* the `<Outlet>` — the page. The topbar and the sidebar are siblings
 * of the outlet, so they got `null`, and the sidebar crashed the moment it
 * needed to know which modules to show.
 *
 * Its own module rather than living in `AppShell.tsx` so that `access.ts` can
 * read it without importing the shell component, which would be a cycle waiting
 * to happen.
 */

import { createContext, useContext } from "react";

import type { Me, Membership } from "./api/auth";
import type { AppDefinition } from "./navigation";

export interface ShellContext {
  me: Me;
  /** The membership for the organisation in the URL. Never another one. */
  membership: Membership;
  /** The app currently open, or undefined on the launcher. */
  app: AppDefinition | undefined;
}

const ShellContextValue = createContext<ShellContext | null>(null);

export const ShellProvider = ShellContextValue.Provider;

/**
 * Read what the shell resolved, from anywhere inside it.
 *
 * THROWS rather than returning null if used outside the shell. A permission
 * check that silently reads `undefined` fails closed and looks like a
 * permission problem — somebody would spend an afternoon on the backend before
 * noticing the component was mounted in the wrong place.
 */
export function useShellContext(): ShellContext {
  const value = useContext(ShellContextValue);

  if (!value) {
    throw new Error(
      "useShellContext was called outside the app shell. Screens must render inside AppShell's route.",
    );
  }

  return value;
}
