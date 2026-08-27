import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { navegarParaSecaoFormulario } from "@/lib/relatorio-navegacao";
import type {
  PendenciaAba,
  PendenciaItem,
  PendenciaItemDef,
  PendenciaBlocoId,
} from "@/lib/pendencias-itens";
import {
  countPendenciasNoBloco,
  resolvePendenciaNavTargets,
} from "@/lib/pendencias-itens";

type AbaController = {
  setAba: (aba: PendenciaAba) => void;
  /**
   * Troca Áereo/Subterrâneo (e estado necessário) para o cabo ficar montado no DOM
   * antes do scrollIntoView.
   */
  ensureCaboVisible?: (aba: "RE" | "RC", caboId: string) => void;
};

type PendenciasContextValue = {
  mode: "gestor" | "tecnico";
  confirmed: PendenciaItem[];
  draft: PendenciaItemDef[];
  draftCount: number;
  hasAnyPendencia: boolean;
  /** IDs ativos (confirmados ∪ rascunho do gestor), sem duplicata. */
  activeItemIds: Set<string>;
  isPending: (itemId: string) => boolean;
  isDraftSelected: (itemId: string) => boolean;
  countInBloco: (bloco: PendenciaBlocoId) => number;
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
  const safeConfirmed = Array.isArray(confirmed) ? confirmed : [];
  const [draftMap, setDraftMap] = useState<Map<string, PendenciaItemDef>>(() => new Map());
  const abaCtrlRef = useRef<AbaController | null>(null);

  const confirmedIds = useMemo(
    () => new Set(safeConfirmed.map((item) => item.itemId).filter(Boolean)),
    [safeConfirmed],
  );

  const draft = useMemo(() => [...draftMap.values()], [draftMap]);

  const activeItemIds = useMemo(() => {
    const ids = new Set<string>(confirmedIds);
    for (const item of draft) ids.add(item.itemId);
    return ids;
  }, [confirmedIds, draft]);

  const isPending = useCallback(
    (itemId: string) => activeItemIds.has(itemId),
    [activeItemIds],
  );

  const isDraftSelected = useCallback(
    (itemId: string) => draftMap.has(itemId),
    [draftMap],
  );

  const countInBloco = useCallback(
    (bloco: PendenciaBlocoId) => countPendenciasNoBloco(activeItemIds, bloco),
    [activeItemIds],
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
    const targets = resolvePendenciaNavTargets(item);
    const ctrl = abaCtrlRef.current;
    ctrl?.setAba(item.aba);
    if (targets.metragem) {
      ctrl?.ensureCaboVisible?.(targets.metragem.aba, targets.metragem.caboId);
    }

    const primary = targets.candidates[0] ?? item.anchorId;
    const fallbackIds = [
      ...targets.candidates.slice(1),
      ...targets.fallbackSectionIds,
    ];

    // Delay maior: troca de aba + ambiente (aéreo/sub) precisa remontar o card.
    window.setTimeout(() => {
      // Abre a seção pai cedo (accordion), mesmo se o cabo ainda não montou.
      for (const sectionId of targets.fallbackSectionIds) {
        const section = document.getElementById(sectionId);
        if (section instanceof HTMLDetailsElement) section.open = true;
        else if (section) {
          let node: HTMLElement | null = section;
          while (node) {
            if (node instanceof HTMLDetailsElement) {
              node.open = true;
              break;
            }
            node = node.parentElement;
          }
        }
      }

      navegarParaSecaoFormulario(primary, {
        itemId: item.itemId,
        fallbackIds,
        retries: 8,
        retryDelayMs: 120,
      });
    }, targets.metragem ? 180 : 120);
  }, []);

  const value = useMemo<PendenciasContextValue>(
    () => ({
      mode,
      confirmed: safeConfirmed,
      draft,
      draftCount: draft.length,
      hasAnyPendencia: activeItemIds.size > 0,
      activeItemIds,
      isPending,
      isDraftSelected,
      countInBloco,
      toggleDraft,
      clearDraft,
      goToItem,
      registerAbaController,
    }),
    [
      mode,
      safeConfirmed,
      draft,
      activeItemIds,
      isPending,
      isDraftSelected,
      countInBloco,
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
