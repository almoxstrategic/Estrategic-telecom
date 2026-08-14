import type { UserRole } from "./types";

/** Roles persistidas no banco (lowercase, sem acento). */
export const USER_ROLES = ["tecnico", "admin", "gerente", "cop"] as const;

/** Acesso total de escrita no painel (equivalentes). */
export const PAINEL_FULL_ROLES = ["admin", "gerente"] as const;

/** Acesso ao Painel Admin (visão + rotas base), inclui COP. */
export const PAINEL_ACCESS_ROLES = ["admin", "gerente", "cop"] as const;

export type PainelFullRole = (typeof PAINEL_FULL_ROLES)[number];
export type PainelAccessRole = (typeof PAINEL_ACCESS_ROLES)[number];

export const ROLE_SELECT_OPTIONS = [
  { value: "TECNICO", role: "tecnico" as const, label: "Técnico" },
  { value: "ADMIN", role: "admin" as const, label: "Admin" },
  { value: "GERENTE", role: "gerente" as const, label: "Gerente" },
  { value: "COP", role: "cop" as const, label: "COP" },
] as const;

export function normalizeUserRole(value: unknown): UserRole {
  const role = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (
    role === "admin" ||
    role === "gerente" ||
    role === "tecnico" ||
    role === "cop"
  ) {
    return role;
  }
  return "tecnico";
}

/** Converte value do select (TECNICO/ADMIN/…) para role do banco. */
export function roleFromPoderesSelect(value: string): UserRole {
  return normalizeUserRole(value);
}

export function roleLabel(role: string | null | undefined): string {
  switch (normalizeUserRole(role)) {
    case "admin":
      return "Administrador";
    case "gerente":
      return "Gerente";
    case "cop":
      return "COP";
    default:
      return "Técnico";
  }
}

export function hasPainelFullAccess(
  role: string | null | undefined,
): boolean {
  return (PAINEL_FULL_ROLES as readonly string[]).includes(
    normalizeUserRole(role),
  );
}

/** @deprecated Prefer hasPainelFullAccess — mantido para APIs existentes. */
export function hasPainelAdminAccess(
  role: string | null | undefined,
): boolean {
  return hasPainelFullAccess(role);
}

export function canAccessAdminPanel(
  role: string | null | undefined,
): boolean {
  return (PAINEL_ACCESS_ROLES as readonly string[]).includes(
    normalizeUserRole(role),
  );
}

export function canManageTeam(role: string | null | undefined): boolean {
  return hasPainelFullAccess(role);
}

export function canAccessOperacionalMenus(
  role: string | null | undefined,
): boolean {
  return hasPainelFullAccess(role);
}

export function isCopRole(role: string | null | undefined): boolean {
  return normalizeUserRole(role) === "cop";
}

/** Upload/overwrite TOA: admin, gerente e COP. */
export function canImportToa(role: string | null | undefined): boolean {
  return (PAINEL_ACCESS_ROLES as readonly string[]).includes(
    normalizeUserRole(role),
  );
}

/** Demais abas de Importação (Miscelâneas / Serializados / Analítico).
 * Mesmo acesso do painel: admin, gerente e COP — sem divergência de payload/colunas. */
export function canAccessImportacaoAbasCompletas(
  role: string | null | undefined,
): boolean {
  return canAccessAdminPanel(role);
}

/** Importação de dados do painel (TOA + Analítico): admin, gerente e COP. */
export function canImportPainelDados(
  role: string | null | undefined,
): boolean {
  return canAccessAdminPanel(role);
}

export function isTecnicoCampoRole(role: string | null | undefined): boolean {
  return normalizeUserRole(role) === "tecnico";
}

/** Conta master — não deve aparecer na Gestão de Equipe nem ser demitida. */
export function isMasterAdminRole(role: string | null | undefined): boolean {
  return normalizeUserRole(role) === "admin";
}

const MASTER_ADMIN_EMAILS = new Set(["admin@estrategic.com"]);

export function isMasterAdminAccount(params: {
  role?: string | null;
  email?: string | null;
  login?: string | null;
}): boolean {
  if (isMasterAdminRole(params.role)) return true;
  const email = String(params.email ?? "")
    .trim()
    .toLowerCase();
  if (email && MASTER_ADMIN_EMAILS.has(email)) return true;
  const login = String(params.login ?? "")
    .trim()
    .toLowerCase();
  return login === "admin";
}
