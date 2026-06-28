import { Link, useNavigate } from "@tanstack/react-router";
import { ClipboardList, LogOut, Home, ShieldCheck, Database, Users } from "lucide-react";
import { Logo } from "./Logo";
import { useApp } from "@/lib/app-store";

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  const handleLogout = async () => {
    await logout();
    onNavigate?.();
    navigate({ to: "/login" });
  };

  return (
    <nav className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border p-5">
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

      <div className="flex-1 space-y-1 p-3">
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

      <div className="border-t border-sidebar-border p-3">
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
