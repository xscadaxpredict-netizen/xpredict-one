/**
 * DMS SETTINGS (C78, C82), behind the gear in the topbar: `/<org>/dms/settings`.
 *
 * The pages come from the catalogue's `settings` modules, so the sidebar and
 * the routes cannot disagree about what exists. All of them are drawn only
 * for now ("being built"); each becomes a real screen in turn.
 *
 * NOT "Load Master Data": that DMS page moved to `/<org>/dms/master-data`
 * when this address became the gear's (the owner, 2026-11-23).
 *
 * WHO GETS IN is `canOpenAppSettings()` -- the owner, until the app-admin role
 * is designed (Q63). Anybody else gets not-found, the same as for a module
 * they lack: a page you may not open looks like one that does not exist.
 */

import type { ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { useShellContext } from "../../../shell/context";
import { canOpenAppSettings } from "../../../shell/navigation";
import { NotFoundScreen } from "../../../shell/screens/NotFoundScreen";
import { SettingsPlaceholderScreen } from "../../../shell/screens/SettingsPlaceholderScreen";
import { DmsUsersScreen } from "./DmsUsersScreen";

/**
 * The pages that are BUILT, by their path in the catalogue. Every other
 * settings page is still "being built". One entry per screen as each lands.
 */
const BUILT: Record<string, ReactElement> = {
  users: <DmsUsersScreen />,
};

export default function DmsSettingsRoutes() {
  const { membership, app } = useShellContext();

  if (!app?.settings || !canOpenAppSettings(membership, app)) {
    return <NotFoundScreen />;
  }

  const pages = app.settings.flatMap((group) => group.items);
  const first = pages[0];

  return (
    <Routes>
      <Route index element={first ? <Navigate to={first.path} replace /> : <NotFoundScreen />} />
      {pages.map((page) => (
        <Route
          key={page.path}
          path={page.path}
          element={BUILT[page.path] ?? <SettingsPlaceholderScreen title={page.label} />}
        />
      ))}
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  );
}
