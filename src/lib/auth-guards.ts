import { redirect } from "@tanstack/react-router";
import { getSupabaseClient } from "./supabase";
import {
  getCachedSession,
  getCachedUser,
  homePathForUser,
  waitForAuth,
} from "./auth-session";
import {
  canAccessAdminPanel,
  canAccessImportacaoPainelMenu,
  canAccessKpisMenus,
  canAccessMiscelaneasMenus,
  canAccessSerializadosMenus,
  canManageTeam,
  isTecnicoTransmissaoRole,
  normalizeUserRole,
} from "./roles";
import type { AppUser } from "./types";

export const MSG_USUARIO_DESLIGADO = "Usuário desligado";

function isClient(): boolean {
  return typeof window !== "undefined";
}

function normalizeProfileStatus(value: unknown): "ATIVO" | "DEMITIDO" {
  return String(value ?? "")
    .trim()
    .toUpperCase() === "DEMITIDO"
    ? "DEMITIDO"
    : "ATIVO";
}

export function isUsuarioDesligado(
  user: Pick<AppUser, "status"> | null | undefined,
): boolean {
  return user?.status === "DEMITIDO";
}

/**
 * Encerra a sessão se o perfil estiver demitido.
 * Retorna null quando o usuário não pode seguir.
 */
export async function enforceUsuarioAtivo(
  profile: AppUser | null,
): Promise<AppUser | null> {
  if (!profile) return null;
  if (!isUsuarioDesligado(profile)) return profile;
  await getSupabaseClient().auth.signOut();
  return null;
}

/**
 * Perfil do usuário logado — sempre filtrado por id (nunca por role).
 * Evita PGRST116/.single() quando existem vários admins/gerentes.
 */
export async function fetchProfile(userId: string): Promise<AppUser | null> {
  if (!userId) return null;

  const supabase = getSupabaseClient();
  let profile: {
    id: string;
    nome: string;
    role: string | null;
    identificacao: string | null;
    login: string | null;
    status?: string | null;
  } | null = null;

  const withStatus = await supabase
    .from("profiles")
    .select("id, nome, role, identificacao, login, status")
    .eq("id", userId)
    .maybeSingle();

  if (!withStatus.error) {
    profile = withStatus.data;
  } else {
    const fallback = await supabase
      .from("profiles")
      .select("id, nome, role, identificacao, login")
      .eq("id", userId)
      .maybeSingle();
    if (fallback.error) {
      console.error("Erro ao carregar perfil:", fallback.error.message);
      return null;
    }
    profile = fallback.data;
  }

  if (!profile) return null;

  const { data: authData } = await supabase.auth.getUser();
  const email = authData.user?.email ?? "";

  return {
    id: profile.id,
    email,
    identificacao: profile.identificacao ?? undefined,
    login: profile.login ?? undefined,
    nome: profile.nome,
    role: normalizeUserRole(profile.role),
    status: normalizeProfileStatus(profile.status),
  };
}

export async function requireAuth(): Promise<AppUser> {
  if (!isClient()) {
    return { id: "", email: "", nome: "", role: "tecnico", status: "ATIVO" };
  }

  await waitForAuth();

  const activeSession = getCachedSession();
  if (!activeSession) {
    throw redirect({ to: "/login" });
  }

  const profile = await enforceUsuarioAtivo(getCachedUser());
  if (!profile) {
    throw redirect({ to: "/login" });
  }

  return profile;
}

export async function requireGuest() {
  if (!isClient()) return;

  await waitForAuth();

  const profile = getCachedUser();
  if (profile) {
    throw redirect({ to: homePathForUser(profile) });
  }
}

/** Painel Admin (inclui COP em modo visualização). */
export async function requireAdmin(): Promise<AppUser> {
  const authUser = await requireAuth();
  if (!canAccessAdminPanel(authUser.role)) {
    throw redirect({ to: "/" });
  }
  return authUser;
}

