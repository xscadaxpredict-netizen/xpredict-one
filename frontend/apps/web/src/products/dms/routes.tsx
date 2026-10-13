import { ModuleRoutes, type ModuleRoute } from "../../shell/routing";
import SalesRoutes from "./sales/routes";
import SiteServicesRoutes from "./site-services/routes";
import TechSupportRoutes from "./tech-support/routes";
import EcommerceRoutes from "./ecommerce/routes";
import ToolsRoutes from "./tools/routes";
import SettingsPage from "./settings/SettingsPage";

const routes: ModuleRoute[] = [
  // TEMPORARY: `module: null` = anyone inside DMS can test and access all routes.
  // The developer can restore specific module keys ('sales', 'service', 'tech-support', etc.)
  // once the full permission models are assigned.
  { path: "sales/*", module: null, element: <SalesRoutes /> },
  { path: "site-services/*", module: null, element: <SiteServicesRoutes /> },
  { path: "tech-support/*", module: null, element: <TechSupportRoutes /> },
  { path: "ecommerce/*", module: null, element: <EcommerceRoutes /> },
  { path: "tools/*", module: null, element: <ToolsRoutes /> },
  { path: "settings/*", module: null, element: <SettingsPage /> },
];

export default function DmsRoutes() {
  return <ModuleRoutes routes={routes} />;
}


