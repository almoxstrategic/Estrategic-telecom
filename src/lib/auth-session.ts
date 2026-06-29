import type { Session } from "@supabase/supabase-js";
import { fetchProfile } from "./auth-guards";
import { getSupabaseClient } from "./supabase";
import type { AppUser } from "./types";

let ready = false;
let initPromise: Promise<void> | null = null;
let session: Session | null = null;
let user: AppUser | null = null;
const listeners = new Set<() => void>();

function isClient(): boolean {
  return typeof window !== "undefined";
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthSnapshot() {
  return { ready, session, user, loading: !ready };
}

export function homePathForUser(profile: AppUser): "/" | "/admin" {
  return profile.role === "admin" ? "/admin" : "/";
}

export function waitForAuth(): Promise<void> {
  if (ready || !isClient()) return Promise.resolve();
  void initAuthSession();
  return initPromise ?? Promise.resolve();
}

export function initAuthSession(): Promise<void> {
  if (!isClient()) {
    ready = true;
    return Promise.resolve();
  }

  if (initPromise) return initPromise;

  initPromise = (async () => {
    const supabase = getSupabaseClient();

    const {
      data: { session: initialSession },
    } = await supabase.auth.getSession();

    session = initialSession;
    user = initialSession ? await fetchProfile(initialSession.user.id) : null;
    ready = true;
    notify();

    supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      session = nextSession;
      user = nextSession ? await fetchProfile(nextSession.user.id) : null;
      notify();
    });
  })();

  return initPromise;
}

export function getCachedSession(): Session | null {
  return session;
}

export function getCachedUser(): AppUser | null {
  return user;
}

export function setCachedAuth(nextSession: Session | null, nextUser: AppUser | null) {
  session = nextSession;
  user = nextUser;
  notify();
}
