import { createFileRoute, redirect } from "@tanstack/react-router";
import { requireKpisAccess } from "@/lib/auth-guards";

export const Route = createFileRoute("/admin/kpis/")({
  beforeLoad: async () => {
    await requireKpisAccess();
    throw redirect({
      to: "/admin/kpis/$modulo",
      params: { modulo: "baixa-consumo-miscelanea" },
    });
  },
});
