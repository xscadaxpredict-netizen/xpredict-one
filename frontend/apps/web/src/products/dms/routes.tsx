import { Route, Routes } from "react-router-dom";

/**
 * DMS --- dealership management. The only unit-aware app (C5).
 *
 * Records are scoped to the user's dealer by the backend; the frontend never
 * filters by unit itself. Modules arrive in Phase 5: dealers, catalog,
 * enquiries, quotations, inventory, service.
 */
export default function DmsRoutes() {
  return (
    <Routes>
      <Route index element={<div>DMS</div>} />
    </Routes>
  );
}
