import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/lancamentos/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/transmissao/$id",
      params: { id: params.id },
    });
  },
});
