import { ModuleRoutes, type ModuleRoute } from "../../shell/routing";
import { HomeScreen } from "./screens/HomeScreen";
import SalesRoutes from "./sales/routes";
import SiteServicesRoutes from "./site-services/routes";
import TechSupportRoutes from "./tech-support/routes";
import EcommerceRoutes from "./ecommerce/routes";
import ToolsRoutes from "./tools/routes";
import { Navigate, useLocation } from "react-router-dom";

import { useShellContext } from "../../shell/context";
import DmsSettingsRoutes from "./app-settings/routes";
import { UnplacedNotice } from "./UnplacedNotice";

/**
 * Load Master Data's old address. It moved behind the gear as DMS settings ->
 * Masters (the owner, 2026-11-25); a bookmark lands on its first page, and
 * anybody but the owner then gets not-found there, as for the rest of the gear.
 */
function MasterDataMoved() {
  const { membership } = useShellContext();
  return <Navigate to={`/${membership.org_slug}/dms/settings/bank-accounts`} replace />;
}

/**
 * DMS's own address, and the Welcome Hub's old one, open Home's Dashboard
 * (the owner, 2026-11-25). The query string comes along, so an old
 * `/dms?view=sales` still lands on the Sales dashboard.
 */
function ToHome() {
  const { membership } = useShellContext();
  const { search } = useLocation();
  return <Navigate to={`/${membership.org_slug}/dms/home${search}`} replace />;
}

const routes: ModuleRoute[] = [
  { path: "", module: null, element: <ToHome /> },
  { path: "welcome", module: null, element: <ToHome /> },
  { path: "home", module: null, element: <HomeScreen tab="dashboard" /> },
  { path: "home/getting-started", module: null, element: <HomeScreen tab="getting-started" /> },
  { path: "sales/*", module: "sales", element: <SalesRoutes /> },
  { path: "site-services/*", module: "service", element: <SiteServicesRoutes /> },
  { path: "tech-support/*", module: "tech-support", element: <TechSupportRoutes /> },
  { path: "ecommerce/*", module: "ecommerce", element: <EcommerceRoutes /> },
  { path: "tools/*", module: "tools", element: <ToolsRoutes /> },
  { path: "master-data/*", module: null, element: <MasterDataMoved /> },
  // DMS settings (C78): the gate is `canOpenAppSettings()` inside, not a module.
  { path: "settings/*", module: null, element: <DmsSettingsRoutes /> },
];

export default function DmsRoutes() {
  return (
    <>
      {/* Somebody with no territory sees empty lists: this says why (2026-11-24). */}
      <UnplacedNotice />
      <ModuleRoutes routes={routes} />
    </>
  );
}


