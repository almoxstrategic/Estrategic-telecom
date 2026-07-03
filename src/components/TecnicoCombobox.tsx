import { useEffect, useMemo, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchTecnicos, type TecnicoProfile } from "@/lib/team-service";
import { cn } from "@/lib/utils";

function formatTecnicoOption(tecnico: TecnicoProfile): string {
  const matricula = tecnico.identificacao?.trim() || tecnico.login?.trim() || "—";
  return `${tecnico.nome} (${matricula})`;
}

type TecnicoComboboxProps = {
  value: string | null;
  onSelect: (tecnico: TecnicoProfile) => void;
  disabled?: boolean;
  className?: string;
};

export function TecnicoCombobox({
  value,
  onSelect,
  disabled = false,
  className,
}: TecnicoComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [tecnicos, setTecnicos] = useState<TecnicoProfile[]>([]);

  useEffect(() => {
    if (!open || tecnicos.length > 0) return;

    void (async () => {
      setLoading(true);
      try {
        setTecnicos(await fetchTecnicos());
      } catch {
        setTecnicos([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, tecnicos.length]);

  const selected = tecnicos.find((t) => t.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tecnicos;
    return tecnicos.filter((t) => {
      const matricula = (t.identificacao ?? t.login ?? "").toLowerCase();
      return t.nome.toLowerCase().includes(q) || matricula.includes(q);
    });
  }, [tecnicos, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? formatTecnicoOption(selected) : "Buscar técnico por nome ou matrícula…"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,32rem)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Digite nome ou matrícula…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Carregando técnicos…" : "Nenhum técnico encontrado."}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((tecnico) => (
                <CommandItem
                  key={tecnico.id}
                  value={`${tecnico.nome} ${tecnico.identificacao ?? ""} ${tecnico.login ?? ""}`}
                  onSelect={() => {
                    onSelect(tecnico);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="truncate text-sm">{formatTecnicoOption(tecnico)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
