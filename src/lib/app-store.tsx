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
import { fetchProfile } from "./auth-guards";
import {
  getAuthSnapshot,
  initAuthSession,
  setCachedAuth,
  subscribeAuth,
  waitForAuth,
} from "./auth-session";
import { parseLoginIdentifier } from "./auth-identificacao";
import { getSupabaseClient } from "./supabase";
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

function syncFromCache(
  setSession: (session: Session | null) => void,
  setUser: (user: AppUser | null) => void,
) {
  const { session, user } = getAuthSnapshot();
  setSession(session);
  setUser(user);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void (async () => {
      await initAuthSession();
      await waitForAuth();
      if (!active) return;
      syncFromCache(setSession, setUser);
      setLoading(false);
    })();

    const unsubscribe = subscribeAuth(() => {
      if (!active) return;
      syncFromCache(setSession, setUser);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (identificacao: string, password: string) => {
    const supabase = getSupabaseClient();
    const authEmail = parseLoginIdentifier(identificacao);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });
    if (error) throw error;

    const profile = await fetchProfile(data.session.user.id);
    if (!profile) throw new Error("Perfil não encontrado.");

    setCachedAuth(data.session, profile);
    setSession(data.session);
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    setCachedAuth(null, null);
    setUser(null);
    setSession(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const supabase = getSupabaseClient();
    const {
      data: { session: current },
    } = await supabase.auth.getSession();

    if (!current) {
      setCachedAuth(null, null);
      setSession(null);
      setUser(null);
      return null;
    }

    const profile = await fetchProfile(current.user.id);
    setCachedAuth(current, profile);
    setSession(current);
    setUser(profile);
    return profile;
  }, []);

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
