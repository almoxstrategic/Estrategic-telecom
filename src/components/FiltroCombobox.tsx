import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

const OPCAO_TODOS = "Todos";

export type FiltroComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  /** Valor sentinela para “sem filtro”. Default: "Todos". */
  todosValue?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
};

/**
 * Dropdown com busca interna, altura limitada e scroll.
 * Sempre inclui a opção "Todos" no topo da lista.
 */
export function FiltroCombobox({
  value,
  onChange,
  options,
  placeholder = OPCAO_TODOS,
  todosValue = OPCAO_TODOS,
  className = "",
  disabled = false,
  id,
}: FiltroComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  const optionsFiltradas = useMemo(() => {
    const termo = search.trim().toLowerCase();
    if (!termo) return options;
    return options.filter((opt) => opt.toLowerCase().includes(termo));
  }, [options, search]);

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen]);

  const selecionar = (opt: string) => {
    onChange(opt);
    setSearch("");
    setIsOpen(false);
  };

  const labelExibido = value || placeholder;

  return (
    <div ref={rootRef} className={`relative min-w-0 flex-1 ${className}`}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (disabled) return;
          setIsOpen((open) => !open);
        }}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-background px-2 py-2 text-sm text-foreground outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-green-500/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate text-left">{labelExibido}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[12rem] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="sticky top-0 z-10 border-b border-gray-100 bg-white p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                aria-label="Buscar opção"
                autoFocus
                className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30"
              />
            </div>
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={value === todosValue}
                onClick={() => selecionar(todosValue)}
                className={`flex w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
                  value === todosValue
                    ? "bg-gray-100 font-semibold text-foreground"
                    : "text-foreground"
                }`}
              >
                {todosValue}
              </button>
            </li>
            {optionsFiltradas.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                Nenhuma opção encontrada.
              </li>
            ) : (
              optionsFiltradas.map((opt) => (
                <li key={opt}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === opt}
                    title={opt}
                    onClick={() => selecionar(opt)}
                    className={`flex w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
                      value === opt
                        ? "bg-gray-100 font-semibold text-foreground"
                        : "text-foreground"
                    }`}
                  >
                    <span className="truncate">{opt}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
