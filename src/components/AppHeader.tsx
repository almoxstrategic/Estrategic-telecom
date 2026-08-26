import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Logo } from "./Logo";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { AppSidebar } from "./AppSidebar";
import { resetAdminTabToInicio } from "@/lib/admin-tab";
import { cn } from "@/lib/utils";

export function AppHeader({
  /** Quando false, o header rola com a página (ex.: técnico no formulário de relatório). */
  sticky = true,
  /** Visão auditoria: altura reduzida para liberar área útil. */
  compact = false,
  /** Remove a borda inferior (ex.: chrome unificado com abas). */
  flushBottom = false,
}: {
  sticky?: boolean;
  compact?: boolean;
  flushBottom?: boolean;
} = {}) {
  const [open, setOpen] = useState(false);
  return (
    <header
      className={cn(
        "z-50 grid grid-cols-[auto_1fr_auto] items-center gap-2 bg-white px-3 lg:px-4",
        flushBottom ? "border-b-0" : "border-b border-gray-200",
        compact ? "py-1" : "py-3",
        sticky ? "sticky top-0" : "relative",
      )}
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label="Abrir menu"
          className={cn(
            "grid place-items-center rounded-lg text-foreground hover:bg-muted active:scale-95 transition",
            compact ? "h-8 w-8" : "h-10 w-10",
          )}
        >
          <Menu className={compact ? "h-5 w-5" : "h-6 w-6"} />
        </SheetTrigger>
        <SheetContent side="left" className="w-[82%] max-w-xs p-0">
          <AppSidebar onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex justify-center">
        <Link
          to="/admin"
          search={{ tab: "inicio" }}
          aria-label="Ir para o Início do painel"
          className="cursor-pointer transition-opacity hover:opacity-80"
          onClick={() => resetAdminTabToInicio()}
        >
          <Logo />
        </Link>
      </div>
      <div className={cn(compact ? "w-8" : "w-10")} />
    </header>
  );
}
