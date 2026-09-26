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
 * It still appears as an app in the launcher, because from the user's side that
 * is exactly what it is.
 *
 * ACTING HERE IS AN OVERRIDE, NOT THE NORMAL PATH (C3). Dealers manage their own
 * people; an organisation admin reaching into a dealer's users is audited. The
 * banner on the People screen says so, and is not decoration — it is the only
 * warning before someone edits another team's user.
 */

import { ModuleRoutes, type ModuleRoute } from "../routing";
import { UsersScreen } from "./screens/UsersScreen";
import styles from "./routes.module.css";

/*
 * Each screen is its own module, so the whole console is not all-or-nothing.
 * An organisation could grant somebody People and Audit log without handing
 * them Apps & billing.
 */
const routes: ModuleRoute[] = [
  { path: "users", module: "users", element: <UsersScreen /> },
  { path: "dealers", module: "dealers", element: <AdminPlaceholder name="Dealers" /> },
  { path: "roles", module: "roles", element: <AdminPlaceholder name="Roles" /> },
  { path: "billing", module: "billing", element: <AdminPlaceholder name="Apps & billing" /> },
  { path: "audit", module: "audit", element: <AdminPlaceholder name="Audit log" /> },
];

export default function AdminRoutes() {
  return <ModuleRoutes routes={routes} />;
}

interface AdminPlaceholderProps {
  name: string;
  /** Whether acting on this screen is recorded as an override. */
  audited?: boolean;
}

function AdminPlaceholder({ name, audited = false }: AdminPlaceholderProps) {
  return (
    <>
      <h1>{name}</h1>

      {audited && (
        <p className={styles.auditNotice} role="note">
          <strong>You are acting as an organisation admin.</strong> Dealers normally manage
          their own people. Anything you change on a dealer&rsquo;s user here is recorded in
          the audit log as an override.
        </p>
      )}

      <p>Not built yet.</p>
    </>
  );
}
