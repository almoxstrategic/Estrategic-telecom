import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { extractPastedImageFile, isTypingInFormField } from "@/lib/paste-image";

type PhotoPasteSlot = {
  id: string;
  priority: number;
  isEmpty: boolean;
  isBusy: boolean;
  acceptFile: (file: File) => void;
};

type EvidencePhotoPasteContextValue = {
  registerSlot: (slot: PhotoPasteSlot) => void;
  unregisterSlot: (id: string) => void;
};

const EvidencePhotoPasteContext = createContext<EvidencePhotoPasteContextValue | null>(null);

export function EvidencePhotoPasteProvider({ children }: { children: ReactNode }) {
  const slotsRef = useRef<Map<string, PhotoPasteSlot>>(new Map());

  const registerSlot = useCallback((slot: PhotoPasteSlot) => {
    slotsRef.current.set(slot.id, slot);
  }, []);

  const unregisterSlot = useCallback((id: string) => {
    slotsRef.current.delete(id);
  }, []);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isTypingInFormField()) return;

      const pastedFile = extractPastedImageFile(event.clipboardData);
      if (!pastedFile) return;

      const slots = [...slotsRef.current.values()]
        .filter((slot) => slot.isEmpty && !slot.isBusy)
        .sort((a, b) => a.priority - b.priority);

      if (slots.length === 0) {
        const anyBusy = [...slotsRef.current.values()].some((slot) => slot.isBusy);
        if (anyBusy) return;
        toast.info("As fotos de início e fim já foram adicionadas.");
        return;
      }

      event.preventDefault();
      slots[0]!.acceptFile(pastedFile);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  return (
    <EvidencePhotoPasteContext.Provider value={{ registerSlot, unregisterSlot }}>
      {children}
    </EvidencePhotoPasteContext.Provider>
  );
}

export function useEvidencePhotoPasteSlot(input: {
  priority: number;
  isEmpty: boolean;
  isBusy: boolean;
  acceptFile: (file: File) => void;
}) {
  const context = useContext(EvidencePhotoPasteContext);
  const id = useId();
  const acceptRef = useRef(input.acceptFile);
  acceptRef.current = input.acceptFile;

  useEffect(() => {
    if (!context) return;

    const slot: PhotoPasteSlot = {
      id,
      priority: input.priority,
      isEmpty: input.isEmpty,
      isBusy: input.isBusy,
      acceptFile: (file) => acceptRef.current(file),
    };

    context.registerSlot(slot);
    return () => context.unregisterSlot(id);
  }, [context, id, input.priority, input.isEmpty, input.isBusy]);
}
