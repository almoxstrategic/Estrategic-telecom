import { useMemo, useState } from "react";
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
import { cn } from "@/lib/utils";

/** Opções oficiais — ordem alfabética. */
export const TIPOS_EQUIPAMENTO = [
  "DGO/PDO",
  "Fonte Alimentação",
  "Gabinete",
  "Modem",
  "Placa",
  "Retificador",
  "Roseta",
  "SFP Eletrico",
] as const;

export type TipoEquipamentoOpcao = (typeof TIPOS_EQUIPAMENTO)[number];

export function TipoEquipamentoCombobox({
  value,
  onChange,
  disabled = false,
  placeholder = "Buscar tipo…",
  id,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...TIPOS_EQUIPAMENTO];
    return TIPOS_EQUIPAMENTO.filter((opt) => opt.toLowerCase().includes(q));
  }, [query]);

  const selected = value.trim();
  const known = TIPOS_EQUIPAMENTO.includes(selected as TipoEquipamentoOpcao);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-11 w-full justify-between rounded-xl border-input bg-background px-3 font-normal",
            className,
          )}
        >
          <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>
            {selected || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Filtrar tipo…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Nenhum tipo encontrado.</CommandEmpty>
            <CommandGroup>
              {selected && !known ? (
                <CommandItem
                  value={selected}
                  onSelect={() => {
                    onChange(selected);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {selected} (atual)
                </CommandItem>
              ) : null}
              {filtered.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => {
                    onChange(opt);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
