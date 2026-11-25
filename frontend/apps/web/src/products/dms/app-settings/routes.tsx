/**
 * DMS SETTINGS (C78, C82), behind the gear in the topbar: `/<org>/dms/settings`.
 *
 * The pages come from the catalogue's `settings` modules, so the sidebar and
 * the routes cannot disagree about what exists. All of them are drawn only
 * for now ("being built"); each becomes a real screen in turn.
 *
 * MASTERS is here too (the owner, 2026-11-25): what was DMS's "Load Master
 * Data" page, one sub-module per old tab. Its old address, `/<org>/dms/master-data`,
 * redirects here.
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
import { MastersPage } from "../settings/MastersPage";
import { DmsUsersScreen } from "./DmsUsersScreen";
import { TerritoryFormScreen } from "./TerritoryFormScreen";
import { TerritoryManagementScreen } from "./TerritoryManagementScreen";

/**
 * The pages that are BUILT, by their path in the catalogue. Every other
 * settings page is still "being built". One entry per screen as each lands.
 */
const BUILT: Record<string, ReactElement> = {
  users: <DmsUsersScreen />,
  territories: <TerritoryManagementScreen />,
  // Masters (2026-11-25): each sub-module is one of Load Master Data's old tabs.
  "bank-accounts": <MastersPage tab="bank-accounts" />,
  "product-catalog": <MastersPage tab="product-catalog" />,
  "user-manuals": <MastersPage tab="user-manuals" />,
  "machine-videos": <MastersPage tab="machine-videos" />,
  "marketing-kit": <MastersPage tab="marketing-kit" />,
  "calculator-constants": <MastersPage tab="calculator-constants" />,
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
      {/* One person opened beside the list (the Admin panel's Users does the same). */}
      <Route path="users/:userId" element={<DmsUsersScreen />} />
      {/* Territory Management (2026-11-24): New and Edit are their own pages
          (Q78); a box opens beside the tree. `new` is a fixed segment, so it
          wins over `:territoryId`. */}
      <Route path="territories/new" element={<TerritoryFormScreen mode="new" />} />
      <Route path="territories/:territoryId/edit" element={<TerritoryFormScreen mode="edit" />} />
      <Route path="territories/:territoryId" element={<TerritoryManagementScreen />} />
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  );
}
