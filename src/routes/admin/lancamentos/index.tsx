import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/lancamentos/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/transmissao" });
  },
});
