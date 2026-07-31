import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
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

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const [isMiscelaneaOpen, setIsMiscelaneaOpen] = useState(true);
  const [isTerminaisOpen, setIsTerminaisOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    onNavigate?.();
    navigate({ to: "/login" });
  };

  return (
    <nav className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="shrink-0 border-b border-sidebar-border p-5">
        <Logo />
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
            <Link
              to="/admin"
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
            >
              <ShieldCheck className="h-5 w-5 text-primary" />
              Painel Admin
            </Link>

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
                      to="/tecnicos"
                      onClick={onNavigate}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
                      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    >
                      <Users className="h-5 w-5 text-primary" />
                      Gestão de Equipe
                    </Link>
                    <Link
                      to="/admin/kpis"
                      onClick={onNavigate}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
                      activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    >
                      <BarChart3 className="h-5 w-5 text-primary" />
                      KPI&apos;s
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
                onClick={() => setIsTerminaisOpen((open) => !open)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-sm font-medium hover:bg-sidebar-accent"
              >
                <span>Serializados</span>
                {isTerminaisOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
                )}
              </button>
              <div
                className={`grid transition-all duration-200 ease-in-out ${
                  isTerminaisOpen
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
