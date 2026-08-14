export const ADMIN_LAST_TAB_KEY = "adminLastTab";

export const ADMIN_TABS = ["Início", "Miscelâneas", "Serializados", "Lançamentos"] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

export type AdminTabSearch = "inicio" | "miscelaneas" | "serializados" | "lancamentos";

const SEARCH_TO_TAB: Record<AdminTabSearch, AdminTab> = {
  inicio: "Início",
  miscelaneas: "Miscelâneas",
  serializados: "Serializados",
  lancamentos: "Lançamentos",
};

export function isAdminTab(value: string | null): value is AdminTab {
  return ADMIN_TABS.includes(value as AdminTab);
}

export function adminTabFromSearch(tab: string | undefined): AdminTab | null {
  if (
    tab === "inicio" ||
    tab === "miscelaneas" ||
    tab === "serializados" ||
    tab === "lancamentos"
  ) {
    return SEARCH_TO_TAB[tab];
  }
  return null;
}

/** Força a aba Início no painel (logos Header/Sidebar). */
export function resetAdminTabToInicio(): void {
  try {
    sessionStorage.setItem(ADMIN_LAST_TAB_KEY, "Início");
  } catch {
    // sessionStorage indisponível (SSR / privacidade)
  }
}

export function persistAdminTab(tab: AdminTab): void {
  try {
    sessionStorage.setItem(ADMIN_LAST_TAB_KEY, tab);
  } catch {
    // sessionStorage indisponível (SSR / privacidade)
  }
}

export function loadPersistedAdminTab(): AdminTab | null {
  try {
    const saved = sessionStorage.getItem(ADMIN_LAST_TAB_KEY);
    return isAdminTab(saved) ? saved : null;
  } catch {
    return null;
  }
}
