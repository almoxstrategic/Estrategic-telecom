import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/kpis/")({
  beforeLoad: () => {
    throw redirect({
      to: "/admin/kpis/$modulo",
      params: { modulo: "resumo-geral" },
    });
  },
});
