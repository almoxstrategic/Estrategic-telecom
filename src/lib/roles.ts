import type { UserRole } from "./types";

/** Roles persistidas no banco (lowercase, sem acento). */
export const USER_ROLES = [
  "tecnico",
  "admin",
  "gerente",
  "cop",
  "transmissao",
  "supervisor_iat",
  "supervisor_transmissao",
] as const;

/** Acesso total de escrita no painel (equivalentes ao Admin). */
export const PAINEL_FULL_ROLES = [
  "admin",
  "gerente",
  "supervisor_iat",
  "supervisor_transmissao",
] as const;

/** Acesso ao Painel Admin (visão + rotas base), inclui COP. */
export const PAINEL_ACCESS_ROLES = [
  "admin",
  "gerente",
  "cop",
  "supervisor_iat",
  "supervisor_transmissao",
] as const;

export type PainelFullRole = (typeof PAINEL_FULL_ROLES)[number];
export type PainelAccessRole = (typeof PAINEL_ACCESS_ROLES)[number];

export const ROLE_SELECT_OPTIONS = [
  { value: "TECNICO", role: "tecnico" as const, label: "Técnico" },
  {
    value: "TRANSMISSAO",
    role: "transmissao" as const,
    label: "Técnico Transmissão",
  },
  { value: "ADMIN", role: "admin" as const, label: "Admin" },
  { value: "GERENTE", role: "gerente" as const, label: "Gerente" },
  { value: "COP", role: "cop" as const, label: "COP" },
  {
    value: "SUPERVISOR_IAT",
    role: "supervisor_iat" as const,
    label: "Supervisor de IAT",
  },
  {
    value: "SUPERVISOR_TRANSMISSAO",
    role: "supervisor_transmissao" as const,
    label: "Supervisor de Transmissão",
  },
] as const;

const USER_ROLE_SET = new Set<string>(USER_ROLES);

export function normalizeUserRole(value: unknown): UserRole {
  const role = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\s-]+/g, "_");
  if (USER_ROLE_SET.has(role)) {
    return role as UserRole;
  }
  return "tecnico";
}

/** Converte value do select (TECNICO/ADMIN/…) para role do banco. */
export function roleFromPoderesSelect(value: string): UserRole {
  const fromSelect = ROLE_SELECT_OPTIONS.find((opt) => opt.value === value);
  if (fromSelect) return fromSelect.role;
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
    case "transmissao":
      return "Técnico Transmissão";
    case "supervisor_iat":
      return "Supervisor de IAT";
    case "supervisor_transmissao":
      return "Supervisor de Transmissão";
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

export function isCopRole(role: string | null | undefined): boolean {
  return normalizeUserRole(role) === "cop";
}

/** Upload/overwrite TOA: admin, gerente, supervisores e COP. */
export function canImportToa(role: string | null | undefined): boolean {
  return (PAINEL_ACCESS_ROLES as readonly string[]).includes(
    normalizeUserRole(role),
  );
}

/** Demais abas de Importação (Miscelâneas / Serializados / Analítico). COP só vê TOA. */
export function canAccessImportacaoAbasCompletas(
  role: string | null | undefined,
): boolean {
  return hasPainelFullAccess(role) && !isSupervisorTransmissaoRole(role);
}

/** KPIs e menu Importação: full roles + COP; não supervisor de transmissão. */
function hasPainelKpiImportMenuAccess(
  role: string | null | undefined,
): boolean {
  if (isSupervisorTransmissaoRole(role)) return false;
  return hasPainelFullAccess(role) || isCopRole(role);
}

/** Importação de dados do painel (TOA + Analítico): admin, gerente, supervisores e COP. */
export function canImportPainelDados(
  role: string | null | undefined,
): boolean {
  return canAccessAdminPanel(role);
}

export function isTecnicoCampoRole(role: string | null | undefined): boolean {
  return normalizeUserRole(role) === "tecnico";
}

export function isTecnicoTransmissaoRole(role: string | null | undefined): boolean {
  return normalizeUserRole(role) === "transmissao";
}

export function isSupervisorTransmissaoRole(
  role: string | null | undefined,
): boolean {
  return normalizeUserRole(role) === "supervisor_transmissao";
}

/** Miscelâneas: admin, gerente e supervisor IAT — não supervisor de transmissão. */
export function canAccessMiscelaneasMenus(
  role: string | null | undefined,
): boolean {
  return hasPainelFullAccess(role) && !isSupervisorTransmissaoRole(role);
}

/** Serializados: admin, gerente e supervisor IAT — não supervisor de transmissão. */
export function canAccessSerializadosMenus(
  role: string | null | undefined,
): boolean {
  return hasPainelFullAccess(role) && !isSupervisorTransmissaoRole(role);
}

/** Menu Transmissão na sidebar (inclui supervisor de transmissão). */
export function canAccessTransmissaoMenu(
  role: string | null | undefined,
): boolean {
  return hasPainelFullAccess(role);
}

/** KPIs no Painel Admin / sidebar — inclui COP; não supervisor de transmissão. */
export function canAccessKpisMenus(role: string | null | undefined): boolean {
  return hasPainelKpiImportMenuAccess(role);
}

/** Importação no Painel Admin / sidebar — inclui COP (aba TOA); não supervisor de transmissão. */
export function canAccessImportacaoPainelMenu(
  role: string | null | undefined,
): boolean {
  return hasPainelKpiImportMenuAccess(role);
}

/** Gestão de equipe restrita ao setor de Transmissão. */
export function isSupervisorTransmissaoTeamScope(
  role: string | null | undefined,
): boolean {
  return isSupervisorTransmissaoRole(role);
}

/** CRUD de colaborador permitido para o gestor autenticado. */
export function canManageColaboradorEquipe(
  managerRole: string | null | undefined,
  colaboradorRole: string | null | undefined,
): boolean {
  if (!canManageTeam(managerRole)) return false;
  if (isSupervisorTransmissaoRole(managerRole)) {
    return normalizeUserRole(colaboradorRole) === "transmissao";
  }
  return true;
}

export type MatriculaCadastroPolicy = "required" | "optional" | "none";

/** Regra de matrícula no cadastro de usuários. */
export function matriculaCadastroPolicy(
  role: string | null | undefined,
): MatriculaCadastroPolicy {
  switch (normalizeUserRole(role)) {
    case "tecnico":
      return "required";
    case "transmissao":
      return "optional";
    default:
      return "none";
  }
}

/** @deprecated Use canAccessMiscelaneasMenus / canAccessSerializadosMenus. */
export function canAccessOperacionalMenus(
  role: string | null | undefined,
): boolean {
  return hasPainelFullAccess(role);
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
