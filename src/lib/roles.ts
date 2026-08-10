import type { UserRole } from "./types";

/** Papéis com acesso ao Painel Admin / KPIs / APIs administrativas. */
export const PAINEL_ADMIN_ROLES = ["admin", "gerente"] as const;

export type PainelAdminRole = (typeof PAINEL_ADMIN_ROLES)[number];

export function normalizeUserRole(value: unknown): UserRole {
  const role = String(value ?? "")
    .trim()
    .toLowerCase();
  if (role === "admin" || role === "gerente" || role === "tecnico") {
    return role;
  }
  return "tecnico";
}

export function isPainelAdminRole(
  role: string | null | undefined,
): role is PainelAdminRole {
  const normalized = String(role ?? "")
    .trim()
    .toLowerCase();
  return (PAINEL_ADMIN_ROLES as readonly string[]).includes(normalized);
}

export function hasPainelAdminAccess(
  role: string | null | undefined,
): boolean {
  return isPainelAdminRole(role);
}