/** Cadastro / mutações de equipe: só Admin e Gerente. */
export async function requireTeamManager(): Promise<AppUser> {
  const authUser = await requireAuth();
  if (!canManageTeam(authUser.role)) {
    throw redirect({ to: "/tecnicos" });
  }
  return authUser;
}

export async function requireTecnico(): Promise<AppUser> {
  const authUser = await requireAuth();
  if (!canAccessAdminPanel(authUser.role)) {
    return authUser;
  }
  throw redirect({ to: "/admin" });
}

/** Relatório de lançamento: apenas Técnico Transmissão. */
export async function requireTecnicoTransmissao(): Promise<AppUser> {
  const authUser = await requireTecnico();
  if (!isTecnicoTransmissaoRole(authUser.role)) {
    throw redirect({ to: "/" });
  }
  return authUser;
}

export async function requireTecnicoOrAdmin(): Promise<AppUser> {
  return requireAuth();
}

const SUPERVISOR_TRANSMISSAO_HOME = "/admin/transmissao" as const;

/** Rotas Miscelâneas — bloqueia supervisor de transmissão. */
export async function requireMiscelaneasAccess(): Promise<AppUser> {
  const authUser = await requireAdmin();
  if (isSupervisorTransmissaoRestricted(authUser.role)) {
    throw redirect({ to: SUPERVISOR_TRANSMISSAO_HOME });
  }
  return authUser;
}

/** Rotas Serializados — bloqueia supervisor de transmissão. */
export async function requireSerializadosAccess(): Promise<AppUser> {
  const authUser = await requireAdmin();
  if (isSupervisorTransmissaoRestricted(authUser.role)) {
    throw redirect({ to: SUPERVISOR_TRANSMISSAO_HOME });
  }
  return authUser;
}

function isSupervisorTransmissaoRestricted(role: AppUser["role"]): boolean {
  return normalizeUserRole(role) === "supervisor_transmissao";
}

/** Importação: supervisor de transmissão não acessa o módulo. */
export async function requireImportacaoPainelAccess(): Promise<AppUser> {
  const authUser = await requireAdmin();
  if (!canAccessImportacaoPainelMenu(authUser.role)) {
    throw redirect({ to: SUPERVISOR_TRANSMISSAO_HOME });
  }
  return authUser;
}

/** KPIs: supervisor de transmissão não acessa o módulo. */
export async function requireKpisAccess(): Promise<AppUser> {
  const authUser = await requireAdmin();
  if (!canAccessKpisMenus(authUser.role)) {
    throw redirect({ to: SUPERVISOR_TRANSMISSAO_HOME });
  }
  return authUser;
}

/** Importação: supervisor de transmissão só na aba TOA (legado — preferir requireImportacaoPainelAccess). */
export async function requireImportacaoTabAccess(
  tab: "miscelaneas" | "serializados" | "toa",
): Promise<AppUser> {
  const authUser = await requireImportacaoPainelAccess();
  if (tab === "miscelaneas" && !canAccessMiscelaneasMenus(authUser.role)) {
    throw redirect({ to: SUPERVISOR_TRANSMISSAO_HOME });
  }
  if (tab === "serializados" && !canAccessSerializadosMenus(authUser.role)) {
    throw redirect({ to: SUPERVISOR_TRANSMISSAO_HOME });
  }
  return authUser;
}

/** Rota raiz: sem sessão → login; painel (admin/gerente/cop) → /admin. */
export async function requireHomeEntry(): Promise<AppUser> {
  if (!isClient()) {
    return { id: "", email: "", nome: "", role: "tecnico", status: "ATIVO" };
  }

  await waitForAuth();

  const activeSession = getCachedSession();
  if (!activeSession) {
    throw redirect({ to: "/login" });
  }

  const profile = await enforceUsuarioAtivo(getCachedUser());
  if (!profile) {
    throw redirect({ to: "/login" });
  }

  if (canAccessAdminPanel(profile.role)) {
    throw redirect({ to: "/admin" });
  }

  return profile;
}
