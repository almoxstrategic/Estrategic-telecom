import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase";
import { parseLoginIdentifier } from "./auth-identificacao";
import { fetchProfile } from "./auth-guards";
import type { AppUser } from "./types";

type AuthState = {
  user: AppUser | null;
  session: Session | null;
  loading: boolean;
  login: (identificacao: string, password: string) => Promise<AppUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AppUser | null>;
  getAccessToken: () => string | null;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrateSession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    if (!nextSession) {
      setUser(null);
      return null;
    }
    const profile = await fetchProfile(nextSession.user.id);
    setUser(profile);
    return profile;
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      void hydrateSession(nextSession);
      if (event === "INITIAL_SESSION") {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [hydrateSession]);

  const login = useCallback(async (identificacao: string, password: string) => {
    const supabase = getSupabaseClient();
    const authEmail = parseLoginIdentifier(identificacao);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });
    if (error) throw error;
    const profile = await hydrateSession(data.session);
    if (!profile) throw new Error("Perfil não encontrado.");
    return profile;
  }, [hydrateSession]);

  const logout = useCallback(async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const supabase = getSupabaseClient();
    const {
      data: { session: current },
    } = await supabase.auth.getSession();
    return hydrateSession(current);
  }, [hydrateSession]);

  const getAccessToken = useCallback(() => session?.access_token ?? null, [session]);

  const value = useMemo(
    () => ({ user, session, loading, login, logout, refreshUser, getAccessToken }),
    [user, session, loading, login, logout, refreshUser, getAccessToken],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

/** @deprecated Use Evidencia from ./types */
export type { Evidencia as EvidenceRecord } from "./types";
