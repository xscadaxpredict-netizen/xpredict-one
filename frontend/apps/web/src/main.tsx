import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { router } from "./router";
import { useApplyTheme } from "./shell/hooks/useTheme";
import "./styles/tokens.css";
import "./styles/global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Server state is never assumed fresh across an org switch: every query
      // key includes the org slug, so switching orgs refetches rather than
      // showing the previous organization's cached data.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root is missing from index.html");
}

/**
 * Wraps the router so the stored theme is applied before anything renders.
 *
 * Above the router on purpose: the theme is a property of the whole document,
 * not of whichever screen happens to be open, and applying it inside a route
 * would drop it on every screen that route does not cover — the auth screens
 * most of all.
 */
function App() {
  useApplyTheme();

  return <RouterProvider router={router} />;
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
