/** Extrai a primeira imagem colada da área de transferência. */
export function extractPastedImageFile(clipboardData: DataTransfer | null): File | null {
  if (!clipboardData) return null;

  const items = clipboardData.items;
  if (items?.length) {
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) return renamePastedImageFile(file);
      }
    }
  }

  const files = clipboardData.files;
  if (files?.length) {
    for (const file of files) {
      if (file.type.startsWith("image/")) return renamePastedImageFile(file);
    }
  }

  return null;
}

/** Evita nomes genéricos duplicados em uploads colados. */
export function renamePastedImageFile(file: File): File {
  const rawExt = file.type.split("/")[1] || "png";
  const ext = rawExt.replace("jpeg", "jpg");
  const name = `evidencia_colada_${Date.now()}.${ext}`;
  return new File([file], name, { type: file.type || "image/png" });
}

export function isTypingInFormField(): boolean {
  const active = document.activeElement;
  if (!active) return false;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return true;
  }
  if (active instanceof HTMLElement && active.isContentEditable) {
    return true;
  }
  return false;
}
