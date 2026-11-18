/**
 * Administration — organisation-wide: dealers, people, roles, billing, audit.
 *
 * WHY THIS LIVES IN `shell/` AND NOT `products/`. Administration is not a
 * product a customer subscribes to; it comes with the platform and is gated by
 * role alone. The shell was always defined as "launcher, org switcher and admin
 * console" (see eslint.config.js), and putting it under `products/` would make
 * it subject to the cross-product import ban for no reason — it legitimately
 * needs to know about every app in order to manage access to them.
 *
 * It is the ADMIN PANEL (C78): no tile in the launcher; reached from the shield
 * in the topbar.
 *
 * ACTING HERE IS AN OVERRIDE, NOT THE NORMAL PATH (C3). Dealers manage their own
 * people; an organisation admin reaching into a dealer's users is audited. The
 * banner on the People screen says so, and is not decoration — it is the only
 * warning before someone edits another team's user.
 */

import { Navigate } from "react-router-dom";

import { ModuleRoutes, type ModuleRoute } from "../routing";
import { AdminsAndRolesScreen } from "./screens/AdminsAndRolesScreen";
import { ApplicationsScreen } from "./screens/ApplicationsScreen";
import { DealersScreen } from "./screens/DealersScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { UsersScreen } from "./screens/UsersScreen";

/*
 * Each screen is its own module, so the whole console is not all-or-nothing:
 * a dealer admin opens Users and nothing else (C23).
 *
 * IN SIDEBAR ORDER, because the panel's front door (`/admin`) goes to the
 * first one this person may open: Profile for an organisation admin, Users
 * for a dealer admin.
 *
 * Profile and Applications have modules of their own, `organization` and
 * `applications` (C78). "Admins and Roles" is ONE sub-module (the owner,
 * 2026-11-18), with a tab per address under `/admin/admins-and-roles`. Dealers keeps its route
 * though the sidebar no longer lists it.
 */
const routes: ModuleRoute[] = [
  { path: "profile", module: "organization", element: <ProfileScreen /> },
  { path: "applications", module: "applications", element: <ApplicationsScreen /> },
  { path: "applications/:appCode", module: "applications", element: <ApplicationsScreen /> },
  { path: "users", module: "users", element: <UsersScreen /> },
  { path: "users/:userId", module: "users", element: <UsersScreen /> },
  { path: "admins-and-roles", module: "roles", element: <AdminsAndRolesScreen /> },
  { path: "admins-and-roles/:tab", module: "roles", element: <AdminsAndRolesScreen /> },
  {
    path: "admins-and-roles/admin/:personId",
    module: "roles",
    element: <AdminsAndRolesScreen />,
  },
  // The old Roles address, kept for links and bookmarks: now the Roles tab.
  { path: "roles", module: "roles", element: <Navigate to="../admins-and-roles/roles" replace /> },
  { path: "dealers", module: "dealers", element: <DealersScreen /> },
  { path: "dealers/:dealerId", module: "dealers", element: <DealersScreen /> },
];

export default function AdminRoutes() {
  return <ModuleRoutes routes={routes} />;
}
