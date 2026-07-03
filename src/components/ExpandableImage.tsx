import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ExpandableImageProps = {
  src: string;
  alt: string;
  className?: string;
};

export function ExpandableImage({ src, alt, className }: ExpandableImageProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        aria-label={`Abrir ${alt}`}
      >
        <img
          src={src}
          alt={alt}
          decoding="async"
          loading="lazy"
          className={cn(
            "h-40 w-full cursor-zoom-in object-cover transition hover:opacity-95",
            className,
          )}
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-[min(100vw-1rem,56rem)] gap-0 overflow-hidden border-none bg-black/95 p-2 sm:p-3">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <img
            src={src}
            alt={alt}
            className="max-h-[calc(92vh-2.5rem)] w-full object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
