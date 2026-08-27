import {
  buildResumoCaderno,
  formatResumoNumero,
  type ResumoCadernoLinha,
} from "@/lib/resumo-caderno";
import {
  calcularMetragemCaboTotal,
  filtrarCabosComConteudo,
  type CaboMetragemPayload,
  type LancamentoPorAmbientePayload,
  type RelatorioPayload,
  type RelatorioTransmissao,
} from "@/lib/relatorios-transmissao";

export type PdfResumoCaboResumo = {
  modelo: string;
  marcacaoInicial: string;
  marcacaoFinal: string;
  totalMetros: string;
  qtdCabos: string;
};

export type PdfResumoExecutivo = {
  cliente: string;
  endereco: string;
  cidade: string;
  tecnologiaAcesso: string;
  instalacaoEquipCliente: string;
  instalacaoEquipEstacao: string;
  quantidadeFibrasFo: string;
  identificacaoEstacao: string;
  /** Linhas derivadas da aba Medições (`buildResumoCaderno`). */
  linhas: ResumoCadernoLinha[];
  caboAereoRe: PdfResumoCaboResumo;
  caboAereoRc: PdfResumoCaboResumo;
  caboSubRe: PdfResumoCaboResumo;
  caboSubRc: PdfResumoCaboResumo;
};

const BLOCO_TITULO: Record<ResumoCadernoLinha["bloco"], string> = {
  aereo: "Lançamento Aéreo / Infraestrutura Aérea",
  aterramento: "Aterramento Construído",
  subterraneo: "Lançamento Subterrâneo / Infraestrutura Subterrânea",
  acessos: "Informações Adicionais / Acessos e Equipamentos",
};

export function tituloBlocoResumo(bloco: ResumoCadernoLinha["bloco"]): string {
  return BLOCO_TITULO[bloco];
}

function dash(v: string | null | undefined): string {
  const t = String(v ?? "").trim();
  return t || "—";
}

function simNaoLabel(v: boolean | null | undefined): string {
  if (v === true) return "SIM";
  if (v === false) return "NÃO";
  return "—";
}

function metragemDeCabo(cabo: CaboMetragemPayload): number {
  const direto = Number.parseFloat(String(cabo.metragem ?? "").replace(",", "."));
  if (Number.isFinite(direto)) return Math.abs(direto);
  const calc = Number.parseFloat(
    calcularMetragemCaboTotal(cabo.marcacaoInicial ?? "", cabo.marcacaoFinal ?? "").replace(
      ",",
      ".",
    ),
  );
  return Number.isFinite(calc) ? Math.abs(calc) : 0;
}

function resumoCabosAmbiente(
  lancamento: LancamentoPorAmbientePayload | null | undefined,
  ambiente: "aereo" | "subterraneo",
): PdfResumoCaboResumo {
  const cabosBrutos = lancamento?.[ambiente]?.metragens ?? [];
  const cabos = filtrarCabosComConteudo(cabosBrutos);
  if (!cabos.length || lancamento?.[ambiente]?.isSim !== true) {
    return {
      modelo: "—",
      marcacaoInicial: "—",
      marcacaoFinal: "—",
      totalMetros: "—",
      qtdCabos: "0",
    };
  }
  const modelos = [
    ...new Set(
      cabos
        .map((c) => String(c.tipoCabo ?? "").trim())
        .filter(Boolean)
        .map((t) => `${t} FO`),
    ),
  ];
  const total = cabos.reduce((acc, c) => acc + metragemDeCabo(c), 0);
  const ini = cabos.map((c) => c.marcacaoInicial?.trim()).filter(Boolean);
  const fim = cabos.map((c) => c.marcacaoFinal?.trim()).filter(Boolean);
  return {
    modelo: modelos.length ? modelos.join(", ") : "—",
    marcacaoInicial: ini.length ? ini.join(" / ") : "—",
    marcacaoFinal: fim.length ? fim.join(" / ") : "—",
    totalMetros: Number.isInteger(total)
      ? String(total)
      : total.toLocaleString("pt-BR", { maximumFractionDigits: 2 }),
    qtdCabos: String(cabos.length),
  };
}

function temEquipamentoCliente(p: RelatorioPayload | undefined): boolean | null {
  if (!p) return null;
  const eqs = p.eqClienteEquipamentos ?? [];
  const ros = p.eqClienteDgo ?? [];
  const hasEq = eqs.some(
    (e) =>
      e.foto ||
      e.etiqueta ||
      e.tipoEquipamento?.trim() ||
      e.modelo?.trim() ||
      e.identificacao?.trim(),
  );
  const hasRos = ros.some(
    (e) => e.foto || e.etiqueta || e.tipoEquipamento?.trim() || e.modelo?.trim(),
  );
  if (hasEq || hasRos) return true;
  if (eqs.length === 0 && ros.length === 0) return false;
  // Lista placeholder vazia → ainda não preenchido
  const onlyEmpty =
    eqs.every((e) => !e.tipoEquipamento?.trim() && !e.foto) &&
    ros.every((e) => !e.tipoEquipamento?.trim() && !e.foto);
  return onlyEmpty ? false : null;
}

function quantidadeFibrasFoLabel(linhas: ResumoCadernoLinha[]): string {
  const fo = linhas.filter((l) => l.id.startsWith("fibra-aereo-"));
  if (!fo.length) return "—";
  const partes = fo
    .map((l) => {
      const total = l.total;
      if (!Number.isFinite(total) || total <= 0) return null;
      const cap = l.id.replace("fibra-aereo-", "");
      const rotulo = cap === "sem-tipo" || cap === "0" ? "FO" : `${cap} FO`;
      return `${formatResumoNumero(total, "Metros")} m (${rotulo})`;
    })
    .filter(Boolean);
  return partes.length ? partes.join("; ") : "—";
}

/**
 * Consolida cadastro + aba Medições (`buildResumoCaderno`) para a folha de rosto do PDF.
 */
export function buildPdfResumoExecutivo(row: RelatorioTransmissao): PdfResumoExecutivo {
  const p = row.payload;
  const { linhas } = buildResumoCaderno(p);

  return {
    cliente: dash(row.cliente),
    endereco: dash(row.endereco),
    cidade: dash(row.cidade),
    tecnologiaAcesso: dash(p?.tecnologiaAcesso),
    instalacaoEquipCliente: simNaoLabel(temEquipamentoCliente(p)),
    instalacaoEquipEstacao: simNaoLabel(p?.relatorioEstacao),
    quantidadeFibrasFo: quantidadeFibrasFoLabel(linhas),
    identificacaoEstacao: dash(p?.estacaoEntregaAcesso),
    linhas,
    caboAereoRe: resumoCabosAmbiente(p?.lancamentoCabosRe, "aereo"),
    caboAereoRc: resumoCabosAmbiente(p?.lancamentoCabosRc, "aereo"),
    caboSubRe: resumoCabosAmbiente(p?.lancamentoCabosRe, "subterraneo"),
    caboSubRc: resumoCabosAmbiente(p?.lancamentoCabosRc, "subterraneo"),
  };
}
