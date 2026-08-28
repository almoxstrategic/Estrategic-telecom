import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchEquipesTransmissao,
  type EquipeTransmissao,
} from "@/lib/equipes-transmissao-service";
import { cn } from "@/lib/utils";

const NONE_VALUE = "__none__";

type EquipeTransmissaoSelectProps = {
  value: string;
  onChange: (equipe: EquipeTransmissao | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
  equipes?: EquipeTransmissao[];
  onEquipesLoaded?: (equipes: EquipeTransmissao[]) => void;
};

export function EquipeTransmissaoSelect({
  value,
  onChange,
  disabled = false,
  invalid = false,
  placeholder = "Selecionar equipe…",
  equipes: equipesProp,
  onEquipesLoaded,
}: EquipeTransmissaoSelectProps) {
  const [loading, setLoading] = useState(false);
  const [equipes, setEquipes] = useState<EquipeTransmissao[]>(equipesProp ?? []);

  useEffect(() => {
    if (equipesProp) {
      setEquipes(equipesProp);
      return;
    }
    void (async () => {
      setLoading(true);
      try {
        const lista = await fetchEquipesTransmissao();
        setEquipes(lista);
        onEquipesLoaded?.(lista);
      } catch {
        setEquipes([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [equipesProp, onEquipesLoaded]);

  const selectValue = value || NONE_VALUE;

  return (
    <Select
      value={selectValue}
      disabled={disabled || loading}
      onValueChange={(next) => {
        if (next === NONE_VALUE) {
          onChange(null);
          return;
        }
        const equipe = equipes.find((item) => item.id === next) ?? null;
        onChange(equipe);
      }}
    >
      <SelectTrigger
        aria-invalid={invalid}
        className={cn(invalid && "border-destructive focus:ring-destructive")}
      >
        <SelectValue placeholder={loading ? "Carregando equipes…" : placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE_VALUE}>Nenhuma equipe selecionada</SelectItem>
        {equipes.map((equipe) => (
          <SelectItem key={equipe.id} value={equipe.id}>
            {equipe.nome}
            {equipe.tecnicos.length > 0
              ? ` (${equipe.tecnicos.length} técnico${equipe.tecnicos.length === 1 ? "" : "s"})`
              : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
