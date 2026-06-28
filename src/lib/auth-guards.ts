import { redirect } from "@tanstack/react-router";
import { getSupabaseClient } from "./supabase";
import type { AppUser, UserRole } from "./types";

function isClient(): boolean {
  return typeof window !== "undefined";
}

export async function fetchProfile(userId: string): Promise<AppUser | null> {
  const supabase = getSupabaseClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, nome, role, identificacao, login")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) return null;

  const { data: authData } = await supabase.auth.getUser();
  const email = authData.user?.email ?? "";

  return {
    id: profile.id,
    email,
    identificacao: profile.identificacao ?? undefined,
    login: profile.login ?? undefined,
    nome: profile.nome,
    role: profile.role as UserRole,
  };
}

export async function requireAuth(): Promise<AppUser> {
  if (!isClient()) {
    return { id: "", email: "", nome: "", role: "tecnico" };
  }

  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw redirect({ to: "/login" });
  }

  const profile = await fetchProfile(session.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    throw redirect({ to: "/login" });
  }

  return profile;
}

export async function requireGuest() {
  if (!isClient()) return;

  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    const profile = await fetchProfile(session.user.id);
    throw redirect({ to: profile?.role === "admin" ? "/admin" : "/" });
  }
}

export async function requireAdmin(): Promise<AppUser> {
  const user = await requireAuth();
  if (user.role !== "admin") {
    throw redirect({ to: "/" });
  }
  return user;
}

export async function requireTecnico(): Promise<AppUser> {
  const user = await requireAuth();
  if (user.role !== "tecnico") {
    throw redirect({ to: "/admin" });
  }
  return user;
}

export async function requireTecnicoOrAdmin(): Promise<AppUser> {
  return requireAuth();
}
