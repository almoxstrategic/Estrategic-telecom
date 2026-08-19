import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TecnicoTransmissaoMultiSelect } from "@/components/TecnicoTransmissaoMultiSelect";
import { TipoExecucaoPicker } from "@/components/RelatorioRedeAcesso";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  patchRelatorioCadastroAdmin,
  type RelatorioTransmissao,
  type TipoExecucao,
} from "@/lib/relatorios-transmissao";
import { fetchTecnicosTransmissao, type TecnicoProfile } from "@/lib/team-service";

function OptionalHint() {
  return <span className="font-normal text-muted-foreground">(opcional)</span>;
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      *
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-medium text-destructive" role="alert">
      {message}
    </p>
  );
}

function dateInputValue(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function equipeSeed(row: RelatorioTransmissao): TecnicoProfile[] {
  return (row.tecnicos_atribuidos ?? []).map((id, index) => ({
    id,
    nome: row.tecnicos_nomes[index]?.trim() || "Técnico",
    identificacao: null,
    login: null,
    celular: null,
    created_at: null,
    status: "ATIVO",
    role: "transmissao",
  }));
}

export function EditarContratoOsDialog({
  open,
  onOpenChange,
  row,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: RelatorioTransmissao;
  onSaved: (saved: RelatorioTransmissao) => void;
}) {
  const [cliente, setCliente] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [empreiteira, setEmpreiteira] = useState("");
  const [tecnicos, setTecnicos] = useState<TecnicoProfile[]>([]);
  const [dataInicio, setDataInicio] = useState("");
  const [tipoExecucao, setTipoExecucao] = useState<TipoExecucao | "">("");
  const [saving, setSaving] = useState(false);
  const [equipeError, setEquipeError] = useState<string | undefined>();
  const [tipoError, setTipoError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    setCliente(row.cliente ?? "");
    setEndereco(row.endereco ?? "");
    setCidade(row.cidade ?? "");
    setEmpreiteira(row.equipe_empreiteira ?? "");
    setDataInicio(dateInputValue(row.data_inicio_execucao));
    setTipoExecucao(row.tipo_execucao ?? "");
    setSaving(false);
    setEquipeError(undefined);
    setTipoError(undefined);

    const seeded = equipeSeed(row);
    setTecnicos(seeded);
    void (async () => {
      try {
        const lista = await fetchTecnicosTransmissao();
        setTecnicos(
          (row.tecnicos_atribuidos ?? []).map((id, index) => {
            const found = lista.find((tecnico) => tecnico.id === id);
            return found ?? seeded[index];
          }),
        );
      } catch {
        setTecnicos(seeded);
      }
    })();
  }, [open, row]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tecnicos.length === 0) {
      setEquipeError("Selecione ao menos um técnico na equipe.");
      return;
    }
    if (tipoExecucao !== "implantacao" && tipoExecucao !== "empresarial") {
      setTipoError("Selecione o tipo de execução.");
      return;
    }
    setSaving(true);
    try {
      const saved = await patchRelatorioCadastroAdmin(row.id, {
        cliente,
        endereco,
        cidade,
        equipeEmpreiteira: empreiteira,
        dataInicioExecucao: dataInicio,
        tipoExecucao,
        tecnicos: tecnicos.map((t) => ({ id: t.id, nome: t.nome })),
      });
      toast.success("Dados do contrato atualizados.");
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar dados do contrato</DialogTitle>
          <DialogDescription>
            Complete ou altere os dados cadastrais e a equipe alocada nesta OS.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-os-wf">OS/WF</Label>
            <Input
              id="edit-os-wf"
              value={row.os_wf}
              readOnly
              disabled
              aria-readonly="true"
              className="bg-muted"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-os-cliente">
              Cliente <OptionalHint />
            </Label>
            <Input
              id="edit-os-cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Nome do cliente"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-os-endereco">
              Endereço <OptionalHint />
            </Label>
            <Input
              id="edit-os-endereco"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Endereço da obra"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-os-cidade">
              Cidade <OptionalHint />
            </Label>
            <Input
              id="edit-os-cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="Cidade"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-os-empreiteira">
              Empreiteira <OptionalHint />
            </Label>
            <Input
              id="edit-os-empreiteira"
              value={empreiteira}
              onChange={(e) => setEmpreiteira(e.target.value)}
              placeholder="Empreiteira responsável"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Equipe <RequiredMark />
            </Label>
            <TecnicoTransmissaoMultiSelect
              value={tecnicos}
              invalid={Boolean(equipeError)}
              onChange={(next) => {
                setTecnicos(next);
                if (next.length > 0) setEquipeError(undefined);
              }}
            />
            <FieldError message={equipeError} />
          </div>
          <div className="space-y-1.5">
            <Label>
              Tipo de execução <RequiredMark />
            </Label>
            <TipoExecucaoPicker
              value={tipoExecucao}
              invalid={Boolean(tipoError)}
              onChange={(next) => {
                setTipoExecucao(next);
                setTipoError(undefined);
              }}
            />
            <FieldError message={tipoError} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-os-data-inicio">
              Data de início da execução <OptionalHint />
            </Label>
            <Input
              id="edit-os-data-inicio"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
