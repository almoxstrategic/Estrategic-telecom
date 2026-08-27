import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Menu,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import { FotoLabel, RelatorioFotoComControles } from "@/components/RelatorioFotoComControles";
import { PhotoUpload } from "@/components/PhotoUpload";
import { PendenciaItemFrame } from "@/components/pendencias/PendenciaItemFrame";
import { usePendencias } from "@/components/pendencias/PendenciasContext";
import { RelatorioFotosBloco, type FotoSlot } from "@/components/RelatorioFotosBloco";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { EvidencePhotoRef } from "@/lib/types";
import {
  pendenciaFotoGrupo,
  pendenciaMetragemCabo,
  pendenciaPergunta,
  type PendenciaBlocoId,
  type PendenciaItem,
  type PendenciaItemDef,
} from "@/lib/pendencias-itens";
import { cn } from "@/lib/utils";
import {
  apenasDigitos,
  calcularMetragemCaboTotal,
  deleteRelatorioPhoto,
  finalizeMedicaoInput,
  gateSimComLegado,
  type AmbienteRede,
  type CaboMetragemPayload,
  type RelatorioFotoGrupoKey,
  type StoredPhoto,
  type TipoExecucao,
} from "@/lib/relatorios-transmissao";

export type AbaCampo =
  | "RE"
  | "RC"
  | "equipamento"
  | "teste-optico"
  | "teste-otdr"
  | "teste-potencia"
  | "infraestrutura"
  | "medicoes"
  | "contatos";

export const ABAS_CAMPO: { id: AbaCampo; label: string }[] = [
  { id: "RE", label: "Rede Externa (RE)" },
  { id: "RC", label: "Rede Cliente (RC)" },
  { id: "equipamento", label: "Equipamento" },
  { id: "teste-optico", label: "Teste Óptico" },
  { id: "teste-otdr", label: "Teste OTDR" },
  { id: "teste-potencia", label: "Teste de Potência" },
  { id: "infraestrutura", label: "Infraestrutura" },
  { id: "medicoes", label: "Medições" },
  { id: "contatos", label: "Contatos" },
];

/** App de campo (técnico): sem Contatos, Infraestrutura nem Medições (abas só no painel do gestor). */
export const ABAS_CAMPO_TECNICO: { id: AbaCampo; label: string }[] = ABAS_CAMPO.filter(
  (aba) => aba.id !== "contatos" && aba.id !== "infraestrutura" && aba.id !== "medicoes",
);

export const ABAS_CAMPO_IMPLANTACAO: { id: AbaCampo; label: string }[] = [
  { id: "RE", label: "Rede Externa (RE)" },
  { id: "teste-otdr", label: "Teste OTDR" },
];

export type OutraFotoState = {
  id: string;
  ref: string;
  file: EvidencePhotoRef | null;
  stored: StoredPhoto | null;
  obs: string;
  obsAdmin: string;
};

export function emptyOutraFoto(): OutraFotoState {
  return { id: crypto.randomUUID(), ref: "", file: null, stored: null, obs: "", obsAdmin: "" };
}

export function inputClass() {
  return "w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted";
}

/** Inputs da visão Gestor — borda e texto com contraste reforçado. */
export function inputClassGestor() {
  return "w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-base text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted";
}

/** Textarea de OBS compacta (2 linhas) com resize vertical manual. */
export function textareaObsClass() {
  return `${inputClass()} min-h-[64px] resize-y`;
}

export const REF_TITULO_PLACEHOLDER = "Ex: Foto do quadro de energia";

export function RefTituloInput({
  value,
  onChange,
  onBlur,
  disabled = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        Referência (REF)
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
        placeholder={REF_TITULO_PLACEHOLDER}
        disabled={disabled}
        className={inputClass()}
      />
    </div>
  );
}

