import { useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Building2,
  CalendarClock,
  ChartColumn,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileUp,
  LogOut,
  Home,
  Map,
  Send,
  ShieldCheck,
  Database,
  TrendingUp,
  UserSearch,
  Users,
  Warehouse,
} from "lucide-react";
import { Logo } from "./Logo";
import { useApp } from "@/lib/app-store";
import { resetAdminTabToInicio } from "@/lib/admin-tab";

const MISCELANEAS_PATHS = [
  "/todos",
  "/admin/pendencias",
  "/previsao-reserva",
  "/media-baixa-tecnico",
  "/estoque-base",
  "/admin/enviar-evidencia",
] as const;

const SERIALIZADOS_PATHS = ["/estoque-atlas", "/estoque-tecnico"] as const;

function isAdminHomePath(pathname: string): boolean {
  return pathname === "/admin" || pathname === "/admin/";
}

function pathMatches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function matchesMiscelaneasGroup(
  pathname: string,
  tab: string | undefined,
): boolean {
  if (isAdminHomePath(pathname)) return false;
  if (pathMatches(pathname, "/admin/kpis")) return false;
  if (pathMatches(pathname, "/tecnicos")) return false;
  if (MISCELANEAS_PATHS.some((p) => pathMatches(pathname, p))) return true;
  if (pathMatches(pathname, "/admin/importacao")) {
    return tab !== "serializados";
  }
  return false;
}

function matchesSerializadosGroup(
  pathname: string,
  tab: string | undefined,
): boolean {
  if (isAdminHomePath(pathname)) return false;
  if (SERIALIZADOS_PATHS.some((p) => pathMatches(pathname, p))) return true;
  if (pathMatches(pathname, "/admin/importacao")) {
    return tab === "serializados";
  }
  return false;
}

function matchesKpiGroup(pathname: string): boolean {
  return (
    pathname.includes("/resumo-geral") || pathname.includes("/desempenho-tecnico")
  );
}

