import { Layout } from "@/components/Layout";
import { Toaster } from "@/components/ui/sonner";
import DashboardPage from "@/pages/DashboardPage";
import DataEntryPage from "@/pages/DataEntryPage";
import ReportPage from "@/pages/ReportPage";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

// Root route with layout
const rootRoute = createRootRoute({
  component: () => (
    <Layout>
      <Outlet />
    </Layout>
  ),
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const entryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/entry",
  component: DataEntryPage,
});

const reportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/report",
  component: ReportPage,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  entryRoute,
  reportRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </>
  );
}
