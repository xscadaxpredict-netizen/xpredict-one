import { Route, Routes } from "react-router-dom";

/**
 * CRM --- organization level, no business units (C5).
 *
 * Built after DMS ships. Its sidebar is empty in `shell/navigation.ts` and says
 * so, rather than listing modules nobody has agreed on.
 */
export default function CrmRoutes() {
  return (
    <Routes>
      <Route index element={<CrmPlaceholder />} />
      <Route path="*" element={<CrmPlaceholder />} />
    </Routes>
  );
}

function CrmPlaceholder() {
  return (
    <>
      <h1>CRM</h1>
      <p>Not built yet. DMS ships first.</p>
    </>
  );
}
