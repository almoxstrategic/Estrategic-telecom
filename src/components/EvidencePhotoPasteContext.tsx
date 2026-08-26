import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { extractPastedImageFile, isTypingInFormField } from "@/lib/paste-image";

export const EVIDENCE_PASTE_SLOT_ATTR = "data-evidence-paste-slot";

type PhotoPasteSlot = {
  id: string;
  isBusy: boolean;
  /** Slot vazio ou com substituição permitida. */
  canAccept: boolean;
  acceptFile: (file: File) => void;
};

type EvidencePhotoPasteContextValue = {
  registerSlot: (slot: PhotoPasteSlot) => void;
  unregisterSlot: (id: string) => void;
  setActiveSlot: (id: string | null) => void;
};

const EvidencePhotoPasteContext = createContext<EvidencePhotoPasteContextValue | null>(null);

function findSlotIdFromElement(el: Element | null): string | null {
  if (!el) return null;
  const host = el.closest(`[${EVIDENCE_PASTE_SLOT_ATTR}]`);
  if (!host) return null;
  return host.getAttribute(EVIDENCE_PASTE_SLOT_ATTR);
}

export function EvidencePhotoPasteProvider({ children }: { children: ReactNode }) {
  const slotsRef = useRef<Map<string, PhotoPasteSlot>>(new Map());
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const activeSlotIdRef = useRef<string | null>(null);

  const registerSlot = useCallback((slot: PhotoPasteSlot) => {
    slotsRef.current.set(slot.id, slot);
  }, []);

  const unregisterSlot = useCallback((id: string) => {
    slotsRef.current.delete(id);
    if (activeSlotIdRef.current === id) activeSlotIdRef.current = null;
  }, []);

  const setActiveSlot = useCallback((id: string | null) => {
    activeSlotIdRef.current = id;
  }, []);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };

    const resolveTargetId = (): string | null => {
      const point = pointerRef.current;
      if (point) {
        const underPointer = document.elementFromPoint(point.x, point.y);
        const fromPoint = findSlotIdFromElement(underPointer);
        if (fromPoint) return fromPoint;
      }

      const fromFocus = findSlotIdFromElement(document.activeElement);
      if (fromFocus) return fromFocus;

      return activeSlotIdRef.current;
    };

    const handlePaste = (event: ClipboardEvent) => {
      // Provider aninhado sem slots registrados: não interfere.
      if (slotsRef.current.size === 0) return;
      if (isTypingInFormField()) return;

      const pastedFile = extractPastedImageFile(event.clipboardData);
      if (!pastedFile) return;

      const targetId = resolveTargetId();
      if (!targetId) {
        toast.info("Posicione o mouse sobre o campo de foto e pressione Ctrl+V.");
        // Evita toast duplicado de providers aninhados.
        event.stopImmediatePropagation();
        return;
      }

      const slot = slotsRef.current.get(targetId);
      // DOM marcado por outro provider (aninhado) — deixa o outro listener tratar.
      if (!slot) return;
      if (slot.isBusy) return;
      if (!slot.canAccept) {
        toast.info("Este campo de foto não aceita colagem no momento.");
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      slot.acceptFile(pastedFile);
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    // capture: resolve antes de listeners de providers aninhados / inputs.
    window.addEventListener("paste", handlePaste, true);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("paste", handlePaste, true);
    };
  }, []);

  return (
    <EvidencePhotoPasteContext.Provider value={{ registerSlot, unregisterSlot, setActiveSlot }}>
      {children}
    </EvidencePhotoPasteContext.Provider>
  );
}

export function useEvidencePhotoPasteSlot(input: {
  /** true quando o slot pode receber a imagem (vazio ou substituição). */
  canAccept: boolean;
  isBusy: boolean;
  acceptFile: (file: File) => void;
}): {
  pasteTargetProps: HTMLAttributes<HTMLElement> & Record<typeof EVIDENCE_PASTE_SLOT_ATTR, string>;
} {
  const context = useContext(EvidencePhotoPasteContext);
  const id = useId();
  const acceptRef = useRef(input.acceptFile);
  acceptRef.current = input.acceptFile;

  useEffect(() => {
    if (!context) return;

    context.registerSlot({
      id,
      isBusy: input.isBusy,
      canAccept: input.canAccept,
      acceptFile: (file) => acceptRef.current(file),
    });
    return () => context.unregisterSlot(id);
  }, [context, id, input.canAccept, input.isBusy]);

  if (!context) {
    return {
      pasteTargetProps: {
        [EVIDENCE_PASTE_SLOT_ATTR]: id,
      },
    };
  }

  const { setActiveSlot } = context;

  return {
    pasteTargetProps: {
      [EVIDENCE_PASTE_SLOT_ATTR]: id,
      onMouseEnter: () => setActiveSlot(id),
      onMouseLeave: (event) => {
        const related = event.relatedTarget;
        if (related instanceof Element) {
          const host = related.closest(`[${EVIDENCE_PASTE_SLOT_ATTR}]`);
          if (host?.getAttribute(EVIDENCE_PASTE_SLOT_ATTR) === id) return;
        }
        setActiveSlot(null);
      },
      onFocus: () => setActiveSlot(id),
      onBlur: (event) => {
        const related = event.relatedTarget;
        if (related instanceof Element) {
          const host = related.closest(`[${EVIDENCE_PASTE_SLOT_ATTR}]`);
          if (host?.getAttribute(EVIDENCE_PASTE_SLOT_ATTR) === id) return;
        }
        setActiveSlot(null);
      },
    },
  };
}
