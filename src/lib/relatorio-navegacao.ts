/** Navegação por âncora dentro do formulário de relatório (índice / pendências). */

function highlightSecaoTemporaria(el: HTMLElement) {
  el.classList.add("ring-2", "ring-primary", "ring-offset-2", "transition");
  window.setTimeout(() => {
    el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "transition");
  }, 1800);
}

function abrirDetailsAncestrais(el: HTMLElement) {
  let node: HTMLElement | null = el;
  while (node) {
    if (node instanceof HTMLDetailsElement) node.open = true;
    node = node.parentElement;
  }
}

function findById(id: string): HTMLElement | null {
  try {
    return document.getElementById(id);
  } catch {
    return null;
  }
}

function findByPendenciaItemId(itemId: string): HTMLElement | null {
  try {
    return document.querySelector<HTMLElement>(
      `[data-pendencia-item="${CSS.escape(itemId)}"]`,
    );
  } catch {
    return null;
  }
}

function resolveTargetElement(opts: {
  targetId: string;
  itemId?: string;
  fallbackIds?: string[];
}): HTMLElement | null {
  const seen = new Set<string>();
  const tryId = (id: string | undefined) => {
    const v = id?.trim();
    if (!v || seen.has(v)) return null;
    seen.add(v);
    return findById(v);
  };

  let el = tryId(opts.targetId);
  if (el) return el;

  if (opts.itemId) {
    el = findByPendenciaItemId(opts.itemId);
    if (el) return el;
  }

  for (const id of opts.fallbackIds ?? []) {
    el = tryId(id);
    if (el) return el;
  }

  return null;
}

function scrollAndHighlight(el: HTMLElement) {
  abrirDetailsAncestrais(el);
  // Aguarda o layout do <details> abrir antes do scroll.
  window.setTimeout(() => {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    highlightSecaoTemporaria(el);
  }, 80);
}

export type NavegarSecaoOptions = {
  /** itemId estável da pendência — busca via [data-pendencia-item]. */
  itemId?: string;
  /** IDs alternativos (legado + seção pai). */
  fallbackIds?: string[];
  /** Tentativas extras enquanto a aba/ambiente monta o DOM. */
  retries?: number;
  retryDelayMs?: number;
};

/**
 * Abre accordions ancestrais, rola até o alvo e destaca temporariamente.
 * Retorna true se o alvo (ou fallback) foi encontrado na primeira tentativa;
 * retries posteriores continuam em background.
 */
export function navegarParaSecaoFormulario(
  targetId: string,
  options?: NavegarSecaoOptions,
): boolean {
  const retries = options?.retries ?? 6;
  const retryDelayMs = options?.retryDelayMs ?? 100;

  const attempt = (remaining: number): boolean => {
    const el = resolveTargetElement({
      targetId,
      itemId: options?.itemId,
      fallbackIds: options?.fallbackIds,
    });
    if (el) {
      scrollAndHighlight(el);
      return true;
    }
    if (remaining <= 0) return false;
    window.setTimeout(() => {
      attempt(remaining - 1);
    }, retryDelayMs);
    return false;
  };

  return attempt(retries);
}
