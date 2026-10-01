import { Route, Routes } from "react-router-dom";
import { EcommerceLayout } from "./screens/EcommerceLayout";
import { StoreCatalogScreen } from "./screens/StoreCatalogScreen";
import { MyOrdersScreen } from "./screens/MyOrdersScreen";

export default function EcommerceRoutes() {
  return (
    <Routes>
      <Route path="/" element={<EcommerceLayout />}>
        <Route path="catalog" element={<StoreCatalogScreen />} />
        <Route path="orders" element={<MyOrdersScreen />} />
      </Route>
    </Routes>
  );
}
