import { useEffect, useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { fetchTecnicosTransmissao, type TecnicoProfile } from "@/lib/team-service";
import { cn } from "@/lib/utils";

function formatTecnicoOption(tecnico: TecnicoProfile): string {
  const matricula = tecnico.identificacao?.trim() || tecnico.login?.trim() || "—";
  return `${tecnico.nome} (${matricula})`;
}

type TecnicoTransmissaoMultiSelectProps = {
  value: TecnicoProfile[];
  onChange: (tecnicos: TecnicoProfile[]) => void;
  disabled?: boolean;
  placeholder?: string;
  invalid?: boolean;
};

export function TecnicoTransmissaoMultiSelect({
  value,
  onChange,
  disabled = false,
  placeholder = "Selecionar equipe…",
  invalid = false,
}: TecnicoTransmissaoMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [tecnicos, setTecnicos] = useState<TecnicoProfile[]>([]);

  useEffect(() => {
    if (!open || tecnicos.length > 0) return;
    void (async () => {
      setLoading(true);
      try {
        setTecnicos(await fetchTecnicosTransmissao());
      } catch {
        setTecnicos([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, tecnicos.length]);

  const selectedIds = useMemo(() => new Set(value.map((t) => t.id)), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tecnicos;
    return tecnicos.filter((t) => {
      const matricula = (t.identificacao ?? t.login ?? "").toLowerCase();
      return t.nome.toLowerCase().includes(q) || matricula.includes(q);
    });
  }, [tecnicos, query]);

  const toggle = (tecnico: TecnicoProfile) => {
    if (selectedIds.has(tecnico.id)) {
      onChange(value.filter((item) => item.id !== tecnico.id));
      return;
    }
    onChange([...value, tecnico]);
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            aria-invalid={invalid}
            className={cn(
              "w-full justify-between font-normal",
              invalid && "border-destructive focus-visible:ring-destructive",
            )}
          >
            <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>
              {value.length === 0
                ? placeholder
                : `${value.length} técnico${value.length === 1 ? "" : "s"} selecionado${value.length === 1 ? "" : "s"}`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(100vw-2rem,32rem)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar por nome ou matrícula…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>
                {loading ? "Carregando técnicos…" : "Nenhum técnico de transmissão encontrado."}
              </CommandEmpty>
              <CommandGroup>
                {filtered.map((tecnico) => {
                  const selected = selectedIds.has(tecnico.id);
                  return (
                    <CommandItem
                      key={tecnico.id}
                      value={`${tecnico.nome} ${tecnico.identificacao ?? ""} ${tecnico.login ?? ""}`}
                      onSelect={() => toggle(tecnico)}
                    >
                      <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                      <span className="truncate text-sm">{formatTecnicoOption(tecnico)}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tecnico) => (
            <Badge key={tecnico.id} variant="secondary" className="gap-1 pr-1 font-normal">
              {tecnico.nome}
              <button
                type="button"
                className="rounded-sm p-0.5 hover:bg-muted"
                onClick={() => onChange(value.filter((item) => item.id !== tecnico.id))}
                aria-label={`Remover ${tecnico.nome}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
