import { useEffect, useRef } from "react";

/** Debounce de um efeito: dispara `fn` após `delayMs` sem novas mudanças em `deps`. */
export function useDebouncedEffect(
  fn: () => void,
  deps: unknown[],
  delayMs: number,
  enabled = true,
) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const serializedDeps = deps.map((dep) => {
    if (dep !== null && typeof dep === "object") {
      try {
        return JSON.stringify(dep);
      } catch {
        return String(dep);
      }
    }
    return dep;
  });

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      fnRef.current();
    }, delayMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...serializedDeps, delayMs, enabled]);
}
