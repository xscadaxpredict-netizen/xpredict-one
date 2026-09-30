/**
 * DMS --- dealership management. The only unit-aware app (C5).
 *
 * Records are scoped to the user's dealer by the backend; the frontend never
 * filters by unit itself.
 *
 * Modules per C18: Sales, Service and Tech support are the modules, and
 * enquiries, quotations and the rest are screens INSIDE them. Org-level dealer
 * management lives in Administration (C17), which is why there is no Dealers
 * entry here — and no dealer-settings area either. A dealer admin manages
 * their own dealer's people in that SAME Administration app, narrowed to their
 * dealership (C23, which superseded C21's separate area inside DMS).
 *
 * EVERY SCREEN DECLARES ITS MODULE. The field is required, so a new screen
 * cannot be added without saying what it needs; `shell/routing.tsx` is the
 * only thing that turns this list into routes, and it drops the ones this
 * person may not open.
 *
 * The enquiry list that used to sit unwired in `sales/` has been deleted. It
 * was unreachable for five sessions and carried its own copies of the loading,
 * empty and error states — a second set with different props from the ones in
 * packages/ui, which is a trap rather than a head start. Rebuild it from the
 * UI mock when Sales is actually picked up.
 */

import { ModuleRoutes, type ModuleRoute } from "../../shell/routing";

const routes: ModuleRoute[] = [
  { path: "sales", module: "sales", element: <Placeholder name="Sales" /> },
  { path: "service", module: "service", element: <Placeholder name="Service" /> },
  { path: "tech-support", module: "tech-support", element: <Placeholder name="Tech support" /> },
];

export default function DmsRoutes() {
  return <ModuleRoutes routes={routes} />;
}

function Placeholder({ name }: { name: string }) {
  return (
    <>
      {/* One h1 per page. The shell provides no heading of its own, so the
          page owns it — which is what every real screen will do too. */}
      <h1>{name}</h1>
      <p>Not built yet.</p>
    </>
  );
}
