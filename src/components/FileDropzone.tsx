import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function FileDropzone({
  title,
  description,
  accept = ".csv,.xlsx,.xls",
  busy,
  onFile,
}: {
  title: string;
  description: string;
  accept?: string;
  busy?: boolean;
  onFile: (file: File) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || busy) return;
    await onFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onClick={() => !busy && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition",
        dragging ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50",
        busy && "pointer-events-none opacity-60",
      )}
    >
      {busy ? (
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      ) : (
        <div className="grid h-14 w-14 place-items-center rounded-xl bg-primary/10 text-primary">
          <FileSpreadsheet className="h-7 w-7" />
        </div>
      )}
      <div>
        <div className="font-semibold text-foreground">{title}</div>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        <Upload className="h-4 w-4" />
        Selecionar arquivo
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}
