import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ADICIONAR_CLIENTE_VALUE,
  CLIENTES_OPERADORA_MVP,
  type ClienteOperadora,
} from "@/lib/relatorios-transmissao";

export function ClienteOperadoraSelect({
  id = "cliente-operadora",
  value,
  onChange,
  required = false,
}: {
  id?: string;
  value: ClienteOperadora;
  onChange: (value: ClienteOperadora) => void;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        Cliente / Operadora
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </Label>
      <Select
        value={value || "Claro"}
        onValueChange={(next) => {
          if (next === ADICIONAR_CLIENTE_VALUE) {
            toast.message("Em breve", {
              description:
                "Cadastro de novos clientes com upload de modelo PDF próprio estará disponível em breve.",
            });
            return;
          }
          onChange(next);
        }}
      >
        <SelectTrigger id={id} aria-required={required || undefined}>
          <SelectValue placeholder="Selecione a operadora" />
        </SelectTrigger>
        <SelectContent>
          {CLIENTES_OPERADORA_MVP.map((opcao) => (
            <SelectItem key={opcao} value={opcao}>
              {opcao}
            </SelectItem>
          ))}
          <SelectItem value={ADICIONAR_CLIENTE_VALUE} className="text-primary font-medium">
            + Adicionar Cliente
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
