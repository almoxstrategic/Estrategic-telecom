import { useCallback, useEffect, useState } from "react";
import { Eye, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { TecnicoTransmissaoMultiSelect } from "@/components/TecnicoTransmissaoMultiSelect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
  createEquipeTransmissao,
  deleteEquipeTransmissao,
  fetchEquipesTransmissao,
  updateEquipeTransmissao,
  type EquipeTransmissao,
} from "@/lib/equipes-transmissao-service";
import type { TecnicoProfile } from "@/lib/team-service";

type FormMode = "create" | "edit" | "view";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-medium text-destructive" role="alert">
      {message}
    </p>
  );
}

function EquipeFormDialog({
  open,
  onOpenChange,
  mode,
  equipe,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: FormMode;
  equipe: EquipeTransmissao | null;
  onSaved: () => void;
}) {
  const readOnly = mode === "view";
  const [nome, setNome] = useState("");
  const [tecnicos, setTecnicos] = useState<TecnicoProfile[]>([]);
  const [saving, setSaving] = useState(false);
  const [nomeError, setNomeError] = useState<string | undefined>();
  const [tecnicosError, setTecnicosError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    setNome(equipe?.nome ?? "");
    setTecnicos(equipe?.tecnicos ?? []);
    setSaving(false);
    setNomeError(undefined);
    setTecnicosError(undefined);
  }, [open, equipe]);

  const title =
    mode === "create" ? "Nova equipe" : mode === "edit" ? "Editar equipe" : "Visualizar equipe";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;

    const nextNomeError = !nome.trim() ? "Informe o nome da equipe." : undefined;
    const nextTecnicosError =
      tecnicos.length === 0 ? "Selecione ao menos um técnico de transmissão." : undefined;
    setNomeError(nextNomeError);
    setTecnicosError(nextTecnicosError);
    if (nextNomeError || nextTecnicosError) return;

    setSaving(true);
    try {
      if (mode === "create") {
        await createEquipeTransmissao({ nome, tecnicos });
        toast.success("Equipe criada com sucesso.");
      } else if (equipe) {
        await updateEquipeTransmissao(equipe.id, { nome, tecnicos });
        toast.success("Equipe atualizada.");
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível salvar a equipe.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? "Detalhes da equipe e técnicos associados."
              : "Defina o nome da equipe e selecione os técnicos de transmissão."}
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="equipe-nome">Nome da equipe</Label>
            <Input
              id="equipe-nome"
              value={nome}
              onChange={(e) => {
                setNome(e.target.value);
                if (nomeError) setNomeError(undefined);
              }}
              placeholder='Ex: "Equipe Alfa", "Equipe T1"'
              readOnly={readOnly}
              disabled={readOnly}
              aria-invalid={Boolean(nomeError)}
            />
            <FieldError message={nomeError} />
          </div>
          <div className="space-y-1.5">
            <Label>Técnicos de transmissão</Label>
            {readOnly ? (
              <div className="flex flex-wrap gap-1.5 rounded-lg border bg-muted/30 p-3">
                {tecnicos.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Nenhum técnico associado.</span>
                ) : (
                  tecnicos.map((tecnico) => (
                    <Badge key={tecnico.id} variant="secondary">
                      {tecnico.nome}
                    </Badge>
                  ))
                )}
              </div>
            ) : (
              <>
                <TecnicoTransmissaoMultiSelect
                  value={tecnicos}
                  invalid={Boolean(tecnicosError)}
                  placeholder="Selecionar técnicos…"
                  onChange={(next) => {
                    setTecnicos(next);
                    if (tecnicosError && next.length > 0) setTecnicosError(undefined);
                  }}
                />
                <FieldError message={tecnicosError} />
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? "Fechar" : "Cancelar"}
            </Button>
            {!readOnly ? (
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando…" : mode === "create" ? "Criar equipe" : "Salvar alterações"}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GestaoEquipesTransmissaoDialog({
  open,
  onOpenChange,
  onEquipesChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEquipesChanged?: () => void;
}) {
  const [equipes, setEquipes] = useState<EquipeTransmissao[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [selectedEquipe, setSelectedEquipe] = useState<EquipeTransmissao | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EquipeTransmissao | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEquipes(await fetchEquipesTransmissao());
    } catch (err) {
      toast.error((err as Error).message || "Erro ao carregar equipes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const openForm = (mode: FormMode, equipe: EquipeTransmissao | null) => {
    setFormMode(mode);
    setSelectedEquipe(equipe);
    setFormOpen(true);
  };

  const onSaved = () => {
    void load();
    onEquipesChanged?.();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEquipeTransmissao(deleteTarget.id);
      toast.success("Equipe excluída.");
      setDeleteTarget(null);
      onSaved();
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível excluir a equipe.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Gestão de equipes
            </DialogTitle>
            <DialogDescription>
              Cadastre equipes de transmissão para agilizar o despacho de OS e contratos.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => openForm("create", null)}>
              <Plus className="h-4 w-4" />
              Nova equipe
            </Button>
          </div>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando equipes…</p>
          ) : equipes.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhuma equipe cadastrada. Clique em &quot;Nova equipe&quot; para começar.
            </div>
          ) : (
            <ul className="space-y-2">
              {equipes.map((equipe) => (
                <li
                  key={equipe.id}
                  className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{equipe.nome}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {equipe.tecnicos.length === 0
                        ? "Sem técnicos"
                        : equipe.tecnicos.map((t) => t.nome).join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openForm("view", equipe)}
                    >
                      <Eye className="h-4 w-4" />
                      Ver
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openForm("edit", equipe)}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(equipe)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EquipeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        equipe={selectedEquipe}
        onSaved={onSaved}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir equipe?</AlertDialogTitle>
            <AlertDialogDescription>
              A equipe &quot;{deleteTarget?.nome}&quot; será removida permanentemente. OS já
              despachadas mantêm os dados históricos de equipe e técnicos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
