import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/auth-guards";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => requireAdmin(),
  component: AdminLayout,
});

function AdminLayout() {
  return <Outlet />;
}
