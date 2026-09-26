import { Navigate, Route, Routes } from "react-router-dom";

/**
 * DMS --- dealership management. The only unit-aware app (C5).
 *
 * Records are scoped to the user's dealer by the backend; the frontend never
 * filters by unit itself.
 *
 * THE MODULE LIST IS NOT SETTLED (Q19 in context/04-OPEN-QUESTIONS.md). These
 * three are the ones with backend scaffolding behind them. The original design
 * docs name a longer set, and org-level dealer management has no home here yet
 * even though C3 requires one.
 *
 * The placeholders exist so the sidebar does not link to blank pages. They are
 * deliberately empty of everything except a heading: a placeholder that invents
 * a table or a filter bar is a design decision made by accident.
 *
 * Also unwired, on purpose: `sales/screens/EnquiryListScreen` is fully built and
 * reachable from nothing. Pointing `sales` at it is a real decision — it would
 * start calling an API that does not exist yet — so it waits for an answer
 * rather than being quietly switched on here.
 */
export default function DmsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="sales" replace />} />
      <Route path="sales" element={<Placeholder name="Sales" />} />
      <Route path="service" element={<Placeholder name="Service" />} />
      <Route path="tech-support" element={<Placeholder name="Tech support" />} />
      <Route path="*" element={<Placeholder name="Not found" />} />
    </Routes>
  );
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
