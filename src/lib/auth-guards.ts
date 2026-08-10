import { redirect } from "@tanstack/react-router";
import { getSupabaseClient } from "./supabase";
import {
  getCachedSession,
  getCachedUser,
  homePathForUser,
  waitForAuth,
} from "./auth-session";
import { hasPainelAdminAccess, normalizeUserRole } from "./roles";
import type { AppUser } from "./types";

function isClient(): boolean {
  return typeof window !== "undefined";
}

/**
 * Perfil do usuário logado — sempre filtrado por id (nunca por role).
 * Evita PGRST116/.single() quando existem vários admins/gerentes.
 */
export async function fetchProfile(userId: string): Promise<AppUser | null> {
  if (!userId) return null;

  const supabase = getSupabaseClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, nome, role, identificacao, login")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.error("Erro ao carregar perfil:", profileError.message);
    return null;
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
  };
}

export async function requireAuth(): Promise<AppUser> {
  if (!isClient()) {
    return { id: "", email: "", nome: "", role: "tecnico" };
  }

  await waitForAuth();

  const activeSession = getCachedSession();
  if (!activeSession) {
    throw redirect({ to: "/login" });
  }

  const profile = getCachedUser();
  if (!profile) {
    await getSupabaseClient().auth.signOut();
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

export async function requireAdmin(): Promise<AppUser> {
  const authUser = await requireAuth();
  if (!hasPainelAdminAccess(authUser.role)) {
    throw redirect({ to: "/" });
  }
  return authUser;
}

export async function requireTecnico(): Promise<AppUser> {
  const authUser = await requireAuth();
  if (!hasPainelAdminAccess(authUser.role)) {
    return authUser;
  }
  throw redirect({ to: "/admin" });
}

export async function requireTecnicoOrAdmin(): Promise<AppUser> {
  return requireAuth();
}

/** Rota raiz: sem sessão → login; admin/gerente → painel admin. */
export async function requireHomeEntry(): Promise<AppUser> {
  if (!isClient()) {
    return { id: "", email: "", nome: "", role: "tecnico" };
  }

  await waitForAuth();

  const activeSession = getCachedSession();
  if (!activeSession) {
    throw redirect({ to: "/login" });
  }

  const profile = getCachedUser();
  if (!profile) {
    await getSupabaseClient().auth.signOut();
    throw redirect({ to: "/login" });
  }

  if (hasPainelAdminAccess(profile.role)) {
    throw redirect({ to: "/admin" });
  }

  return profile;
}
