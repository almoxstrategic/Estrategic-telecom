import { useEffect, useState } from "react";
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
import { searchDimMateriais } from "@/lib/logistica-service";
import type { DimMaterial } from "@/lib/logistica-types";
import { formatMaterialLabel, normalizeMaterialCode } from "@/lib/material-code";
import { cn } from "@/lib/utils";

type MaterialComboboxProps = {
  onSelect: (material: DimMaterial) => void;
  exclude?: string[];
  disabled?: boolean;
  className?: string;
};

export function MaterialCombobox({
  onSelect,
  exclude = [],
  disabled = false,
  className,
}: MaterialComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DimMaterial[]>([]);

  useEffect(() => {
    if (!open) return;

    const excluded = new Set(exclude.map(normalizeMaterialCode));

    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const items = await searchDimMateriais(query);
          setResults(items.filter((item) => !excluded.has(item.material)));
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [open, query, exclude]);

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
          <span className="truncate text-muted-foreground">
            Buscar material por código ou nome…
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,32rem)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Digite código ou descrição…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {loading
                ? "Buscando…"
                : "Nenhum material encontrado. Importe o estoque (Upload C) primeiro."}
            </CommandEmpty>
            <CommandGroup>
              {results.map((item) => (
                <CommandItem
                  key={item.material}
                  value={`${item.material} ${item.descr_material}`}
                  onSelect={() => {
                    onSelect(item);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="truncate text-sm">
                    {formatMaterialLabel(item.material, item.descr_material)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