export function ChoiceButton({
  active,
  children,
  onClick,
  disabled = false,
  locked = false,
}: {
  active: boolean;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  locked?: boolean;
}) {
  const bloqueado = disabled || locked;
  return (
    <button
      type="button"
      onClick={bloqueado ? undefined : onClick}
      disabled={bloqueado}
      className={`w-full min-w-0 flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium leading-tight transition ${
        active
          ? `border-primary bg-primary text-primary-foreground ${locked ? "disabled:opacity-100" : ""}`
          : locked
            ? "border-gray-200 bg-gray-100 text-gray-400 opacity-40"
            : "border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200/80"
      } ${locked ? "pointer-events-none cursor-default" : ""} ${
        bloqueado && !locked ? "disabled:cursor-not-allowed disabled:opacity-60" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function TipoExecucaoPicker({
  value,
  onChange,
  locked = false,
  disabled = false,
  invalid = false,
}: {
  value: TipoExecucao | "";
  onChange?: (tipo: TipoExecucao) => void;
  locked?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <div
      className={`flex gap-2 ${locked ? "pointer-events-none" : ""} ${
        invalid ? "rounded-xl ring-1 ring-destructive" : ""
      }`}
      role="radiogroup"
      aria-label="Tipo de execução"
      aria-disabled={locked || disabled}
      aria-required={!locked}
      aria-invalid={invalid || undefined}
    >
      <ChoiceButton
        active={value === "implantacao"}
        locked={locked}
        disabled={disabled}
        onClick={() => onChange?.("implantacao")}
      >
        Implantação
      </ChoiceButton>
      <ChoiceButton
        active={value === "empresarial"}
        locked={locked}
        disabled={disabled}
        onClick={() => onChange?.("empresarial")}
      >
        Empresarial
      </ChoiceButton>
    </div>
  );
}

/** Âncora DOM da barra sticky (abas + busca) — usada para medir o offset do accordion. */
export const RELATORIO_ABAS_STICKY_ID = "relatorio-abas-sticky";

/** Chrome opcional acima das abas (ex.: AppHeader sticky em outras telas). */
export const GESTOR_TOP_CHROME_ID = "gestor-top-chrome";

/** Fallback de altura do header sticky — usado só se houver chrome no DOM. */
const APP_HEADER_STICKY_PX = 44;
/** Fallback se a barra ainda não estiver no DOM. */
const ABAS_BAR_FALLBACK_PX = 104;

function useAbasStickyOffsetPx(stickTabsAtViewportTop: boolean): number {
  const [offsetPx, setOffsetPx] = useState(
    stickTabsAtViewportTop ? ABAS_BAR_FALLBACK_PX : APP_HEADER_STICKY_PX + ABAS_BAR_FALLBACK_PX,
  );

  useEffect(() => {
    const measure = () => {
      const bar = document.getElementById(RELATORIO_ABAS_STICKY_ID);
      const barH = bar?.getBoundingClientRect().height ?? ABAS_BAR_FALLBACK_PX;
      const chrome = document.getElementById(GESTOR_TOP_CHROME_ID);
      const headerH = stickTabsAtViewportTop
        ? 0
        : Math.round(chrome?.getBoundingClientRect().height ?? APP_HEADER_STICKY_PX);
      setOffsetPx(Math.round(headerH + barH));
    };

    measure();
    const bar = document.getElementById(RELATORIO_ABAS_STICKY_ID);
    const chrome = document.getElementById(GESTOR_TOP_CHROME_ID);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (bar && ro) ro.observe(bar);
    if (chrome && ro) ro.observe(chrome);
    window.addEventListener("resize", measure);
    const mo =
      typeof MutationObserver !== "undefined" && bar
        ? new MutationObserver(measure)
        : null;
    if (bar && mo) mo.observe(bar, { attributes: true, childList: true, subtree: true });

    return () => {
      ro?.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [stickTabsAtViewportTop]);

  return offsetPx;
}

function useAccordionStuck(
  sentinelRef: RefObject<HTMLElement | null>,
  stickyOffsetPx: number,
): boolean {
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || stickyOffsetPx <= 0) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Sentinela acima da linha sticky (rootMargin) → cabeçalho está "preso".
        setIsStuck(!entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0,
        rootMargin: `-${stickyOffsetPx}px 0px 0px 0px`,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelRef, stickyOffsetPx]);

  return isStuck;
}

export type SecaoPesquisavel = {
  titulo: string;
  id: string;
};

export type IndiceMenuBloco = {
  titulo: string;
  subitens: SecaoPesquisavel[];
};

/** Árvore de navegação do menu lateral por aba. */
export const INDICE_MENU_POR_ABA: Partial<Record<AbaCampo, IndiceMenuBloco[]>> = {
  RE: [
    {
      titulo: "LANÇAMENTO (RE)",
      subitens: [
        { titulo: "Lançamento de cabos", id: "secao-cabos" },
        { titulo: "Sobra técnica", id: "secao-sobraTecnica" },
        { titulo: "Const. de duto subterrâneo (MD ou MND)", id: "secao-dutoSubterraneo" },
      ],
    },
    {
      titulo: "POSTE (RE)",
      subitens: [
        { titulo: "Poste de conexão", id: "secao-posteConexao" },
        { titulo: "Novo aterramento do poste", id: "secao-novoAterramentoPoste" },
      ],
    },
    {
      titulo: "CAIXA DE EMENDA (RE)",
      subitens: [
        { titulo: "Caixa de emenda", id: "secao-caixaEmenda" },
      ],
    },
    {
      titulo: "OUTRAS FOTOS (RE)",
      subitens: [{ titulo: "Outras fotos", id: "secao-outras-fotos" }],
    },
  ],
  RC: [
    {
      titulo: "LOCAL (RC)",
      subitens: [
        { titulo: "Coordenadas do Cliente", id: "secao-coordenadas-cliente" },
        { titulo: "Cliente - (Entrada/Fachada)", id: "secao-eqClienteFachada" },
        { titulo: "Cliente - Ambiente (geral da sala)", id: "secao-eqClienteAmbiente" },
        { titulo: "(Rack ou Local)", id: "secao-eqClienteRack" },
      ],
    },
    {
      titulo: "LANÇAMENTO (RC)",
      subitens: [
        { titulo: "Lançamento de cabos", id: "secao-cabos" },
        { titulo: "Entrada do cabo (área externa)", id: "secao-rcEntradaExterna" },
        { titulo: "Entrada do cabo (área interna)", id: "secao-rcEntradaInterna" },
        { titulo: "Terminação do cabo no cliente", id: "secao-rcTerminacaoCabo" },
        { titulo: "Sobra técnica", id: "secao-rcSobraTecnica" },
        { titulo: "Fiberloop instalado?", id: "secao-fiberloopInstalado" },
        { titulo: "Const. de duto subterrâneo (MD ou MND)", id: "secao-rcDutoSubterraneo" },
      ],
    },
    {
      titulo: "POSTE (RC)",
      subitens: [
        { titulo: "Poste de conexão", id: "secao-rcPosteConexao" },
        { titulo: "Novo aterramento do poste", id: "secao-rcNovoAterramentoPoste" },
      ],
    },
    {
      titulo: "CAIXA DE EMENDA (RC)",
      subitens: [
        { titulo: "Caixa de emenda na acomodação", id: "secao-rcCaixaEmenda" },
      ],
    },
    {
      titulo: "OUTRAS FOTOS (RC)",
      subitens: [{ titulo: "Outras fotos", id: "secao-outras-fotos" }],
    },
  ],
  equipamento: [
    {
      titulo: "EQUIPAMENTO NO CLIENTE",
      subitens: [
        { titulo: "Tecnologia de Acesso", id: "secao-tecnologia-acesso" },
        { titulo: "Roseta", id: "secao-eq-dgo-cliente" },
        { titulo: "Equipamento", id: "secao-eq-equipamentos-cliente" },
        { titulo: "Identificação SGP no Cliente", id: "secao-eqClienteSgp" },
        { titulo: "Configuração equipamento no cliente", id: "secao-eq-config-cliente" },
      ],
    },
    {
      titulo: "EQUIPAMENTO NA ESTAÇÃO",
      subitens: [
        { titulo: "Estação Entrega de Acesso", id: "secao-estacao-entrega-acesso" },
        { titulo: "DGO / DID / ROUTER", id: "secao-eq-dgo-estacao" },
        { titulo: "Posição de conexão na Estação/PPC", id: "secao-posicaoConexaoEstacao" },
        { titulo: "ETIQUETA DE IDENTIFICAÇÃO NA ESTAÇÃO/PPC", id: "secao-etiquetaIdentificacao" },
        { titulo: "Equipamento", id: "secao-eq-equipamentos-estacao" },
        { titulo: "Configuração equipamento na estação", id: "secao-eq-config-estacao" },
      ],
    },
    {
      titulo: "OUTRAS FOTOS",
      subitens: [{ titulo: "Outras fotos", id: "secao-eq-outras-fotos" }],
    },
  ],
};

/** Índice de navegação rápida por aba (âncoras no próprio formulário). */
export const SECOES_PESQUISAVEIS_POR_ABA: Partial<Record<AbaCampo, SecaoPesquisavel[]>> = {
  RE: [
    { titulo: "LANÇAMENTO (RE)", id: "secao-cabos" },
    { titulo: "Cabo e Lançamento", id: "secao-cabos" },
    { titulo: "Cabos", id: "secao-cabos" },
    { titulo: "Lançamento de Cabos", id: "secao-cabos" },
    { titulo: "Sobra técnica", id: "secao-sobraTecnica" },
    { titulo: "POSTE (RE)", id: "secao-poste" },
    { titulo: "Poste de conexão", id: "secao-posteConexao" },
    { titulo: "Novo aterramento do poste", id: "secao-novoAterramentoPoste" },
    { titulo: "CAIXA DE EMENDA (RE)", id: "secao-caixa-emenda" },
    { titulo: "Caixa de emenda (fotos)", id: "secao-caixaEmenda" },
    { titulo: "Const. de duto subterrâneo (MD ou MND)", id: "secao-dutoSubterraneo" },
    { titulo: "OUTRAS FOTOS (RE)", id: "secao-outras-fotos" },
  ],
  RC: [
    { titulo: "LOCAL (RC)", id: "secao-local" },
    { titulo: "Coordenadas do Cliente", id: "secao-coordenadas-cliente" },
    { titulo: "Cliente - (Entrada/Fachada)", id: "secao-eqClienteFachada" },
    { titulo: "Cliente - Ambiente (geral da sala)", id: "secao-eqClienteAmbiente" },
    { titulo: "(Rack ou Local)", id: "secao-eqClienteRack" },
    { titulo: "LANÇAMENTO (RC)", id: "secao-cabos" },
    { titulo: "Cabo e Lançamento", id: "secao-cabos" },
    { titulo: "Cabos", id: "secao-cabos" },
    { titulo: "Lançamento de Cabos", id: "secao-cabos" },
    { titulo: "Entrada do cabo (área externa)", id: "secao-rcEntradaExterna" },
    { titulo: "Entrada do cabo (área interna)", id: "secao-rcEntradaInterna" },
    { titulo: "Terminação do cabo no cliente", id: "secao-rcTerminacaoCabo" },
    { titulo: "Sobra técnica", id: "secao-rcSobraTecnica" },
    { titulo: "Fiberloop instalado?", id: "secao-fiberloopInstalado" },
    { titulo: "Const. de duto subterrâneo (MD ou MND)", id: "secao-rcDutoSubterraneo" },
    { titulo: "POSTE (RC)", id: "secao-poste" },
    { titulo: "Poste de conexão", id: "secao-rcPosteConexao" },
    { titulo: "Novo aterramento do poste", id: "secao-rcNovoAterramentoPoste" },
    { titulo: "CAIXA DE EMENDA (RC)", id: "secao-caixa-emenda" },
    { titulo: "Caixa de emenda na acomodação", id: "secao-rcCaixaEmenda" },
    { titulo: "OUTRAS FOTOS (RC)", id: "secao-outras-fotos" },
  ],
  equipamento: [
    { titulo: "EQUIPAMENTO NO CLIENTE", id: "secao-eq-cliente" },
    { titulo: "Tecnologia de Acesso", id: "secao-tecnologia-acesso" },
    { titulo: "Roseta", id: "secao-eq-dgo-cliente" },
    { titulo: "Equipamento", id: "secao-eq-equipamentos-cliente" },
    { titulo: "Identificação SGP no Cliente", id: "secao-eqClienteSgp" },
    { titulo: "Configuração equipamento no cliente", id: "secao-eq-config-cliente" },
    { titulo: "EQUIPAMENTO NA ESTAÇÃO", id: "secao-eq-estacao" },
    { titulo: "Estação Entrega de Acesso", id: "secao-estacao-entrega-acesso" },
    { titulo: "DGO / DID / ROUTER", id: "secao-eq-dgo-estacao" },
    { titulo: "Posição de conexão na Estação/PPC", id: "secao-posicaoConexaoEstacao" },
    { titulo: "ETIQUETA DE IDENTIFICAÇÃO NA ESTAÇÃO/PPC", id: "secao-etiquetaIdentificacao" },
    { titulo: "Equipamento na estação", id: "secao-eq-equipamentos-estacao" },
    { titulo: "Configuração equipamento na estação", id: "secao-eq-config-estacao" },
    { titulo: "OUTRAS FOTOS", id: "secao-eq-outras-fotos" },
  ],
};

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

function RelatorioIndiceLateral({
  open,
  onClose,
  blocos,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  blocos: IndiceMenuBloco[];
  onNavigate: (targetId: string) => void;
}) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-black/50"
        onClick={onClose}
        aria-label="Fechar menu de índice"
      />
      <aside
        className="fixed inset-y-0 left-0 z-[60] flex h-full w-72 max-w-[75vw] flex-col bg-white shadow-xl animate-in slide-in-from-left duration-300"
        aria-label="Índice do formulário"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">Índice</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-4 py-3">
          {blocos.map((bloco) => (
            <div key={bloco.titulo} className="mb-4 last:mb-0">
              <p className="text-sm font-bold text-foreground">{bloco.titulo}</p>
              <ul className="mt-1.5 space-y-0.5">
                {bloco.subitens.map((item) => (
                  <li key={`${item.id}-${item.titulo}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onNavigate(item.id);
                      }}
                      onClick={() => onNavigate(item.id)}
                      className="w-full rounded-md py-1.5 pl-3 text-left text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      {item.titulo}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

export function RelatorioAbasCampo({
  abaAtiva,
  onChange,
  abas = ABAS_CAMPO,
  secoesPesquisaveis,
  stickToViewportTop = false,
  temPendencia = false,
  motivoPendencia = null,
  pendenciasItens = [],
  layoutMode = "tecnico",
}: {
  abaAtiva: AbaCampo;
  onChange: (aba: AbaCampo) => void;
  abas?: { id: AbaCampo; label: string }[];
  /** Sobrescreve o índice padrão de seções da aba ativa. */
  secoesPesquisaveis?: SecaoPesquisavel[];
  /** Técnico no relatório: gruda no topo da viewport (header da app não é sticky). */
  stickToViewportTop?: boolean;
  /** Exibe badge no sino quando o relatório está em pendência. */
  temPendencia?: boolean;
  /** Texto detalhado da pendência (exibido no popover do sino). */
  motivoPendencia?: string | null;
  /** Itens granulares confirmados (cards clicáveis no sininho). */
  pendenciasItens?: PendenciaItem[];
  /**
   * `tecnico` = linha única + scroll horizontal (mobile).
   * `gestor` = abas distribuídas sem scroll (desktop auditoria).
   */
  layoutMode?: "tecnico" | "gestor";
}) {
  const isGestor = layoutMode === "gestor";
  /** Técnico mobile: setas nas bordas e abas com largura máxima entre elas. */
  const tabsFullBleed = !isGestor;
  const pendenciasCtx = usePendencias();
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState(false);
  const abaInicialRef = useRef(true);
  const buscaWrapRef = useRef<HTMLDivElement | null>(null);
  const abasScrollRef = useRef<HTMLNavElement | null>(null);

  const secoes = secoesPesquisaveis ?? SECOES_PESQUISAVEIS_POR_ABA[abaAtiva] ?? [];
  const indiceMenu = INDICE_MENU_POR_ABA[abaAtiva] ?? [];
  const resultados = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    if (!termo) return [];
    const vistos = new Set<string>();
    return secoes.filter((s) => {
      if (!s.titulo.toLowerCase().includes(termo)) return false;
      if (vistos.has(s.id)) return false;
      vistos.add(s.id);
      return true;
    });
  }, [searchTerm, secoes]);

  useEffect(() => {
    if (abaInicialRef.current) {
      abaInicialRef.current = false;
      return;
    }
    setSearchTerm("");
    setIsDropdownOpen(false);
    setIsSideMenuOpen(false);
    const timer = window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [abaAtiva]);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 120);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!buscaWrapRef.current || !target) return;
      if (!buscaWrapRef.current.contains(target)) setIsDropdownOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, []);

  const handleSelectSearchResult = (targetId: string) => {
    const ok = navegarParaSecaoFormulario(targetId);
    setSearchTerm("");
    setIsDropdownOpen(false);
    if (!ok) {
      // Retry curto: DOM pode ainda não ter montado após troca de aba.
      window.setTimeout(() => navegarParaSecaoFormulario(targetId), 160);
    }
  };

  const handleIndiceNavigate = (targetId: string) => {
    setIsSideMenuOpen(false);
    navegarParaSecaoFormulario(targetId);
  };

  const scrollAbas = (direction: "left" | "right") => {
    const el = abasScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === "left" ? -160 : 160, behavior: "smooth" });
  };

  return (
    <>
      <div
        id={RELATORIO_ABAS_STICKY_ID}
        className={
          stickToViewportTop && !isGestor
            ? cn(
                "sticky top-0 z-40 -mx-5 w-[calc(100%+2.5rem)] max-w-none bg-background py-2 shadow-sm",
                tabsFullBleed ? "px-0" : "px-5",
              )
            : cn(
                isGestor
                  ? /* Gestor Transmissão: abas no topo da viewport (logo não é sticky). */
                    "sticky top-0 z-50 w-full max-w-full isolate border-b border-gray-200 bg-white pt-1.5 pb-2"
                  : "sticky top-16 z-40 w-full bg-white py-2",
                tabsFullBleed ? "-mx-5 w-[calc(100%+2.5rem)] max-w-none px-0" : "",
              )
        }
      >
        <div
          className={cn(
            "flex w-full items-center",
            isGestor ? "mb-2 gap-1.5" : tabsFullBleed ? "gap-0" : "gap-1",
          )}
        >
          {!isGestor ? (
            <button
              type="button"
              onClick={() => scrollAbas("left")}
              className="shrink-0 px-1 py-1 text-gray-400 transition hover:text-gray-600"
              aria-label="Rolar abas para a esquerda"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          <nav
            ref={abasScrollRef}
            className={
              isGestor
                ? "flex w-full min-w-0 flex-1 flex-wrap items-center justify-center gap-1.5"
                : "mx-0 flex w-full min-w-0 flex-1 flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            }
            aria-label="Seções do relatório"
          >
            {abas.map((aba) => {
              const ativa = abaAtiva === aba.id;
              return (
                <button
                  key={aba.id}
                  type="button"
                  onClick={() => onChange(aba.id)}
                  className={`shrink-0 whitespace-nowrap rounded-full border text-center font-semibold transition ${
                    isGestor
                      ? "border-gray-200 px-2.5 py-1 text-[11px] md:text-xs"
                      : "border-border px-3 py-1.5 text-xs"
                  } ${
                    ativa
                      ? "border-primary bg-primary text-primary-foreground"
                      : isGestor
                        ? "bg-white text-gray-700 hover:bg-gray-50"
                        : "bg-white text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {aba.label}
                </button>
              );
            })}
          </nav>
          {!isGestor ? (
            <button
              type="button"
              onClick={() => scrollAbas("right")}
              className="shrink-0 px-1 py-1 text-gray-400 transition hover:text-gray-600"
              aria-label="Rolar abas para a direita"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : null}
        </div>

        <div
          ref={buscaWrapRef}
          className={cn(
            "relative w-full",
            isGestor ? "mt-0" : "mt-2",
            tabsFullBleed && "px-5",
          )}
        >
          <div className="flex items-center gap-2">
            {indiceMenu.length > 0 ? (
              <button
                type="button"
                onClick={() => setIsSideMenuOpen(true)}
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-lg border bg-white text-foreground transition hover:bg-muted",
                  isGestor
                    ? "h-8 w-8 border-gray-200"
                    : "h-10 w-10 border-input",
                )}
                aria-label="Abrir índice de seções"
              >
                <Menu className={isGestor ? "h-4 w-4" : "h-5 w-5"} />
              </button>
            ) : null}

            <div className="relative min-w-0 flex-1">
              {secoes.length > 0 ? (
                <>
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setIsDropdownOpen(true);
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder="Buscar seção (ex: Caixa de Emenda)"
                    className={cn(
                      "box-border w-full rounded-lg bg-white pr-3 text-sm text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                      isGestor
                        ? "border border-gray-200 py-1.5 pl-9 text-[13px]"
                        : "border border-input py-2 pl-9",
                    )}
                    aria-label="Busca rápida de seções do formulário"
                    autoComplete="off"
                  />
                </>
              ) : null}
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "relative flex shrink-0 items-center justify-center rounded-lg border bg-white transition hover:bg-muted",
                    isGestor ? "h-8 w-8 border-gray-200" : "h-10 w-10 border-input",
                    temPendencia ? "text-destructive" : isGestor ? "text-gray-700" : "text-muted-foreground",
                  )}
                  aria-label={
                    temPendencia ? "Ver pendência do relatório" : "Notificações do relatório"
                  }
                >
                  <Bell className={isGestor ? "h-4 w-4" : "h-5 w-5"} />
                  {temPendencia ? (
                    <span
                      className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-background"
                      aria-hidden
                    />
                  ) : null}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                {pendenciasItens.length > 0 ? (
                  <div className="max-h-80 overflow-y-auto">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-semibold text-destructive">
                        Pendências ({pendenciasItens.length})
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Toque para ir ao item
                      </p>
                    </div>
                    <ul className="divide-y divide-border">
                      {pendenciasItens.map((item) => (
                        <li key={item.itemId}>
                          <button
                            type="button"
                            className="w-full px-4 py-3 text-left transition hover:bg-amber-50"
                            onClick={() => {
                              if (pendenciasCtx) pendenciasCtx.goToItem(item);
                              else {
                                onChange(item.aba as AbaCampo);
                                window.setTimeout(
                                  () => navegarParaSecaoFormulario(item.anchorId),
                                  120,
                                );
                              }
                            }}
                          >
                            <p className="text-sm font-medium text-foreground">{item.label}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {item.aba} · Seção - Subbloco
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : temPendencia ? (
                  <div className="space-y-1.5 p-4">
                    <p className="text-sm font-semibold text-destructive">
                      Relatório com pendência
                    </p>
                    <p className="text-sm text-foreground">
                      {motivoPendencia?.trim() ||
                        "A supervisão solicitou correções neste relatório."}
                    </p>
                  </div>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    Nenhuma pendência no momento.
                  </p>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {secoes.length > 0 && isDropdownOpen && searchTerm.trim() ? (
            <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-white shadow-lg">
              {resultados.length === 0 ? (
                <li className="p-3 text-sm text-muted-foreground">Nenhuma seção encontrada</li>
              ) : (
                resultados.map((item) => (
                  <li key={`${item.id}-${item.titulo}`}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        // Evita que o blur/mousedown do document feche o dropdown antes do click.
                        e.preventDefault();
                        handleSelectSearchResult(item.id);
                      }}
                      onClick={() => handleSelectSearchResult(item.id)}
                      className="w-full cursor-pointer border-b border-border px-3 py-3 text-left text-sm last:border-b-0 hover:bg-gray-100"
                    >
                      {item.titulo}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      </div>

      <RelatorioIndiceLateral
        open={isSideMenuOpen}
        onClose={() => setIsSideMenuOpen(false)}
        blocos={indiceMenu}
        onNavigate={handleIndiceNavigate}
      />

      {showBackToTop ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-24 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-gray-800 text-white shadow-lg transition-all hover:bg-gray-700"
          aria-label="Voltar ao topo"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      ) : null}
    </>
  );
}

export function RelatorioAbaFixa({ label }: { label: string }) {
  return (
    <div className="-mx-1 px-1 pb-1" aria-label={label}>
      <span className="inline-flex rounded-full border border-primary bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
        {label}
      </span>
    </div>
  );
}

export function CampoCoordenadas({
  title = "Coordenadas",
  value,
  onChange,
  disabled = false,
  embedded = false,
  id,
}: {
  title?: string;
  value: { latitude: string; longitude: string };
  onChange?: (next: { latitude: string; longitude: string }) => void;
  disabled?: boolean;
  /** Sem card externo (quando já está dentro de outro bloco). */
  embedded?: boolean;
  id?: string;
}) {
  const idLat = useId();
  const idLng = useId();
  const body = (
    <>
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={idLat} className="mb-1.5 block text-sm font-semibold">
            Latitude (Y)
          </label>
          <input
            id={idLat}
            type="text"
            inputMode="decimal"
            placeholder="Ex: -23.550520"
            value={value.latitude}
            disabled={disabled || !onChange}
            onChange={(e) => onChange?.({ ...value, latitude: e.target.value })}
            className={inputClass()}
          />
        </div>
        <div>
          <label htmlFor={idLng} className="mb-1.5 block text-sm font-semibold">
            Longitude (X)
          </label>
          <input
            id={idLng}
            type="text"
            inputMode="decimal"
            placeholder="Ex: -46.633308"
            value={value.longitude}
            disabled={disabled || !onChange}
            onChange={(e) => onChange?.({ ...value, longitude: e.target.value })}
            className={inputClass()}
          />
        </div>
      </div>
    </>
  );
  if (embedded) return <div id={id} className="scroll-mt-36 space-y-3">{body}</div>;
  return (
    <div
      id={id}
      className="scroll-mt-36 space-y-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
    >
      {body}
    </div>
  );
}

export type RedeAccordionSection = "local" | "cabos" | "poste" | "caixa" | "outras";

export type GrupoFotoCampo = {
  title: string;
  hint?: string;
  minSlots?: number;
  slots: FotoSlot[];
  obs: string;
  onChange: (slots: FotoSlot[]) => void;
  onObsChange: (obs: string) => void;
  obsAdmin?: string;
  onObsAdminChange?: (obs: string) => void;
  grupoKey: RelatorioFotoGrupoKey;
  /** Bloco expansível onde o card aparece (RE/RC). */
  section?: RedeAccordionSection;
  quantidade?: number | null;
  quantidadeLabel?: string;
  quantidadePlaceholder?: string;
  onQuantidadeChange?: (value: number | null) => void;
  coordenadas?: { latitude: string; longitude: string };
  coordenadasTitle?: string;
  onCoordenadasChange?: (next: { latitude: string; longitude: string }) => void;
  /** Seletor Aéreo / Subterrâneo no card. */
  showAmbienteToggle?: boolean;
  ambiente?: AmbienteRede | null;
  onAmbienteChange?: (ambiente: AmbienteRede) => void;
};

export function AmbienteToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: AmbienteRede | null | undefined;
  onChange?: (ambiente: AmbienteRede) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="grid w-full grid-cols-2 gap-2"
      role="radiogroup"
      aria-label="Ambiente de execução"
    >
      <ChoiceButton
        active={value === "aereo"}
        onClick={() => onChange?.("aereo")}
        disabled={disabled || !onChange}
      >
        Aéreo
      </ChoiceButton>
      <ChoiceButton
        active={value === "subterraneo"}
        onClick={() => onChange?.("subterraneo")}
        disabled={disabled || !onChange}
      >
        Subterrâneo
      </ChoiceButton>
    </div>
  );
}

/** Separação flat entre perguntas dentro do Accordion (sem card aninhado). */
const flatSectionClass =
  "border-b border-gray-100 pb-6 last:border-b-0 last:pb-0";

export function AccordionBloco({
  title,
  children,
  rootRef,
  id,
  stickTabsAtViewportTop = true,
  defaultOpen = false,
  variant = "default",
  pendenciaBloco,
  /** Compensa `zoom` no ancestral (ex.: 0.75 na visão Gestor) para o sticky alinhar ao chrome real. */
  stickyZoomCompensation = 1,
}: {
  title: string;
  children: ReactNode;
  rootRef?: RefObject<HTMLElement | null>;
  id?: string;
  /** true = abas no topo da viewport (técnico); false = abas abaixo do AppHeader. */
  stickTabsAtViewportTop?: boolean;
  /** Aberto por padrão (ex.: auditoria desktop do gestor). */
  defaultOpen?: boolean;
  /** `audit` = tipografia sóbria de dashboard para visão do gestor. */
  variant?: "default" | "audit";
  /** Agrega contagem de pendências filhas no cabeçalho. */
  pendenciaBloco?: PendenciaBlocoId;
  stickyZoomCompensation?: number;
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const measuredOffsetPx = useAbasStickyOffsetPx(stickTabsAtViewportTop);
  const zoomSafe = stickyZoomCompensation > 0 ? stickyZoomCompensation : 1;
  const stickyOffsetPx = Math.round(measuredOffsetPx / zoomSafe);
  const isStuck = useAccordionStuck(sentinelRef, stickyOffsetPx);
  const isAudit = variant === "audit";
  /** Chrome reforçado na visão Gestor (zoom 0.75). */
  const strongChrome = zoomSafe < 1;
  const pendenciasCtx = usePendencias();
  const pendenciaCount = pendenciaBloco
    ? (pendenciasCtx?.countInBloco(pendenciaBloco) ?? 0)
    : 0;
  const hasPendencias = pendenciaCount > 0;

  const summaryClass = cn(
    "sticky z-30 flex w-full max-w-full min-w-0 cursor-pointer list-none items-center justify-between gap-3 transition-all duration-200 ease-in-out [&::-webkit-details-marker]:hidden",
    /* Fundo sempre opaco para o conteúdo não transparecer ao rolar. */
    "bg-white",
    /* Sem -mx-* no sticky: margem negativa estoura a viewport e gera scroll lateral. */
    isAudit
      ? "border-b px-3 text-sm font-bold uppercase tracking-wider"
      : "border-b px-4 font-bold sm:px-5",
    isAudit
      ? isStuck
        ? "py-2 shadow-md"
        : "py-2.5"
      : isStuck
        ? strongChrome
          ? "py-1.5 shadow-md"
          : "py-2 shadow-md"
        : strongChrome
          ? "py-2.5"
          : "py-4",
    !isAudit && (isStuck ? "text-sm" : strongChrome ? "text-sm" : "text-base"),
    hasPendencias
      ? "border-amber-200 border-l-2 border-l-amber-400 bg-amber-50 text-gray-900"
      : strongChrome
        ? "border-gray-200 text-gray-900"
        : isAudit
          ? "border-gray-200 text-gray-800"
          : isStuck
            ? "border-gray-200"
            : "border-gray-100",
  );

  return (
    <details
      id={id}
      ref={rootRef as RefObject<HTMLDetailsElement | null> | undefined}
      defaultOpen={defaultOpen}
      className={
        isAudit
          ? cn(
              "group relative z-0 w-full max-w-full min-w-0 overflow-visible rounded-xl border bg-white shadow-sm open:shadow-md",
              hasPendencias ? "border-amber-200" : strongChrome ? "border-gray-200" : "border-gray-100",
            )
          : cn(
              "group relative z-0 w-full max-w-full min-w-0 overflow-visible rounded-2xl border bg-card shadow-sm open:shadow-md",
              hasPendencias
                ? "border-amber-200"
                : strongChrome
                  ? "border-gray-200"
                  : "border-border",
            )
      }
      style={{ scrollMarginTop: stickyOffsetPx }}
    >
      <summary style={{ top: stickyOffsetPx }} className={summaryClass}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{title}</span>
          {hasPendencias ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-800">
              {pendenciaCount}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 transition group-open:rotate-180",
            hasPendencias ? "text-amber-600/80" : "text-muted-foreground",
          )}
        />
      </summary>
      {/* Sentinela no topo do bloco: ao sair acima da linha sticky, ativa o morph. */}
      <div
        ref={sentinelRef}
        className="pointer-events-none absolute left-0 top-0 h-px w-full"
        aria-hidden
      />
      <div
        className={
          isAudit
            ? "relative z-0 flex w-full max-w-full min-w-0 flex-col gap-4 px-3 pb-4 pt-3 sm:px-4"
            : strongChrome
              ? "relative z-0 flex w-full max-w-full min-w-0 flex-col gap-4 px-3 pb-4 pt-3 sm:px-4"
              : "relative z-0 flex w-full max-w-full min-w-0 flex-col gap-6 px-4 pb-5 pt-4 sm:px-5"
        }
      >
        {children}
      </div>
    </details>
  );
}

function renderGrupoFotoCard(
  grupo: GrupoFotoCampo,
  {
    readOnly,
    onGrupoPhoto,
  }: {
    readOnly: boolean;
    onGrupoPhoto: (
      grupoKey: RelatorioFotoGrupoKey,
      slotId: string,
      file: EvidencePhotoRef | null,
      ambiente?: AmbienteRede | null,
    ) => void;
  },
  opts?: { omitSectionId?: boolean; hideTitle?: boolean },
) {
  return (
    <RelatorioFotosBloco
      key={`${grupo.grupoKey}-${grupo.ambiente ?? "na"}`}
      id={opts?.omitSectionId ? undefined : `secao-${grupo.grupoKey}`}
      title={opts?.hideTitle ? "" : grupo.title}
      hint={grupo.hint}
      variant="flat"
      pendencia={pendenciaFotoGrupo({
        aba: grupo.grupoKey.startsWith("rc")
          ? "RC"
          : grupo.grupoKey.startsWith("eq")
            ? "equipamento"
            : "RE",
        grupoKey: grupo.grupoKey,
        title: grupo.title,
        section: grupo.section,
      })}
      headerExtra={
        grupo.showAmbienteToggle ||
        grupo.onQuantidadeChange ||
        grupo.quantidadeLabel ||
        grupo.coordenadas ? (
          <div className="space-y-3">
            {grupo.showAmbienteToggle ? (
              <AmbienteToggle
                value={grupo.ambiente}
                onChange={grupo.onAmbienteChange}
                disabled={readOnly}
              />
            ) : null}
            {grupo.onQuantidadeChange || grupo.quantidadeLabel ? (
              <CampoQuantidade
                label={grupo.quantidadeLabel}
                placeholder={grupo.quantidadePlaceholder ?? "Ex: 0"}
                value={grupo.quantidade ?? null}
                onChange={grupo.onQuantidadeChange}
                disabled={readOnly}
              />
            ) : null}
            {grupo.coordenadas ? (
              <CampoCoordenadas
                title={grupo.coordenadasTitle ?? "Coordenadas"}
                value={grupo.coordenadas}
                onChange={grupo.onCoordenadasChange}
                disabled={readOnly}
                embedded
              />
            ) : null}
          </div>
        ) : null
      }
      slots={grupo.slots}
      onChange={grupo.onChange}
      obs={grupo.obs}
      onObsChange={grupo.onObsChange}
      minSlots={grupo.minSlots}
      readOnly={readOnly}
      onPickPhoto={(id, file) => onGrupoPhoto(grupo.grupoKey, id, file, grupo.ambiente)}
    />
  );
}

function FotoSlotUnico({
  label,
  slot,
  readOnly,
  onPick,
  onGalleryFiles,
}: {
  label: string;
  slot: FotoSlot;
  readOnly: boolean;
  onPick: (file: EvidencePhotoRef | null) => void;
  onGalleryFiles?: (photos: EvidencePhotoRef[]) => void;
}) {
  const src = slot.file?.previewUrl ?? slot.stored?.url ?? null;
  if (src) {
    return (
      <div className="min-w-0">
        <div className="mb-1">
          <FotoLabel>{label}</FotoLabel>
        </div>
        <RelatorioFotoComControles
          src={src}
          alt={label}
          canEdit={!readOnly}
          onDelete={
            !readOnly
              ? () => {
                  void deleteRelatorioPhoto(slot.stored?.path);
                  onPick(null);
                }
              : undefined
          }
          onReplace={
            !readOnly
              ? (file) => {
                  void deleteRelatorioPhoto(slot.stored?.path);
                  onPick(file);
                }
              : undefined
          }
          onGalleryFiles={!readOnly ? onGalleryFiles : undefined}
        />
      </div>
    );
  }
  if (readOnly) {
    return (
      <div className="min-w-0">
        <FotoLabel>{label}</FotoLabel>
        <p className="text-sm text-muted-foreground">Sem foto</p>
      </div>
    );
  }
  return (
    <PhotoUpload
      label={label}
      value={null}
      onChange={onPick}
      onGalleryFiles={onGalleryFiles}
    />
  );
}

function renderCaixaEmendaUnificadaCard(
  caixa: GrupoFotoCampo,
  plaqueta: GrupoFotoCampo,
  {
    readOnly,
    onGrupoPhoto,
  }: {
    readOnly: boolean;
    onGrupoPhoto: (
      grupoKey: RelatorioFotoGrupoKey,
      slotId: string,
      file: EvidencePhotoRef | null,
      ambiente?: AmbienteRede | null,
    ) => void;
  },
) {
  const slotCaixa = caixa.slots[0] ?? { id: crypto.randomUUID(), file: null, stored: null };
  const slotPlaqueta = plaqueta.slots[0] ?? {
    id: crypto.randomUUID(),
    file: null,
    stored: null,
  };

  const pickFoto = (
    grupo: GrupoFotoCampo,
    slot: FotoSlot,
    file: EvidencePhotoRef | null,
  ) => {
    if (!grupo.slots[0]) {
      grupo.onChange([{ ...slot, file: null, stored: null }]);
    }
    onGrupoPhoto(grupo.grupoKey, slot.id, file, grupo.ambiente);
  };

  const handlePairGallery = (from: "caixa" | "plaqueta", photos: EvidencePhotoRef[]) => {
    if (photos.length === 0) return;
    if (photos.length === 1) {
      if (from === "caixa") pickFoto(caixa, slotCaixa, photos[0]);
      else pickFoto(plaqueta, slotPlaqueta, photos[0]);
      return;
    }
    const order =
      from === "caixa"
        ? ([
            ["caixa", slotCaixa] as const,
            ["plaqueta", slotPlaqueta] as const,
          ] as const)
        : ([
            ["plaqueta", slotPlaqueta] as const,
            ["caixa", slotCaixa] as const,
          ] as const);
    for (let i = 0; i < Math.min(photos.length, order.length); i++) {
      const [which, slot] = order[i];
      pickFoto(which === "caixa" ? caixa : plaqueta, slot, photos[i]);
    }
  };

  const body = (
    <div
      id={`secao-${caixa.grupoKey}`}
      className="relative flex h-full flex-col space-y-4 border-b border-gray-100 pb-6 last:border-b-0 last:pb-0"
    >
      <h2 className="font-semibold text-gray-800">{caixa.title}</h2>
      <div className="space-y-3">
        {caixa.showAmbienteToggle ? (
          <AmbienteToggle
            value={caixa.ambiente}
            onChange={(ambiente) => {
              caixa.onAmbienteChange?.(ambiente);
              plaqueta.onAmbienteChange?.(ambiente);
            }}
            disabled={readOnly}
          />
        ) : null}
        {caixa.onQuantidadeChange || caixa.quantidadeLabel ? (
          <CampoQuantidade
            label={caixa.quantidadeLabel}
            placeholder={caixa.quantidadePlaceholder ?? "Ex: 0"}
            value={caixa.quantidade ?? null}
            onChange={caixa.onQuantidadeChange}
            disabled={readOnly}
          />
        ) : null}
        {caixa.coordenadas ? (
          <CampoCoordenadas
            title={caixa.coordenadasTitle ?? "Coordenadas"}
            value={caixa.coordenadas}
            onChange={caixa.onCoordenadasChange}
            disabled={readOnly}
            embedded
          />
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FotoSlotUnico
          label="Foto da caixa"
          slot={slotCaixa}
          readOnly={readOnly}
          onPick={(file) => pickFoto(caixa, slotCaixa, file)}
          onGalleryFiles={
            readOnly ? undefined : (photos) => handlePairGallery("caixa", photos)
          }
        />
        <FotoSlotUnico
          label="Etiqueta / Plaqueta de Identificação"
          slot={slotPlaqueta}
          readOnly={readOnly}
          onPick={(file) => pickFoto(plaqueta, slotPlaqueta, file)}
          onGalleryFiles={
            readOnly ? undefined : (photos) => handlePairGallery("plaqueta", photos)
          }
        />
      </div>
      <div className="w-full min-w-0">
        <label className="mb-1.5 block text-sm font-semibold">OBS</label>
        <textarea
          value={caixa.obs}
          onChange={(e) => caixa.onObsChange(e.target.value)}
          rows={2}
          disabled={readOnly}
          className={textareaObsClass()}
          placeholder="Observações"
        />
      </div>
    </div>
  );

  return (
    <PendenciaItemFrame
      key={`${caixa.grupoKey}-${caixa.ambiente ?? "na"}`}
      def={pendenciaFotoGrupo({
        aba: caixa.grupoKey.startsWith("rc") ? "RC" : "RE",
        grupoKey: caixa.grupoKey,
        title: caixa.title,
        section: caixa.section,
      })}
    >
      {body}
    </PendenciaItemFrame>
  );
}

export function CampoQuantidade({
  label,
  placeholder,
  value,
  onChange,
  disabled = false,
}: {
  label?: string;
  placeholder: string;
  value: number | null;
  onChange?: (value: number | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="mb-4">
      {label ? (
        <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-800">
          {label}
        </label>
      ) : null}
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={value ?? ""}
        disabled={disabled || !onChange}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange?.(null);
            return;
          }
          // Digitação livre: não bloqueia estados parciais; só aceita dígitos no valor final.
          if (!/^\d*$/.test(raw)) return;
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0) return;
          onChange?.(Math.trunc(n));
        }}
        className={inputClass()}
      />
    </div>
  );
}

export function CordoalhaSimNaoCard({
  title,
  quantidadeLabel,
  quantidadePlaceholder,
  value,
  onChange,
  disabled = false,
  hideQuantidade = false,
  variant = "card",
  id,
  pendencia,
}: {
  title: string;
  quantidadeLabel?: string;
  quantidadePlaceholder?: string;
  value: { isSim: boolean | null; quantidade: number | null };
  onChange?: (next: { isSim: boolean | null; quantidade: number | null }) => void;
  disabled?: boolean;
  /** Só SIM/NÃO — sem campo numérico (ex.: Cordoalha existente). */
  hideQuantidade?: boolean;
  /** Use `flat` dentro dos acordeões RE/RC. */
  variant?: "card" | "flat";
  id?: string;
  pendencia?: PendenciaItemDef;
}) {
  const sim = value.isSim === true;
  const isFlat = variant === "flat";
  const body = (
    <div
      id={pendencia ? undefined : id}
      className={
        isFlat
          ? `scroll-mt-36 space-y-3 ${flatSectionClass}`
          : "scroll-mt-36 space-y-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
      }
    >
      <h2
        className={
          isFlat ? "mb-3 font-semibold text-gray-800" : "text-xs font-bold uppercase tracking-wider text-gray-500"
        }
      >
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceButton
          active={value.isSim === true}
          onClick={() =>
            onChange?.(
              hideQuantidade
                ? { isSim: true, quantidade: null }
                : { ...value, isSim: true },
            )
          }
          disabled={disabled || !onChange}
        >
          SIM
        </ChoiceButton>
        <ChoiceButton
          active={value.isSim === false}
          onClick={() => onChange?.({ isSim: false, quantidade: null })}
          disabled={disabled || !onChange}
        >
          NÃO
        </ChoiceButton>
      </div>
      {!hideQuantidade && sim && quantidadeLabel ? (
        <CampoQuantidade
          label={quantidadeLabel}
          placeholder={quantidadePlaceholder ?? "Ex: 0"}
          value={value.quantidade}
          onChange={(quantidade) => onChange?.({ ...value, isSim: true, quantidade })}
          disabled={disabled || !onChange}
        />
      ) : null}
    </div>
  );
  if (!pendencia) return body;
  return <PendenciaItemFrame def={pendencia}>{body}</PendenciaItemFrame>;
}

export function RelatorioRedeAcesso({
  readOnly,
  header,
  redeVariant = "RE",
  lancamentoTitle = "Lançamento cabos (RE)?",
  lancamentoRe,
  onLancamentoRe,
  lancamentoAmbiente,
  onLancamentoAmbienteChange,
  fiberloopInstalado,
  onFiberloopInstaladoChange,
  cordoalhaLancada,
  onCordoalhaLancadaChange,
  cordoalhaExistente,
  onCordoalhaExistenteChange,
  postesNovaCordoalha,
  onPostesNovaCordoalhaChange,
  postesCordoalhaExistente,
  onPostesCordoalhaExistenteChange,
  qtdTotalPostes,
  onQtdTotalPostesChange,
  aterramentoPontos,
  onAterramentoPontosChange,
  aterramentoHastes,
  onAterramentoHastesChange,
  construcaoCaixaSubterranea,
  onConstrucaoCaixaSubterraneaChange,
  sobraTecnicaExecutada,
  onSobraTecnicaExecutadaChange,
  construcaoDutoSubterraneo,
  onConstrucaoDutoSubterraneoChange,
  caixaEmendaExistente,
  onCaixaEmendaExistenteChange,
  cabos,
  onPatchCabo,
  onAddCabo,
  onRemoveCabo,
  onCaboPhoto,
  onCaboGalleryFiles,
  grupos,
  onGrupoPhoto,
  outras,
  onOutrasChange,
  onOutraPhoto,
  showObsAdmin = false,
  stickTabsAtViewportTop = true,
}: {
  readOnly: boolean;
  header?: ReactNode;
  /** Sufixo dos blocos expansíveis: LANÇAMENTO (RE), POSTE (RC), etc. */
  redeVariant?: "RE" | "RC";
  lancamentoTitle?: string;
  lancamentoRe: "sim" | "nao" | "";
  onLancamentoRe: (value: "sim" | "nao") => void;
  lancamentoAmbiente?: AmbienteRede | null;
  onLancamentoAmbienteChange?: (ambiente: AmbienteRede) => void;
  fiberloopInstalado?: { isSim: boolean | null; quantidade: number | null };
  onFiberloopInstaladoChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  cordoalhaLancada?: { isSim: boolean | null; quantidade: number | null };
  onCordoalhaLancadaChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  cordoalhaExistente?: { isSim: boolean | null; quantidade: number | null };
  onCordoalhaExistenteChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  postesNovaCordoalha?: { isSim: boolean | null; quantidade: number | null };
  onPostesNovaCordoalhaChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  postesCordoalhaExistente?: { isSim: boolean | null; quantidade: number | null };
  onPostesCordoalhaExistenteChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  /** Total de poste (RE/RC) — input explícito abaixo do Poste de conexão. */
  qtdTotalPostes?: number | null;
  onQtdTotalPostesChange?: (value: number | null) => void;
  /** Quant. de pontos de Aterramento (input explícito). */
  aterramentoPontos?: number | null;
  onAterramentoPontosChange?: (value: number | null) => void;
  /** ATERRAMENTO -> TOTAL DE HASTES (5/8). */
  aterramentoHastes?: number | null;
  onAterramentoHastesChange?: (value: number | null) => void;
  /** Construído caixa subterrânea? (SIM/NÃO + quantidade). */
  construcaoCaixaSubterranea?: { isSim: boolean | null; quantidade: number | null };
  onConstrucaoCaixaSubterraneaChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  /** Sobra técnica? (SIM/NÃO) — controla exibição do bloco de fotos. */
  sobraTecnicaExecutada?: { isSim: boolean | null; quantidade: number | null };
  onSobraTecnicaExecutadaChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  /** Const. de duto subterrâneo? (SIM/NÃO) — controla metragem + fotos. */
  construcaoDutoSubterraneo?: { isSim: boolean | null; quantidade: number | null };
  onConstrucaoDutoSubterraneoChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  /** Caixa de emenda existente na rota? */
  caixaEmendaExistente?: { isSim: boolean | null; quantidade: number | null };
  onCaixaEmendaExistenteChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  cabos: CaboMetragemPayload[];
  onPatchCabo: (id: string, patch: Partial<CaboMetragemPayload>) => void;
  onAddCabo: () => void;
  onRemoveCabo?: (id: string) => void;
  onCaboPhoto: (
    caboId: string,
    campo: "fotoInicio" | "fotoFim",
    file: EvidencePhotoRef | null,
  ) => void;
  /**
   * Galeria múltipla na metragem: preenche slots vazios e cria novos cabos (2 fotos/cabo).
   */
  onCaboGalleryFiles?: (
    fromCaboId: string,
    fromCampo: "fotoInicio" | "fotoFim",
    photos: EvidencePhotoRef[],
  ) => void;
  grupos: GrupoFotoCampo[];
  onGrupoPhoto: (
    grupoKey: RelatorioFotoGrupoKey,
    slotId: string,
    file: EvidencePhotoRef | null,
    ambiente?: AmbienteRede | null,
  ) => void;
  outras: OutraFotoState[];
  onOutrasChange: (updater: (prev: OutraFotoState[]) => OutraFotoState[]) => void;
  onOutraPhoto: (itemId: string, file: EvidencePhotoRef | null) => void;
  showObsAdmin?: boolean;
  /** true = abas no topo da viewport (técnico); false = abas abaixo do AppHeader. */
  stickTabsAtViewportTop?: boolean;
}) {
  void showObsAdmin;
  const mostrarMetragem = lancamentoRe === "sim";
  const mostrarCordoalha = Boolean(cordoalhaLancada && cordoalhaExistente);
  const mostrarPostes = Boolean(postesNovaCordoalha && postesCordoalhaExistente);
  const gruposLocal = grupos.filter((g) => g.section === "local");
  const gruposCabos = grupos.filter((g) => g.section === "cabos");
  const isSobraKey = (k: RelatorioFotoGrupoKey) =>
    k === "sobraTecnica" || k === "rcSobraTecnica";
  const isDutoKey = (k: RelatorioFotoGrupoKey) =>
    k === "dutoSubterraneo" || k === "rcDutoSubterraneo";
  const isCaixaKey = (k: RelatorioFotoGrupoKey) =>
    k === "caixaEmenda" || k === "rcCaixaEmenda";
  const isPlaquetaKey = (k: RelatorioFotoGrupoKey) =>
    k === "plaquetaIdentificacao" || k === "rcPlaquetaIdentificacao";
  const gruposSobra = gruposCabos.filter((g) => isSobraKey(g.grupoKey));
  const gruposDuto = gruposCabos.filter((g) => isDutoKey(g.grupoKey));
  const gruposCabosPrincipais = gruposCabos.filter(
    (g) => !isSobraKey(g.grupoKey) && !isDutoKey(g.grupoKey),
  );
  const gruposPoste = grupos.filter((g) => g.section === "poste");
  const gruposCaixaAll = grupos.filter((g) => g.section === "caixa");
  const grupoCaixa = gruposCaixaAll.find((g) => isCaixaKey(g.grupoKey));
  const grupoPlaqueta = gruposCaixaAll.find((g) => isPlaquetaKey(g.grupoKey));
  const gruposCaixaOutros = gruposCaixaAll.filter(
    (g) => !isCaixaKey(g.grupoKey) && !isPlaquetaKey(g.grupoKey),
  );
  const fotoCtx = { readOnly, onGrupoPhoto };
  const mostrarLocal = redeVariant === "RC";

  const sobraTemConteudo = gruposSobra.some(
    (g) =>
      g.slots.some((s) => Boolean(s.file || s.stored)) || Boolean(g.obs?.trim()),
  );
  const dutoTemConteudo = gruposDuto.some(
    (g) =>
      g.slots.some((s) => Boolean(s.file || s.stored)) ||
      Boolean(g.obs?.trim()) ||
      (g.quantidade ?? 0) > 0,
  );
  const gateSobra = gateSimComLegado(sobraTecnicaExecutada, sobraTemConteudo);
  const gateDuto = gateSimComLegado(construcaoDutoSubterraneo, dutoTemConteudo);
  const mostrarSobra = gateSobra.isSim === true;
  const mostrarDuto = gateDuto.isSim === true;

  return (
    <EvidencePhotoPasteProvider>
      <div className="space-y-5">
        {mostrarLocal ? (
          <AccordionBloco
            title="LOCAL (RC)"
            id="secao-local"
            stickTabsAtViewportTop={stickTabsAtViewportTop}
            pendenciaBloco="RC.local"
          >
            {header ? <div className={flatSectionClass}>{header}</div> : null}
            {gruposLocal.map((grupo) => renderGrupoFotoCard(grupo, fotoCtx))}
          </AccordionBloco>
        ) : (
          header
        )}

        <AccordionBloco
          title={`LANÇAMENTO (${redeVariant})`}
          id="secao-cabos"
          stickTabsAtViewportTop={stickTabsAtViewportTop}
          pendenciaBloco={redeVariant === "RC" ? "RC.lancamento" : "RE.lancamento"}
        >
          <div className={flatSectionClass}>
            <h2 className="mb-3 font-semibold text-gray-800">{lancamentoTitle}</h2>
            <div className="flex w-full flex-col gap-3">
              {onLancamentoAmbienteChange ? (
                <AmbienteToggle
                  value={lancamentoAmbiente}
                  onChange={onLancamentoAmbienteChange}
                  disabled={readOnly}
                />
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <ChoiceButton
                  active={lancamentoRe === "sim"}
                  onClick={() => onLancamentoRe("sim")}
                  disabled={readOnly}
                >
                  SIM
                </ChoiceButton>
                <ChoiceButton
                  active={lancamentoRe === "nao"}
                  onClick={() => onLancamentoRe("nao")}
                  disabled={readOnly}
                >
                  NÃO
                </ChoiceButton>
              </div>
            </div>
          </div>

          {mostrarMetragem ? (
            <div className={flatSectionClass}>
              <h2 className="mb-3 font-semibold text-gray-800">Metragem de cabo</h2>
              <div className="flex flex-col gap-4">
                {cabos.map((cabo, index) => {
                  const pendDef = pendenciaMetragemCabo({
                    aba: redeVariant,
                    caboId: cabo.id,
                    index,
                  });
                  return (
                  <PendenciaItemFrame key={cabo.id} def={pendDef}>
                  <div
                    className="relative flex flex-col space-y-3 border-b border-gray-100 py-2 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-800">Cabo {index + 1}</p>
                      {!readOnly && index >= 1 && onRemoveCabo ? (
                        <button
                          type="button"
                          onClick={() => onRemoveCabo(cabo.id)}
                          className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                          aria-label={`Excluir cabo ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold">
                        Tipo do FO (apenas número)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={3}
                        value={cabo.tipoCabo}
                        onChange={(e) =>
                          onPatchCabo(cabo.id, { tipoCabo: apenasDigitos(e.target.value, 3) })
                        }
                        placeholder="Ex: 12 FO"
                        disabled={readOnly}
                        className={inputClass()}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold">
                          Marcação Inicial (m)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={cabo.marcacaoInicial}
                          onChange={(e) => {
                            const marcacaoInicial = e.target.value;
                            onPatchCabo(cabo.id, {
                              marcacaoInicial,
                              metragem: calcularMetragemCaboTotal(
                                marcacaoInicial,
                                cabo.marcacaoFinal,
                              ),
                            });
                          }}
                          onBlur={(e) => {
                            const marcacaoInicial = finalizeMedicaoInput(e.target.value);
                            if (marcacaoInicial === cabo.marcacaoInicial) return;
                            onPatchCabo(cabo.id, {
                              marcacaoInicial,
                              metragem: calcularMetragemCaboTotal(
                                marcacaoInicial,
                                cabo.marcacaoFinal,
                              ),
                            });
                          }}
                          disabled={readOnly}
                          className={inputClass()}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold">
                          Marcação Final (m)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={cabo.marcacaoFinal}
                          onChange={(e) => {
                            const marcacaoFinal = e.target.value;
                            onPatchCabo(cabo.id, {
                              marcacaoFinal,
                              metragem: calcularMetragemCaboTotal(
                                cabo.marcacaoInicial,
                                marcacaoFinal,
                              ),
                            });
                          }}
                          onBlur={(e) => {
                            const marcacaoFinal = finalizeMedicaoInput(e.target.value);
                            if (marcacaoFinal === cabo.marcacaoFinal) return;
                            onPatchCabo(cabo.id, {
                              marcacaoFinal,
                              metragem: calcularMetragemCaboTotal(
                                cabo.marcacaoInicial,
                                marcacaoFinal,
                              ),
                            });
                          }}
                          disabled={readOnly}
                          className={inputClass()}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold">
                        Metragem Total (m)
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={
                          cabo.metragem ||
                          calcularMetragemCaboTotal(cabo.marcacaoInicial, cabo.marcacaoFinal)
                        }
                        className={`${inputClass()} cursor-default bg-gray-100`}
                        tabIndex={-1}
                      />
                    </div>
                    <div className="flex flex-col flex-wrap items-start gap-4 sm:flex-row">
                      <div className="flex w-full max-w-[360px] shrink-0 flex-col gap-1">
                        <FotoLabel>Foto Inicial</FotoLabel>
                        {cabo.fotoInicio ? (
                          <RelatorioFotoComControles
                            src={cabo.fotoInicio.url}
                            alt="Foto Inicial"
                            canEdit={!readOnly}
                            onDelete={() => {
                              void deleteRelatorioPhoto(cabo.fotoInicio?.path);
                              onCaboPhoto(cabo.id, "fotoInicio", null);
                            }}
                            onReplace={(file) => {
                              void deleteRelatorioPhoto(cabo.fotoInicio?.path);
                              onCaboPhoto(cabo.id, "fotoInicio", file);
                            }}
                            onGalleryFiles={
                              !readOnly && onCaboGalleryFiles
                                ? (photos) =>
                                    onCaboGalleryFiles(cabo.id, "fotoInicio", photos)
                                : undefined
                            }
                          />
                        ) : readOnly ? (
                          <p className="text-sm text-muted-foreground">Sem foto inicial.</p>
                        ) : (
                          <PhotoUpload
                            label="Foto Inicial"
                            suffix="inicio"
                            hideLabel
                            compact
                            hideHelperText
                            value={null}
                            onChange={(file) => {
                              if (file) onCaboPhoto(cabo.id, "fotoInicio", file);
                            }}
                            onGalleryFiles={(photos) => {
                              if (onCaboGalleryFiles) {
                                onCaboGalleryFiles(cabo.id, "fotoInicio", photos);
                                return;
                              }
                              if (photos[0]) onCaboPhoto(cabo.id, "fotoInicio", photos[0]);
                              if (photos[1] && !cabo.fotoFim) {
                                onCaboPhoto(cabo.id, "fotoFim", photos[1]);
                              }
                            }}
                          />
                        )}
                      </div>
                      <div className="flex w-full max-w-[360px] shrink-0 flex-col gap-1">
                        <FotoLabel>Foto Final</FotoLabel>
                        {cabo.fotoFim ? (
                          <RelatorioFotoComControles
                            src={cabo.fotoFim.url}
                            alt="Foto Final"
                            canEdit={!readOnly}
                            onDelete={() => {
                              void deleteRelatorioPhoto(cabo.fotoFim?.path);
                              onCaboPhoto(cabo.id, "fotoFim", null);
                            }}
                            onReplace={(file) => {
                              void deleteRelatorioPhoto(cabo.fotoFim?.path);
                              onCaboPhoto(cabo.id, "fotoFim", file);
                            }}
                            onGalleryFiles={
                              !readOnly && onCaboGalleryFiles
                                ? (photos) => onCaboGalleryFiles(cabo.id, "fotoFim", photos)
                                : undefined
                            }
                          />
                        ) : readOnly ? (
                          <p className="text-sm text-muted-foreground">Sem foto final.</p>
                        ) : (
                          <PhotoUpload
                            label="Foto Final"
                            suffix="fim"
                            hideLabel
                            compact
                            hideHelperText
                            value={null}
                            onChange={(file) => {
                              if (file) onCaboPhoto(cabo.id, "fotoFim", file);
                            }}
                            onGalleryFiles={(photos) => {
                              if (onCaboGalleryFiles) {
                                onCaboGalleryFiles(cabo.id, "fotoFim", photos);
                                return;
                              }
                              if (photos[0]) onCaboPhoto(cabo.id, "fotoFim", photos[0]);
                            }}
                          />
                        )}
                      </div>
                    </div>
                    <div className="mt-auto w-full min-w-0">
                      <label className="mb-1.5 block text-sm font-semibold">OBS</label>
                      <textarea
                        value={cabo.obs}
                        onChange={(e) => onPatchCabo(cabo.id, { obs: e.target.value })}
                        rows={2}
                        disabled={readOnly}
                        className={textareaObsClass()}
                      />
                    </div>
                  </div>
                  </PendenciaItemFrame>
                  );
                })}
                {readOnly ? null : (
                  <button
                    type="button"
                    onClick={onAddCabo}
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
                  >
                    <Plus className="h-4 w-4" /> Adicionar mais cabo
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {gruposCabosPrincipais.map((grupo) => renderGrupoFotoCard(grupo, fotoCtx))}

          {onSobraTecnicaExecutadaChange ? (
            <div
              id={redeVariant === "RC" ? "secao-rcSobraTecnica" : "secao-sobraTecnica"}
              className="scroll-mt-36 space-y-4"
            >
              <CordoalhaSimNaoCard
                title="Sobra técnica?"
                hideQuantidade
                value={gateSobra}
                onChange={onSobraTecnicaExecutadaChange}
                disabled={readOnly}
                variant="flat"
                pendencia={pendenciaPergunta({
                  aba: redeVariant,
                  secao: `Lançamento (${redeVariant})`,
                  subbloco: "Sobra técnica?",
                  key: "lancamento.sobraTecnica",
                })}
              />
              {mostrarSobra
                ? gruposSobra.map((grupo) =>
                    renderGrupoFotoCard(grupo, fotoCtx, {
                      omitSectionId: true,
                      hideTitle: true,
                    }),
                  )
                : null}
            </div>
          ) : mostrarSobra ? (
            gruposSobra.map((grupo) => renderGrupoFotoCard(grupo, fotoCtx))
          ) : null}

          {fiberloopInstalado &&
          onFiberloopInstaladoChange &&
          lancamentoAmbiente !== "subterraneo" ? (
            <CordoalhaSimNaoCard
              id="secao-fiberloopInstalado"
              title="Fiberloop instalado?"
              quantidadeLabel="Quantidade de Fiberloop instalado"
              quantidadePlaceholder="Ex: 2"
              value={fiberloopInstalado}
              onChange={onFiberloopInstaladoChange}
              disabled={readOnly}
              variant="flat"
              pendencia={pendenciaPergunta({
                aba: redeVariant,
                secao: `Lançamento (${redeVariant})`,
                subbloco: "Fiberloop instalado?",
                key: "lancamento.fiberloop",
              })}
            />
          ) : null}

          {onConstrucaoDutoSubterraneoChange ? (
            <div
              id={
                redeVariant === "RC" ? "secao-rcDutoSubterraneo" : "secao-dutoSubterraneo"
              }
              className="scroll-mt-36 space-y-4"
            >
              <CordoalhaSimNaoCard
                title="Const. de duto subterrâneo (MD ou MND)?"
                hideQuantidade
                value={gateDuto}
                onChange={onConstrucaoDutoSubterraneoChange}
                disabled={readOnly}
                variant="flat"
                pendencia={pendenciaPergunta({
                  aba: redeVariant,
                  secao: `Lançamento (${redeVariant})`,
                  subbloco: "Const. de duto subterrâneo?",
                  key: "lancamento.construcaoDuto",
                })}
              />
              {mostrarDuto
                ? gruposDuto.map((grupo) =>
                    renderGrupoFotoCard(grupo, fotoCtx, {
                      omitSectionId: true,
                      hideTitle: true,
                    }),
                  )
                : null}
            </div>
          ) : mostrarDuto ? (
            gruposDuto.map((grupo) => renderGrupoFotoCard(grupo, fotoCtx))
          ) : null}
          {onConstrucaoCaixaSubterraneaChange ? (
            <CordoalhaSimNaoCard
              title="Construído caixa subterrânea?"
              quantidadeLabel="Quantidade de Caixas Subterrâneas"
              quantidadePlaceholder="Ex: 1"
              value={construcaoCaixaSubterranea ?? { isSim: null, quantidade: null }}
              onChange={onConstrucaoCaixaSubterraneaChange}
              disabled={readOnly}
              variant="flat"
              pendencia={pendenciaPergunta({
                aba: redeVariant,
                secao: `Lançamento (${redeVariant})`,
                subbloco: "Construído caixa subterrânea?",
                key: "lancamento.construcaoCaixaSubterranea",
              })}
            />
          ) : null}
        </AccordionBloco>

        <AccordionBloco
          title={`POSTE (${redeVariant})`}
          id="secao-poste"
          stickTabsAtViewportTop={stickTabsAtViewportTop}
          pendenciaBloco={redeVariant === "RC" ? "RC.poste" : "RE.poste"}
        >
          {gruposPoste.map((grupo) => {
            const isPoste =
              grupo.grupoKey === "posteConexao" || grupo.grupoKey === "rcPosteConexao";
            const isAterramento =
              grupo.grupoKey === "novoAterramentoPoste" ||
              grupo.grupoKey === "rcNovoAterramentoPoste";
            return (
              <div key={grupo.grupoKey} className="contents">
                {renderGrupoFotoCard(grupo, fotoCtx)}
                {isPoste ? (
                  <div className="border-b border-gray-100 pb-4">
                    <CampoQuantidade
                      label={`Total de poste (${redeVariant})`}
                      placeholder="Ex: 12"
                      value={qtdTotalPostes ?? null}
                      onChange={onQtdTotalPostesChange}
                      disabled={readOnly}
                    />
                  </div>
                ) : null}
                {isPoste && mostrarCordoalha ? (
                  <>
                    <CordoalhaSimNaoCard
                      title="Lançado cordoalha?"
                      quantidadeLabel="Quantidade de cordoalha lançada:"
                      quantidadePlaceholder="Ex: 50"
                      value={cordoalhaLancada!}
                      onChange={onCordoalhaLancadaChange}
                      disabled={readOnly}
                      variant="flat"
                      pendencia={pendenciaPergunta({
                        aba: redeVariant,
                        secao: `Poste (${redeVariant})`,
                        subbloco: "Lançado cordoalha?",
                        key: "poste.cordoalhaLancada",
                      })}
                    />
                    <CordoalhaSimNaoCard
                      title="Cordoalha existente?"
                      hideQuantidade
                      value={cordoalhaExistente!}
                      onChange={onCordoalhaExistenteChange}
                      disabled={readOnly}
                      variant="flat"
                      pendencia={pendenciaPergunta({
                        aba: redeVariant,
                        secao: `Poste (${redeVariant})`,
                        subbloco: "Cordoalha existente?",
                        key: "poste.cordoalhaExistente",
                      })}
                    />
                  </>
                ) : null}
                {isPoste && mostrarPostes ? (
                  <>
                    <CordoalhaSimNaoCard
                      title="Postes novo com nova cordoalha?"
                      quantidadeLabel="Quantidade de Poste com nova cordoalha:"
                      quantidadePlaceholder="Ex: 10"
                      value={postesNovaCordoalha!}
                      onChange={onPostesNovaCordoalhaChange}
                      disabled={readOnly}
                      variant="flat"
                      pendencia={pendenciaPergunta({
                        aba: redeVariant,
                        secao: `Poste (${redeVariant})`,
                        subbloco: "Postes novo com nova cordoalha?",
                        key: "poste.postesNovaCordoalha",
                      })}
                    />
                    <CordoalhaSimNaoCard
                      title="Postes com cordoalha Existente?"
                      hideQuantidade
                      value={postesCordoalhaExistente!}
                      onChange={onPostesCordoalhaExistenteChange}
                      disabled={readOnly}
                      variant="flat"
                      pendencia={pendenciaPergunta({
                        aba: redeVariant,
                        secao: `Poste (${redeVariant})`,
                        subbloco: "Postes com cordoalha Existente?",
                        key: "poste.postesCordoalhaExistente",
                      })}
                    />
                  </>
                ) : null}
                {isAterramento ? (
                  <div className="space-y-1 border-b border-gray-100 pb-4">
                    <CampoQuantidade
                      label="Quant. de pontos de Aterramento"
                      placeholder="Ex: 2"
                      value={aterramentoPontos ?? null}
                      onChange={onAterramentoPontosChange}
                      disabled={readOnly}
                    />
                    <CampoQuantidade
                      label="ATERRAMENTO -> TOTAL DE HASTES (5/8)"
                      placeholder="Ex: 4"
                      value={aterramentoHastes ?? null}
                      onChange={onAterramentoHastesChange}
                      disabled={readOnly}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </AccordionBloco>

        <AccordionBloco
          title={`CAIXA DE EMENDA (${redeVariant})`}
          id="secao-caixa-emenda"
          stickTabsAtViewportTop={stickTabsAtViewportTop}
          pendenciaBloco={redeVariant === "RC" ? "RC.caixa" : "RE.caixa"}
        >
          {caixaEmendaExistente != null && onCaixaEmendaExistenteChange ? (
            <CordoalhaSimNaoCard
              title="Caixa de emenda existente?"
              hideQuantidade
              value={caixaEmendaExistente}
              onChange={onCaixaEmendaExistenteChange}
              disabled={readOnly}
              variant="flat"
              pendencia={pendenciaPergunta({
                aba: redeVariant,
                secao: `Caixa de emenda (${redeVariant})`,
                subbloco: "Caixa de emenda existente?",
                key: "caixa.caixaEmendaExistente",
              })}
            />
          ) : null}
          {grupoCaixa && grupoPlaqueta
            ? renderCaixaEmendaUnificadaCard(grupoCaixa, grupoPlaqueta, fotoCtx)
            : null}
          {gruposCaixaOutros.map((grupo) => renderGrupoFotoCard(grupo, fotoCtx))}
          {!grupoPlaqueta && grupoCaixa
            ? renderGrupoFotoCard(grupoCaixa, fotoCtx)
            : null}
          {grupoPlaqueta && !grupoCaixa
            ? renderGrupoFotoCard(grupoPlaqueta, fotoCtx)
            : null}
        </AccordionBloco>

        <AccordionBloco
          title={`OUTRAS FOTOS (${redeVariant})`}
          id="secao-outras-fotos"
          stickTabsAtViewportTop={stickTabsAtViewportTop}
          pendenciaBloco={redeVariant === "RC" ? "RC.outras" : "RE.outras"}
        >
          <RelatorioOutrasFotos
            title="Outras fotos"
            outras={outras}
            onOutrasChange={onOutrasChange}
            onOutraPhoto={onOutraPhoto}
            readOnly={readOnly}
            variant="flat"
          />
        </AccordionBloco>
      </div>
    </EvidencePhotoPasteProvider>
  );
}

export function RelatorioOutrasFotos({
  title = "Outras fotos",
  outras,
  onOutrasChange,
  onOutraPhoto,
  readOnly,
  showObsAdmin = false,
  variant = "card",
}: {
  title?: string;
  outras: OutraFotoState[];
  onOutrasChange: (updater: (prev: OutraFotoState[]) => OutraFotoState[]) => void;
  onOutraPhoto: (itemId: string, file: EvidencePhotoRef | null) => void;
  readOnly: boolean;
  showObsAdmin?: boolean;
  variant?: "card" | "flat";
}) {
  const removerItem = (id: string, path?: string) => {
    void deleteRelatorioPhoto(path);
    onOutrasChange((prev) => prev.filter((row) => row.id !== id));
  };

  const isFlat = variant === "flat";

  return (
    <div className={isFlat ? "flex flex-col gap-4" : "space-y-4"}>
      <h2
        className={
          isFlat ? "mb-3 font-semibold text-gray-800" : "text-base font-bold"
        }
      >
        {title}
      </h2>
      {outras.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum bloco adicional.</p>
      ) : (
        <div
          className={
            isFlat
              ? "flex flex-col gap-4"
              : "grid grid-cols-1 items-stretch gap-4 md:grid-cols-2"
          }
        >
          {outras.map((item, index) => (
            <div
              key={item.id}
              className={
                isFlat
                  ? "relative flex flex-col space-y-3 border-b border-gray-100 pb-4 last:border-b-0 last:pb-0"
                  : "relative flex h-full flex-col space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
              }
            >
              <div className="flex items-start justify-between gap-2">
                <RefTituloInput
                  value={item.ref}
                  disabled={readOnly}
                  onChange={(ref) =>
                    onOutrasChange((prev) =>
                      prev.map((row) => (row.id === item.id ? { ...row, ref } : row)),
                    )
                  }
                />
                {readOnly ? null : (
                  <button
                    type="button"
                    onClick={() => removerItem(item.id, item.stored?.path)}
                    className="mt-6 shrink-0 rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                    aria-label={`Excluir foto extra ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex-1">
                <FotoLabel>Foto</FotoLabel>
                {item.stored ? (
                  <RelatorioFotoComControles
                    src={item.stored.url}
                    alt={item.ref || "Outra foto"}
                    canEdit={!readOnly}
                    onDelete={() => {
                      void deleteRelatorioPhoto(item.stored?.path);
                      onOutraPhoto(item.id, null);
                    }}
                    onReplace={(file) => {
                      void deleteRelatorioPhoto(item.stored?.path);
                      onOutraPhoto(item.id, file);
                    }}
                  />
                ) : readOnly ? (
                  <p className="text-sm text-muted-foreground">Sem foto.</p>
                ) : (
                  <PhotoUpload
                    label="Foto"
                    suffix={index === 0 ? "inicio" : "fim"}
                    hideLabel
                    compact
                    value={null}
                    onChange={(file) => {
                      if (file) onOutraPhoto(item.id, file);
                    }}
                  />
                )}
              </div>
              <div className="mt-auto w-full min-w-0">
                <label className="mb-1.5 block text-sm font-semibold">OBS</label>
                <textarea
                  value={item.obs}
                  onChange={(e) =>
                    onOutrasChange((prev) =>
                      prev.map((row) => (row.id === item.id ? { ...row, obs: e.target.value } : row)),
                    )
                  }
                  rows={2}
                  disabled={readOnly}
                  className={textareaObsClass()}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {readOnly ? null : (
        <button
          type="button"
          onClick={() =>
            onOutrasChange((prev) => [
              ...prev,
              { id: crypto.randomUUID(), ref: "", file: null, stored: null, obs: "", obsAdmin: "" },
            ])
          }
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" /> Adicionar mais fotos
        </button>
      )}
    </div>
  );
}
