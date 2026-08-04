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
import {
  getDadosEstoqueBtp,
  type EstoqueBtpItem,
} from "@/lib/estoque-btp-store";
import type { DimMaterial } from "@/lib/logistica-types";
import { formatMaterialLabel, normalizeMaterialCode } from "@/lib/material-code";
import { cn } from "@/lib/utils";

type MaterialComboboxProps = {
  onSelect: (material: DimMaterial) => void;
  exclude?: string[];
  disabled?: boolean;
  className?: string;
};

function dedupeEstoqueBtpPorCodigo(items: EstoqueBtpItem[]): EstoqueBtpItem[] {
  const map = new Map<string, EstoqueBtpItem>();
  for (const item of items) {
    const codigo = normalizeMaterialCode(item.codigo?.toString() ?? "");
    if (!codigo || map.has(codigo)) continue;
    map.set(codigo, {
      codigo,
      descricao: (item.descricao ?? codigo).toString().trim() || codigo,
    });
  }
  return [...map.values()];
}

export function MaterialCombobox({
  onSelect,
  exclude = [],
  disabled = false,
  className,
}: MaterialComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dadosEstoqueBtp, setDadosEstoqueBtp] = useState<EstoqueBtpItem[]>([]);

  useEffect(() => {
    if (!open) return;
    setDadosEstoqueBtp(dedupeEstoqueBtpPorCodigo(getDadosEstoqueBtp()));
  }, [open]);

  const excluded = useMemo(
    () => new Set(exclude.map((c) => normalizeMaterialCode(c?.toString() ?? ""))),
    [exclude],
  );

  const listaUnica = useMemo(
    () => dadosEstoqueBtp.filter((item) => !excluded.has(item.codigo)),
    [dadosEstoqueBtp, excluded],
  );

  const filtrados = useMemo(() => {
    const searchTerm = query.trim();
    if (!searchTerm) return listaUnica;

    const searchLower = searchTerm.toLowerCase();
    const searchCode = normalizeMaterialCode(searchTerm).toLowerCase();

    return listaUnica.filter((item) => {
      const codigo = item.codigo?.toString().toLowerCase() ?? "";
      const descricao = item.descricao?.toString().toLowerCase() ?? "";
      return (
        codigo.includes(searchTerm) ||
        codigo.includes(searchLower) ||
        (searchCode.length > 0 && codigo.includes(searchCode)) ||
        descricao.includes(searchLower)
      );
    });
  }, [listaUnica, query]);

  const estoqueBtpVazio = !dadosEstoqueBtp || dadosEstoqueBtp.length === 0;

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
              {estoqueBtpVazio
                ? "Nenhum material encontrado. Importe o Estoque BTP primeiro."
                : "Nenhum material corresponde à busca."}
            </CommandEmpty>
            <CommandGroup>
              {filtrados.map((item) => (
                <CommandItem
                  key={item.codigo}
                  value={`${item.codigo} ${item.descricao}`}
                  onSelect={() => {
                    onSelect({
                      material: item.codigo,
                      descr_material: item.descricao,
                    });
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="truncate text-sm">
                    {formatMaterialLabel(item.codigo, item.descricao)}
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
