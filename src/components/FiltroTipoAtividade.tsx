import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useApp } from "@/lib/app-store";
import {
  filtrarPorTiposAtividade,
  padraoAtividadesStorageKey,
  readTiposAtividadeStorage,
  sortTiposAtividade,
  tiposAtividadeStorageKey,
  writeTiposAtividadeStorage,
} from "@/lib/filtro-tipo-atividade";

export type FiltroTipoAtividadeProps = {
  opcoesDisponiveis: string[];
  valoresSelecionados: string[];
  onChange: (novosValores: string[]) => void;
  /** id do trigger (acessibilidade). */
  id?: string;
  className?: string;
  labelClassName?: string;
};

export { filtrarPorTiposAtividade };

/**
 * Multi-seleção de Tipo de Atividade com busca, persistência e preset global.
 * Controlado: a página mãe guarda `valoresSelecionados` e aplica o filtro nos dados.
 */
export function FiltroTipoAtividade({
  opcoesDisponiveis,
  valoresSelecionados,
  onChange,
  id = "filtro-tipo-atividade",
  className,
  labelClassName,
}: FiltroTipoAtividadeProps) {
  const { user } = useApp();
  const userStorageId = user?.id || user?.email;
  const tiposStorageKey = useMemo(
    () => tiposAtividadeStorageKey(userStorageId),
    [userStorageId],
  );
  const padraoStorageKey = useMemo(
    () => padraoAtividadesStorageKey(userStorageId),
    [userStorageId],
  );

  const [tiposOpen, setTiposOpen] = useState(false);
  const [buscaTipo, setBuscaTipo] = useState("");
  const [padraoSalvo, setPadraoSalvo] = useState<string[]>([]);
  const [isModalPadraoOpen, setIsModalPadraoOpen] = useState(false);
  const [tiposPadraoDraft, setTiposPadraoDraft] = useState<string[]>([]);
  const [aplicarPadraoAoSalvar, setAplicarPadraoAoSalvar] = useState(true);

  const userClearedRef = useRef(false);
  const persistReadyRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const valoresRef = useRef(valoresSelecionados);
  onChangeRef.current = onChange;
  valoresRef.current = valoresSelecionados;

  useEffect(() => {
    persistReadyRef.current = false;
    userClearedRef.current = false;
    setBuscaTipo("");
  }, [tiposStorageKey]);

  useEffect(() => {
    const stored = readTiposAtividadeStorage(padraoStorageKey);
    setPadraoSalvo(stored ?? []);
  }, [padraoStorageKey]);

  useEffect(() => {
    if (opcoesDisponiveis.length === 0) return;

    const same = (a: string[], b: string[]) => {
      if (a.length !== b.length) return false;
      const setB = new Set(b);
      return a.every((t) => setB.has(t));
    };

    const apply = (next: string[]) => {
      if (same(next, valoresRef.current)) return;
      onChangeRef.current(next);
    };

    if (!persistReadyRef.current) {
      const stored = readTiposAtividadeStorage(tiposStorageKey);
      persistReadyRef.current = true;

      if (stored === null) {
        userClearedRef.current = false;
        apply([...opcoesDisponiveis]);
        return;
      }

      userClearedRef.current = stored.length === 0;
      const pruned = stored.filter((t) => opcoesDisponiveis.includes(t));
      if (stored.length > 0 && pruned.length === 0) {
        apply([...opcoesDisponiveis]);
        return;
      }
      apply(pruned);
      return;
    }

    const prev = valoresRef.current;
    if (prev.length === 0) {
      if (userClearedRef.current) return;
      apply([...opcoesDisponiveis]);
      return;
    }

    const pruned = prev.filter((t) => opcoesDisponiveis.includes(t));
    const prevSet = new Set(prev);
    const novos = opcoesDisponiveis.filter((t) => !prevSet.has(t));
    const tinhaTodasAnteriores =
      pruned.length === prev.length &&
      pruned.length + novos.length === opcoesDisponiveis.length;
    if (tinhaTodasAnteriores) {
      apply([...opcoesDisponiveis]);
      return;
    }
    apply(pruned);
  }, [opcoesDisponiveis, tiposStorageKey]);

  useEffect(() => {
    if (!persistReadyRef.current) return;
    writeTiposAtividadeStorage(tiposStorageKey, valoresSelecionados);
  }, [valoresSelecionados, tiposStorageKey]);

  const opcoesVisiveis = useMemo(() => {
    const q = buscaTipo.trim().toLowerCase();
    if (!q) return opcoesDisponiveis;
    return opcoesDisponiveis.filter((tipo) =>
      tipo.toLowerCase().includes(q),
    );
  }, [opcoesDisponiveis, buscaTipo]);

  const labelTrigger = useMemo(() => {
    if (opcoesDisponiveis.length === 0) return "Sem tipos";
    if (valoresSelecionados.length === 0) return "Nenhum";
    if (
      valoresSelecionados.length === opcoesDisponiveis.length &&
      opcoesDisponiveis.every((t) => valoresSelecionados.includes(t))
    ) {
      return "Todos";
    }
    if (valoresSelecionados.length === 1) return valoresSelecionados[0]!;
    if (valoresSelecionados.length <= 2) {
      return valoresSelecionados.join(", ");
    }
    return `${valoresSelecionados.length} tipos`;
  }, [valoresSelecionados, opcoesDisponiveis]);

  const emitir = (next: string[]) => {
    const sorted = sortTiposAtividade(next);
    userClearedRef.current = sorted.length === 0;
    onChange(sorted);
  };

  const toggleTipo = (tipo: string) => {
    if (valoresSelecionados.includes(tipo)) {
      emitir(valoresSelecionados.filter((t) => t !== tipo));
    } else {
      emitir([...valoresSelecionados, tipo]);
    }
  };

  const selecionarTodos = () => emitir([...opcoesDisponiveis]);
  const limparTodos = () => emitir([]);

  const usarPadrao = () => {
    if (padraoSalvo.length === 0) return;
    emitir(padraoSalvo);
  };

  const abrirModalPadrao = () => {
    const seed =
      padraoSalvo.length > 0
        ? padraoSalvo.filter((t) => opcoesDisponiveis.includes(t))
        : valoresSelecionados.filter((t) => opcoesDisponiveis.includes(t));
    setTiposPadraoDraft(seed);
    setAplicarPadraoAoSalvar(true);
    setTiposOpen(false);
    setIsModalPadraoOpen(true);
  };

  const togglePadraoDraft = (tipo: string) => {
    setTiposPadraoDraft((prev) =>
      prev.includes(tipo)
        ? prev.filter((t) => t !== tipo)
        : sortTiposAtividade([...prev, tipo]),
    );
  };

  const salvarPadrao = () => {
    const next = sortTiposAtividade(tiposPadraoDraft);
    writeTiposAtividadeStorage(padraoStorageKey, next);
    setPadraoSalvo(next);
    if (aplicarPadraoAoSalvar) emitir(next);
    setIsModalPadraoOpen(false);
  };

  return (
    <>
      <div className={className ?? "flex items-center gap-2"}>
        <Label
          htmlFor={id}
          className={
            labelClassName ?? "shrink-0 text-sm font-medium text-foreground"
          }
        >
          Tipo de Atividade:
        </Label>
        <Popover
          open={tiposOpen}
          onOpenChange={(open) => {
            setTiposOpen(open);
            if (!open) setBuscaTipo("");
          }}
        >
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={tiposOpen}
              disabled={opcoesDisponiveis.length === 0}
              className="w-[240px] justify-between font-normal"
            >
              <span className="truncate">{labelTrigger}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
            <div className="sticky top-0 z-10 space-y-2 border-b border-border bg-white px-2 pb-2 pt-2 dark:bg-background">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  value={buscaTipo}
                  onChange={(e) => setBuscaTipo(e.target.value)}
                  placeholder="Buscar tipo..."
                  className="h-8 border-border/80 bg-white pl-8 text-sm shadow-none dark:bg-background"
                  aria-label="Buscar tipo de atividade"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  Multi-seleção
                </span>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                    onClick={limparTodos}
                  >
                    Limpar
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-40"
                    onClick={usarPadrao}
                    disabled={padraoSalvo.length === 0}
                    title={
                      padraoSalvo.length === 0
                        ? "Defina um padrão primeiro"
                        : "Aplicar tipos padrão"
                    }
                  >
                    Usar padrão
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={selecionarTodos}
                  >
                    Todos
                  </button>
                </div>
              </div>
            </div>
            <ul className="max-h-56 space-y-1 overflow-y-auto px-2 py-2">
              {opcoesVisiveis.length === 0 ? (
                <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                  Nenhum tipo encontrado
                </li>
              ) : (
                opcoesVisiveis.map((tipo) => {
                  const checked = valoresSelecionados.includes(tipo);
                  return (
                    <li key={tipo}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleTipo(tipo)}
                          aria-label={tipo}
                        />
                        <span className="flex-1 truncate" title={tipo}>
                          {tipo}
                        </span>
                        {checked ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                        ) : null}
                      </label>
                    </li>
                  );
                })
              )}
            </ul>
            <div className="sticky bottom-0 border-t border-border bg-white px-2 py-2 dark:bg-background">
              <button
                type="button"
                className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-primary hover:underline"
                onClick={abrirModalPadrao}
              >
                <Settings className="h-3.5 w-3.5" />
                Definir padrão
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Dialog open={isModalPadraoOpen} onOpenChange={setIsModalPadraoOpen}>
        <DialogContent className="max-h-[85vh] max-w-md gap-0 overflow-hidden p-0 sm:rounded-lg">
          <div className="border-b border-border px-6 py-4">
            <DialogHeader>
              <DialogTitle>Definir Tipos Padrão</DialogTitle>
              <DialogDescription>
                Escolha os serviços essenciais que poderão ser aplicados
                rapidamente pelo botão &quot;Usar padrão&quot;.
              </DialogDescription>
            </DialogHeader>
          </div>
          <ul className="max-h-[min(50vh,360px)] space-y-1 overflow-y-auto px-4 py-3">
            {opcoesDisponiveis.length === 0 ? (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                Nenhum tipo disponível na base carregada.
              </li>
            ) : (
              opcoesDisponiveis.map((tipo) => {
                const checked = tiposPadraoDraft.includes(tipo);
                return (
                  <li key={tipo}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePadraoDraft(tipo)}
                        aria-label={tipo}
                      />
                      <span className="flex-1 truncate" title={tipo}>
                        {tipo}
                      </span>
                      {checked ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : null}
                    </label>
                  </li>
                );
              })
            )}
          </ul>
          <div className="space-y-3 border-t border-border px-6 py-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={aplicarPadraoAoSalvar}
                onCheckedChange={(v) => setAplicarPadraoAoSalvar(v === true)}
              />
              Aplicar imediatamente ao filtro atual
            </label>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  className="text-sm text-gray-500 transition-colors hover:text-gray-800"
                  onClick={() => setTiposPadraoDraft([])}
                >
                  Limpar
                </button>
                <button
                  type="button"
                  className="text-sm font-medium text-green-600 transition-colors hover:text-green-800"
                  onClick={() => setTiposPadraoDraft([...opcoesDisponiveis])}
                >
                  Todos
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalPadraoOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="button" onClick={salvarPadrao}>
                  Salvar Padrão
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
