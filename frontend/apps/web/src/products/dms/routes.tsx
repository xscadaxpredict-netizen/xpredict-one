import { ModuleRoutes, type ModuleRoute } from "../../shell/routing";
import { DmsWelcomeScreen } from "./screens/DmsWelcomeScreen";
import SalesRoutes from "./sales/routes";
import SiteServicesRoutes from "./site-services/routes";
import TechSupportRoutes from "./tech-support/routes";
import EcommerceRoutes from "./ecommerce/routes";
import ToolsRoutes from "./tools/routes";
import SettingsPage from "./settings/SettingsPage";
import DmsSettingsRoutes from "./app-settings/routes";

const routes: ModuleRoute[] = [
  { path: "", module: null, element: <DmsWelcomeScreen /> },
  { path: "welcome", module: null, element: <DmsWelcomeScreen /> },
  { path: "sales/*", module: "sales", element: <SalesRoutes /> },
  { path: "site-services/*", module: "service", element: <SiteServicesRoutes /> },
  { path: "tech-support/*", module: "tech-support", element: <TechSupportRoutes /> },
  { path: "ecommerce/*", module: "ecommerce", element: <EcommerceRoutes /> },
  { path: "tools/*", module: "tools", element: <ToolsRoutes /> },
  // Load Master Data (the backend's `settings` module) -- moved from `settings`
  // when that address became DMS's own settings, behind the gear (2026-11-23).
  { path: "master-data/*", module: "settings", element: <SettingsPage /> },
  // DMS settings (C78): the gate is `canOpenAppSettings()` inside, not a module.
  { path: "settings/*", module: null, element: <DmsSettingsRoutes /> },
];

export default function DmsRoutes() {
  return <ModuleRoutes routes={routes} />;
}


