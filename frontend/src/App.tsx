import { RouterProvider, createRouter, createRoute, createRootRoute, Outlet } from '@tanstack/react-router';
import { Toaster } from '@/components/ui/sonner';
import { Layout } from '@/components/Layout';
import DashboardPage from '@/pages/DashboardPage';
import DataEntryPage from '@/pages/DataEntryPage';
import ReportPage from '@/pages/ReportPage';

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
  path: '/',
  component: DashboardPage,
});

const entryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/entry',
  component: DataEntryPage,
});

const reportRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/report',
  component: ReportPage,
});

const routeTree = rootRoute.addChildren([dashboardRoute, entryRoute, reportRoute]);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
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
