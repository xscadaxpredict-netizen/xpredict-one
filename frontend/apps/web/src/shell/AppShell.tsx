import { Outlet } from "react-router-dom";

/**
 * The application shell: app launcher, org switcher, layout, admin console.
 *
 * Built in Phase 4. It renders the navigation a user is actually entitled to
 * --- but hiding a link is a convenience, never a control. The backend
 * enforces every permission regardless of what the UI shows.
 */
export function AppShell() {
  return (
    <div>
      <header>
        <strong>Xpredict One</strong>
        {/* App launcher and org switcher: Phase 4 */}
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