function matchesPainelAdminGroup(pathname: string): boolean {
  return (
    isAdminHomePath(pathname) ||
    pathMatches(pathname, "/admin/kpis") ||
    pathMatches(pathname, "/tecnicos")
  );
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const { pathname, search } = useRouterState({
    select: (s) => ({
      pathname: s.location.pathname,
      search: s.location.search as { tab?: string },
    }),
  });
  const tab = typeof search.tab === "string" ? search.tab : undefined;

  const [isAdminOpen, setIsAdminOpen] = useState(() =>
    matchesPainelAdminGroup(pathname),
  );
  const [isMiscelaneaOpen, setIsMiscelaneaOpen] = useState(() =>
    matchesMiscelaneasGroup(pathname, tab),
  );
  const [isSerializadosOpen, setIsSerializadosOpen] = useState(() =>
    matchesSerializadosGroup(pathname, tab),
  );
  const [isKpiOpen, setIsKpiOpen] = useState(() => matchesKpiGroup(pathname));

  useEffect(() => {
    if (isAdminHomePath(pathname)) {
      setIsMiscelaneaOpen(false);
      setIsSerializadosOpen(false);
      setIsAdminOpen(true);
      return;
    }
    setIsMiscelaneaOpen(matchesMiscelaneasGroup(pathname, tab));
    setIsSerializadosOpen(matchesSerializadosGroup(pathname, tab));
    if (matchesPainelAdminGroup(pathname)) {
      setIsAdminOpen(true);
    }
    if (matchesKpiGroup(pathname)) {
      setIsKpiOpen(true);
    }
  }, [pathname, tab]);

  const handleLogout = async () => {
    await logout();
    onNavigate?.();
    navigate({ to: "/login" });
  };

  return (
    <nav className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="shrink-0 border-b border-sidebar-border p-5">
        <Link
          to="/admin"
          search={{ tab: "inicio" }}
          aria-label="Ir para o Início do painel"
          className="inline-flex cursor-pointer transition-opacity hover:opacity-80"
          onClick={() => {
            resetAdminTabToInicio();
            onNavigate?.();
          }}
        >
          <Logo />
        </Link>
        {user && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {isAdmin ? "Administrador" : "Técnico"}
            </div>
            <div className="truncate font-semibold">{user.nome}</div>
            <div className="truncate text-xs text-muted-foreground">
              {isAdmin
                ? (user.login ?? user.email)
                : user.identificacao
                  ? `Matrícula ${user.identificacao}`
                  : (user.login ?? user.email)}
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {isAdmin ? (
          <>
            <div>
              <button
                type="button"
                onClick={() => setIsAdminOpen((open) => !open)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent ${
                  matchesPainelAdminGroup(pathname)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : ""
                }`}
              >
                <span className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Painel Admin
                </span>
                {isAdminOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
                )}
              </button>
              {isAdminOpen && (
                <div className="space-y-1 pl-8 pt-1">
                  <Link
                    to="/admin"
                    search={{ tab: "inicio" }}
                    onClick={() => {
                      resetAdminTabToInicio();
                      onNavigate?.();
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent ${
                      isAdminHomePath(pathname)
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : ""
                    }`}
                  >
                    <Home className="h-5 w-5 text-primary" />
                    Início
                  </Link>
                  <Link
                    to="/tecnicos"
                    onClick={onNavigate}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent ${
                      pathMatches(pathname, "/tecnicos")
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : ""
                    }`}
                  >
                    <Users className="h-5 w-5 text-primary" />
                    Gestão de Equipe
                  </Link>
                  <div>
                    <button
                      type="button"
                      onClick={() => setIsKpiOpen((open) => !open)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent ${
                        matchesKpiGroup(pathname)
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : ""
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <BarChart3 className="h-5 w-5 text-primary" />
                        KPI&apos;s
                      </span>
                      {isKpiOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform" />
                      )}
                    </button>
                    {isKpiOpen && (
                      <div className="mt-1 space-y-1 pl-10">
                        <Link
                          to="/admin/kpis/$modulo"
                          params={{ modulo: "resumo-geral" }}
                          onClick={onNavigate}
                          className={`block rounded-md p-2 text-sm text-gray-600 transition-colors hover:bg-green-50 hover:text-green-600 ${
                            pathname.includes("/resumo-geral")
                              ? "bg-green-50 font-medium text-green-700"
                              : ""
                          }`}
                        >
                          Resumo geral
                        </Link>
                        <Link
                          to="/admin/kpis/$modulo"
                          params={{ modulo: "desempenho-tecnico" }}
                          onClick={onNavigate}
                          className={`block rounded-md p-2 text-sm text-gray-600 transition-colors hover:bg-green-50 hover:text-green-600 ${
                            pathname.includes("/desempenho-tecnico")
                              ? "bg-green-50 font-medium text-green-700"
                              : ""
                          }`}
                        >
                          Desempenho técnico
                        </Link>
                        <Link
                          to="/admin/kpis/$modulo"
                          params={{ modulo: "volume-notas" }}
                          onClick={onNavigate}
                          className={`block rounded-md p-2 text-sm text-gray-600 transition-colors hover:bg-green-50 hover:text-green-600 ${
                            pathname.includes("/volume-notas")
                              ? "bg-green-50 font-medium text-green-700"
                              : ""
                          }`}
                        >
                          Volume de Notas por período
                        </Link>
                        <Link
                          to="/admin/kpis/$modulo"
                          params={{ modulo: "detalhamento-notas" }}
                          onClick={onNavigate}
                          className={`block rounded-md p-2 text-sm text-gray-600 transition-colors hover:bg-green-50 hover:text-green-600 ${
                            pathname.includes("/detalhamento-notas")
                              ? "bg-green-50 font-medium text-green-700"
                              : ""
                          }`}
                        >
                          Detalhamento de notas
                        </Link>
                        <Link
                          to="/admin/kpis/$modulo"
                          params={{ modulo: "nota-por-tecnico" }}
                          onClick={onNavigate}
                          className={`block rounded-md p-2 text-sm text-gray-600 transition-colors hover:bg-green-50 hover:text-green-600 ${
                            pathname.includes("/nota-por-tecnico")
                              ? "bg-green-50 font-medium text-green-700"
                              : ""
                          }`}
                        >
                          Nota por técnico
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setIsMiscelaneaOpen((open) => !open)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
              >
                <span>Miscelâneas</span>
                {isMiscelaneaOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
                )}
              </button>
              <div
                className={`grid transition-all duration-200 ease-in-out ${
                  isMiscelaneaOpen
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="space-y-1 pl-8 pt-1">
                    <Link
                      to="/todos"
                      onClick={onNavigate}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
                      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    >
                      <Database className="h-5 w-5 text-primary" />
                      Todas as Metragens
                    </Link>
                    <Link
                      to="/admin/pendencias"
                      onClick={onNavigate}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
                      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    >
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                      Pendências
                    </Link>
                    <Link
                      to="/previsao-reserva"
                      onClick={onNavigate}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
                      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    >
                      <CalendarClock className="h-5 w-5 text-primary" />
                      Modelo e Previsão
                    </Link>
                    <Link
                      to="/media-baixa-tecnico"
                      onClick={onNavigate}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
                      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    >
                      <TrendingUp className="h-5 w-5 text-primary" />
                      Estoque Campo e Consumo
                    </Link>
                    <Link
                      to="/estoque-base"
                      onClick={onNavigate}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
                      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    >
                      <Warehouse className="h-5 w-5 text-primary" />
                      Estoque Base
                    </Link>
                    <Link
                      to="/admin/importacao"
                      search={{ tab: "miscelaneas" }}
                      onClick={onNavigate}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
                      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    >
                      <FileUp className="h-5 w-5 text-primary" />
                      Importação
                    </Link>
                    <Link
                      to="/admin/enviar-evidencia"
                      onClick={onNavigate}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
                      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    >
                      <Send className="h-5 w-5 text-primary" />
                      Envio pelo Técnico
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setIsSerializadosOpen((open) => !open)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
              >
                <span>Serializados</span>
                {isSerializadosOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
                )}
              </button>
              <div
                className={`grid transition-all duration-200 ease-in-out ${
                  isSerializadosOpen
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="space-y-1 pl-8 pt-1">
                    <div
                      className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground opacity-70"
                      title="Em desenvolvimento"
                    >
                      <ArrowLeftRight className="h-5 w-5 text-primary" />
                      Estoque Real: Atlas - (Base - Campo)
                    </div>
                    <Link
                      to="/estoque-atlas"
                      onClick={onNavigate}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
                      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    >
                      <Map className="h-5 w-5 text-primary" />
                      Estoque Atlas
                    </Link>
                    <Link
                      to="/estoque-tecnico"
                      onClick={onNavigate}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
                      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    >
                      <Building2 className="h-5 w-5 text-primary" />
                      Estoque serializado - Técnico
                    </Link>
                    <div
                      className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground opacity-70"
                      title="Em desenvolvimento"
                    >
                      <ChartColumn className="h-5 w-5 text-primary" />
                      Estoque Base
                    </div>
                    <div
                      className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground opacity-70"
                      title="Em desenvolvimento"
                    >
                      <UserSearch className="h-5 w-5 text-primary" />
                      Pendência de suspeito
                    </div>
                    <Link
                      to="/admin/importacao"
                      search={{ tab: "serializados" }}
                      onClick={onNavigate}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
                      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    >
                      <FileUp className="h-5 w-5 text-primary" />
                      Importação
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <Link
              to="/"
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
            >
              <Home className="h-5 w-5 text-primary" />
              Início
            </Link>
            <Link
              to="/historico"
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
            >
              <ClipboardList className="h-5 w-5 text-primary" />
              Meus Registros
            </Link>
          </>
        )}
      </div>

      <div className="mt-auto shrink-0 border-t border-sidebar-border p-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </nav>
  );
}
