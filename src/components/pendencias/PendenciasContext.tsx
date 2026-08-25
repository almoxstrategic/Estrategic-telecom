import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { navegarParaSecaoFormulario } from "@/components/RelatorioRedeAcesso";
import type { AbaCampo } from "@/components/RelatorioRedeAcesso";
import type { PendenciaItem, PendenciaItemDef } from "@/lib/pendencias-itens";

type AbaController = {
  setAba: (aba: AbaCampo) => void;
};

type PendenciasContextValue = {
  mode: "gestor" | "tecnico";
  confirmed: PendenciaItem[];
  draft: PendenciaItemDef[];
  draftCount: number;
  hasAnyPendencia: boolean;
  isPending: (itemId: string) => boolean;
  isDraftSelected: (itemId: string) => boolean;
  toggleDraft: (def: PendenciaItemDef) => void;
  clearDraft: () => void;
  goToItem: (item: PendenciaItem | PendenciaItemDef) => void;
  registerAbaController: (ctrl: AbaController | null) => void;
};

const PendenciasContext = createContext<PendenciasContextValue | null>(null);

export function PendenciasProvider({
  mode,
  confirmed,
  children,
}: {
  mode: "gestor" | "tecnico";
  confirmed: PendenciaItem[];
  children: ReactNode;
}) {
  const [draftMap, setDraftMap] = useState<Map<string, PendenciaItemDef>>(() => new Map());
  const abaCtrlRef = useRef<AbaController | null>(null);

  const confirmedIds = useMemo(
    () => new Set(confirmed.map((item) => item.itemId)),
    [confirmed],
  );

  const draft = useMemo(() => [...draftMap.values()], [draftMap]);

  const isPending = useCallback(
    (itemId: string) => confirmedIds.has(itemId) || draftMap.has(itemId),
    [confirmedIds, draftMap],
  );

  const isDraftSelected = useCallback(
    (itemId: string) => draftMap.has(itemId),
    [draftMap],
  );

  const toggleDraft = useCallback(
    (def: PendenciaItemDef) => {
      if (mode !== "gestor") return;
      setDraftMap((prev) => {
        const next = new Map(prev);
        if (next.has(def.itemId)) next.delete(def.itemId);
        else next.set(def.itemId, def);
        return next;
      });
    },
    [mode],
  );

  const clearDraft = useCallback(() => setDraftMap(new Map()), []);

  const registerAbaController = useCallback((ctrl: AbaController | null) => {
    abaCtrlRef.current = ctrl;
  }, []);

  const goToItem = useCallback((item: PendenciaItem | PendenciaItemDef) => {
    abaCtrlRef.current?.setAba(item.aba as AbaCampo);
    window.setTimeout(() => {
      navegarParaSecaoFormulario(item.anchorId);
    }, 120);
  }, []);

  const value = useMemo<PendenciasContextValue>(
    () => ({
      mode,
      confirmed,
      draft,
      draftCount: draft.length,
      hasAnyPendencia: confirmed.length > 0 || draft.length > 0,
      isPending,
      isDraftSelected,
      toggleDraft,
      clearDraft,
      goToItem,
      registerAbaController,
    }),
    [
      mode,
      confirmed,
      draft,
      isPending,
      isDraftSelected,
      toggleDraft,
      clearDraft,
      goToItem,
      registerAbaController,
    ],
  );

  return <PendenciasContext.Provider value={value}>{children}</PendenciasContext.Provider>;
}

export function usePendencias(): PendenciasContextValue | null {
  return useContext(PendenciasContext);
}

export function usePendenciasRequired(): PendenciasContextValue {
  const ctx = useContext(PendenciasContext);
  if (!ctx) throw new Error("usePendenciasRequired deve ser usado dentro de PendenciasProvider");
  return ctx;
}
