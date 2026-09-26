/**
 * CRM --- organization level, no business units (C5).
 *
 * Built after DMS ships. It has no modules yet, so the sidebar says so and the
 * app root sends people back to the launcher rather than showing an empty frame.
 */

import { ModuleRoutes, type ModuleRoute } from "../../shell/routing";

// Deliberately empty. Invented module names would be read as decisions.
const routes: ModuleRoute[] = [];

export default function CrmRoutes() {
  return <ModuleRoutes routes={routes} />;
}
