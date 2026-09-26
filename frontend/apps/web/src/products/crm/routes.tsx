import { Route, Routes } from "react-router-dom";

/**
 * CRM --- organization level, no business units (C5).
 *
 * Built after DMS ships.
 */
export default function CrmRoutes() {
  return (
    <Routes>
      <Route index element={<div>CRM</div>} />
    </Routes>
  );
}
