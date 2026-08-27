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

/** Abre accordions ancestrais, rola até o alvo e destaca temporariamente. */
export function navegarParaSecaoFormulario(targetId: string) {
  const el = document.getElementById(targetId);
  if (!el) return false;
  abrirDetailsAncestrais(el);
  // Aguarda o layout do <details> abrir antes do scroll (subseções em accordion fechado).
  window.setTimeout(() => {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    highlightSecaoTemporaria(el);
  }, 120);
  return true;
}
