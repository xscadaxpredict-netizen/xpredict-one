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
import { AssignAdminScreen } from "./screens/AssignAdminScreen";
import { ApplicationsScreen } from "./screens/ApplicationsScreen";
import { EditRoleScreen, NewRoleScreen } from "./screens/NewRoleScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { UsersScreen } from "./screens/UsersScreen";

/*
 * EACH SCREEN IS GATED BY ITS OWN SECTION of the Admin panel's tree (C79), the
 * same codes `/me` sends: a sub-module (`profile`, `application`, `user`,
 * `admins_and_roles`) or, for an address that IS one tab, that tab. So the
 * console is not all-or-nothing: a dealer admin opens Users and nothing else
 * (C23).
 *
 * IN SIDEBAR ORDER, because the panel's front door (`/admin`) goes to the
 * first one this person may open: Profile for an organisation admin, Users
 * for a dealer admin.
 *
 * "Admins and Roles" is ONE sub-module (the owner, 2026-11-18) with a tab per
 * address; the screen itself shows only the tabs this person may see.
 * DEALERS IS NOT ON THE TREE (Q64): its route stays, reachable only by URL,
 * gated by the permission its endpoint checks.
 */
const routes: ModuleRoute[] = [
  { path: "profile", section: "profile", element: <ProfileScreen /> },
  { path: "applications", section: "application", element: <ApplicationsScreen /> },
  { path: "applications/:appCode", section: "application", element: <ApplicationsScreen /> },
  { path: "users", section: "user", element: <UsersScreen /> },
  { path: "users/:userId", section: "user", element: <UsersScreen /> },
  { path: "admins-and-roles", section: "admins_and_roles", element: <AdminsAndRolesScreen /> },
  // New Role (C72 piece 5): its own page, on the right to build roles.
  { path: "admins-and-roles/roles/new", permission: "admin.role.create", element: <NewRoleScreen /> },
  // Edit Role: New Role's page, filled in, on the right to change roles.
  {
    path: "admins-and-roles/roles/:roleCode/edit",
    permission: "admin.role.update",
    element: <EditRoleScreen />,
  },
  // Assign Admin (C89): its own page, on the right to assign admins. Fixed
  // segments outrank `:tab/:roleCode` below.
  {
    path: "admins-and-roles/assign-admin",
    permission: "admin.admin.assign_admin",
    element: <AssignAdminScreen />,
  },
  // A role opened beside the Roles tab's list. "new" above is matched first:
  // React Router prefers a fixed segment to a parameter.
  { path: "admins-and-roles/:tab/:roleCode", section: "role", element: <AdminsAndRolesScreen /> },
  {
    path: "admins-and-roles/:tab",
    section: "admins_and_roles",
    element: <AdminsAndRolesScreen />,
  },
  // An admin opened beside the list: the Admins tab, so its own tab's section.
  { path: "admins-and-roles/admin/:personId", section: "admin", element: <AdminsAndRolesScreen /> },
  // The old Roles address, kept for links and bookmarks: now the Roles tab.
  { path: "roles", section: "role", element: <Navigate to="../admins-and-roles/roles" replace /> },
];

export default function AdminRoutes() {
  return <ModuleRoutes routes={routes} />;
}
