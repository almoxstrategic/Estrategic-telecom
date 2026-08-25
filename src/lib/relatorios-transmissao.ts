import { getStoragePublicUrl, getSupabaseClient } from "./supabase";
import {
  mergePendenciasItens,
  motivoPendenciaFromItens,
  parsePendenciasItens,
  type PendenciaItem,
  type PendenciaItemDef,
} from "./pendencias-itens";

export type { PendenciaItem, PendenciaItemDef } from "./pendencias-itens";
export type RelatorioStatus = "em_aberto" | "avisado" | "fechado" | "pendente";
export type TipoExecucao = "implantacao" | "empresarial";

/** Clientes disponíveis no select do MVP (escala futura via tabela clientes_relatorio). */
export const CLIENTES_OPERADORA_MVP = ["Claro"] as const;
export type ClienteOperadoraMvp = (typeof CLIENTES_OPERADORA_MVP)[number];

/** Valor sentinela da opção de UI "+ Adicionar Cliente" (não persiste). */
export const ADICIONAR_CLIENTE_VALUE = "__adicionar_cliente__" as const;

/** Nome/display da operadora. MVP: Claro; futuros clientes virão do catálogo. */
export type ClienteOperadora = string;
export const DEFAULT_CLIENTE_OPERADORA: ClienteOperadora = "Claro";

/** @deprecated Use CLIENTES_OPERADORA_MVP — mantido para imports legados. */
export const CLIENTES_OPERADORA = CLIENTES_OPERADORA_MVP;

export function parseClienteOperadora(raw: unknown): ClienteOperadora {
  if (typeof raw !== "string") return DEFAULT_CLIENTE_OPERADORA;
  const nome = raw.trim();
  if (!nome || nome === ADICIONAR_CLIENTE_VALUE) return DEFAULT_CLIENTE_OPERADORA;
  return nome;
}

export type StoredPhoto = {
  url: string;
  path: string;
};

/** Ambiente de execução por item (Aéreo / Subterrâneo) — não é aba global. */
export type AmbienteRede = "aereo" | "subterraneo";

export type FotoGrupoPayload = {
  fotos: StoredPhoto[];
  obs: string;
  obsAdmin: string;
};

/** Sub-abas independentes: Aéreo e Subterrâneo não se sobrescrevem. */
export type FotoGrupoPorAmbientePayload = {
  aereo: FotoGrupoPayload;
  subterraneo: FotoGrupoPayload;
};

export type LancamentoBlocoPayload = {
  isSim: boolean | null;
  metragens: CaboMetragemPayload[];
};

export type LancamentoPorAmbientePayload = {
  aereo: LancamentoBlocoPayload;
  subterraneo: LancamentoBlocoPayload;
};

export const FOTO_GRUPO_POR_AMBIENTE_KEYS = [
  "caixaEmenda",
  "plaquetaIdentificacao",
  "sobraTecnica",
  "rcCaixaEmenda",
  "rcPlaquetaIdentificacao",
  "rcSobraTecnica",
] as const;

export type RelatorioFotoGrupoKeyPorAmbiente = (typeof FOTO_GRUPO_POR_AMBIENTE_KEYS)[number];

export function isFotoGrupoPorAmbienteKey(
  key: string,
): key is RelatorioFotoGrupoKeyPorAmbiente {
  return (FOTO_GRUPO_POR_AMBIENTE_KEYS as readonly string[]).includes(key);
}

export type OutraFotoPayload = {
  id: string;
  ref: string;
  foto: StoredPhoto | null;
  obs: string;
  obsAdmin: string;
};

export type CaboMetragemPayload = {
  id: string;
  /** Código numérico do tipo de cabo (apenas dígitos). */
  tipoCabo: string;
  marcacaoInicial: string;
  marcacaoFinal: string;
  /** Total calculado: |marcacaoFinal - marcacaoInicial|. Persistido no payload. */
  metragem: string;
  fotoInicio: StoredPhoto | null;
  fotoFim: StoredPhoto | null;
  obs: string;
  obsAdmin: string;
};

/** Remove caracteres não numéricos (Tipo do cabo). */
export function apenasDigitos(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Sanitiza digitação de medição (dB, dBm, km, etc.):
 * permite sinal "-" só no início e um separador decimal ("." ou ",").
 * Mantém a vírgula na UI enquanto o usuário edita.
 */
export function sanitizeMedicaoInput(raw: string): string {
  const s = String(raw ?? "");
  let out = "";
  let seenSep = false;
  let i = 0;
  if (s.startsWith("-")) {
    out = "-";
    i = 1;
  }
  for (; i < s.length; i++) {
    const ch = s[i]!;
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if ((ch === "." || ch === ",") && !seenSep) {
      seenSep = true;
      out += ch;
    }
  }
  return out;
}

/** Converte vírgula em ponto para cálculo/persistência (ex.: "-18,5" → "-18.5"). */
export function normalizeMedicaoValue(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
}

/** Normaliza número decimal (aceita vírgula) para cálculo. */
export function parseMarcacaoNumero(value: string): number | null {
  const raw = normalizeMedicaoValue(value);
  if (!raw || raw === "-" || raw === "." || raw === "-.") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function calcularMetragemCaboTotal(
  marcacaoInicial: string,
  marcacaoFinal: string,
): string {
  const ini = parseMarcacaoNumero(marcacaoInicial);
  const fim = parseMarcacaoNumero(marcacaoFinal);
  if (ini == null || fim == null) return "";
  return String(Math.abs(fim - ini));
}

/** SGP padrão nos itens de equipamento / DGO no cliente. */
export const SGP_DEFAULT = "(90) 28911";

export type EquipamentoClienteItemPayload = {
  id: string;
  tipoEquipamento: string;
  modelo: string;
  fabricante: string;
  sgp: string;
  identificacao: string;
  foto: StoredPhoto | null;
  etiqueta: StoredPhoto | null;
  obs: string;
  obsAdmin: string;
};

export type DgoClienteItemPayload = {
  id: string;
  tipoEquipamento: string;
  modelo: string;
  fabricante: string;
  sgp: string;
  foto: StoredPhoto | null;
  etiqueta: StoredPhoto | null;
  obs: string;
  obsAdmin: string;
};

export type RelatorioFotoGrupoKeyRe =
  | "posteConexao"
  | "caixaEmenda"
  | "dutoSubterraneo"
  | "plaquetaIdentificacao"
  | "novoAterramentoPoste"
  | "aterramentoTerrometro"
  | "posicaoConexaoEstacao"
  | "etiquetaIdentificacao"
  | "sobraTecnica";

export type RelatorioFotoGrupoKeyRc =
  | "rcPosteConexao"
  | "rcCaixaEmenda"
  | "rcTerminacaoCabo"
  | "rcPlaquetaIdentificacao"
  | "rcEntradaInterna"
  | "rcEntradaExterna"
  | "rcSobraTecnica"
  | "rcNovoAterramentoPoste"
  | "rcDutoSubterraneo";

export type RelatorioFotoGrupoKeyEqCliente =
  | "eqClienteFachada"
  | "eqClienteAmbiente"
  | "eqClienteRack"
  | "eqClienteEtiqueta"
  | "eqClienteSgp";

export type RelatorioFotoGrupoKeyEqEstacao =
  | "eqEstacaoGeral"
  | "eqEstacaoRack"
  | "eqEstacaoEtiqueta";

export type RelatorioFotoGrupoKeyEq =
  | RelatorioFotoGrupoKeyEqCliente
  | RelatorioFotoGrupoKeyEqEstacao;

export type RelatorioFotoGrupoKey =
  | RelatorioFotoGrupoKeyRe
  | RelatorioFotoGrupoKeyRc
  | RelatorioFotoGrupoKeyEq;

export type TesteOpticoFaixaPayload = {
  dbm: string;
  fotos: StoredPhoto[];
  obs: string;
  obsAdmin: string;
};

export type TesteOpticoItemPayload = {
  dbm: string;
  foto: StoredPhoto | null;
  obs: string;
  obsAdmin: string;
};

export type TesteOpticoPayload = {
  cliente: {
    numeroFibra: number | null;
    nm1550: TesteOpticoFaixaPayload[];
    nm1330: TesteOpticoFaixaPayload[];
  };
  estacao: {
    numeroFibra: number | null;
    nm1550: TesteOpticoItemPayload[];
    nm1330: TesteOpticoItemPayload[];
  };
};

export type TesteOtdrItemPayload = {
  id: string;
  foto: StoredPhoto | null;
  obs: string;
  obsAdmin: string;
};

export type TestePotenciaPayload = {
  comprimentoTrechoKm: string;
  otdr: TesteOtdrItemPayload[];
};

export const ATEN_KM = 0.22;
export const ATEN_EMENDA = 0.1;
export const PERDA_CONEXAO = 0.5;

export type TestePotenciaJanelaPayload = {
  emendas: string;
  conexoes: string;
};

export function emptyTestePotenciaJanela(): TestePotenciaJanelaPayload {
  return { emendas: "", conexoes: "" };
}

export function parseNumeroCampo(raw: string): number | null {
  const texto = normalizeMedicaoValue(raw);
  if (!texto || texto === "-" || texto === "+" || texto === "." || texto === "-.") return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

function numeroOuZero(raw: string | number | null | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  return parseNumeroCampo(String(raw ?? "")) ?? 0;
}

export function calcularAtenuacaoMaxima(km: number, emendas: number, conexoes: number): number {
  return (
    numeroOuZero(km) * ATEN_KM +
    numeroOuZero(emendas) * ATEN_EMENDA +
    numeroOuZero(conexoes) * PERDA_CONEXAO
  );
}

export function calcularMinimoAdmissivel(pi: number | null, atenuacaoMax: number): number | null {
  if (pi == null || !Number.isFinite(pi)) return null;
  return pi - numeroOuZero(atenuacaoMax);
}

export function calcularAtenuacaoFibra(
  potenciaMedida: string,
  pi: number | null,
): number | null {
  const po = parseNumeroCampo(potenciaMedida);
  if (po == null || pi == null || !Number.isFinite(pi)) return null;
  return po - pi;
}

export function formatarDb(valor: number, casas = 3): string {
  const n = Number.isFinite(valor) ? valor : 0;
  return n.toFixed(casas);
}

export function formatarKm(km: number): string {
  const n = Number.isFinite(km) ? km : 0;
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
}

export function textoOuTraco(raw: string | null | undefined): string {
  const texto = String(raw ?? "").trim();
  return texto ? texto : "—";
}

export function emptyTesteOpticoFaixa(): TesteOpticoFaixaPayload {
  return { dbm: "", fotos: [], obs: "", obsAdmin: "" };
}

export function emptyTesteOpticoItem(): TesteOpticoItemPayload {
  return { dbm: "", foto: null, obs: "", obsAdmin: "" };
}

const DEFAULT_OTDR_IDS = ["otdr-1", "otdr-2"] as const;

export function emptyTesteOtdrItem(id?: string): TesteOtdrItemPayload {
  return { id: id ?? crypto.randomUUID(), foto: null, obs: "", obsAdmin: "" };
}

export function emptyTesteOptico(): TesteOpticoPayload {
  return {
    cliente: {
      numeroFibra: null,
      nm1550: [emptyTesteOpticoFaixa()],
      nm1330: [emptyTesteOpticoFaixa()],
    },
    estacao: {
      numeroFibra: null,
      nm1550: [emptyTesteOpticoItem()],
      nm1330: [emptyTesteOpticoItem()],
    },
  };
}

function primeiroDbm(lista: unknown): string {
  const item = Array.isArray(lista) ? lista[0] : lista;
  if (!item || typeof item !== "object") return "";
  const valor = (item as { dbm?: unknown; dBm?: unknown }).dbm ?? (item as { dBm?: unknown }).dBm;
  return valor == null ? "" : String(valor).trim();
}

export function testeOpticoEstacaoAtivo(
  estacao: TesteOpticoPayload["estacao"] | null | undefined,
): boolean {
  if (!estacao) return false;
  if (estacao.numeroFibra != null && Number(estacao.numeroFibra) >= 1) return true;
  return Boolean(primeiroDbm(estacao.nm1550) || primeiroDbm(estacao.nm1330));
}

export function emptyTestePotencia(): TestePotenciaPayload {
  return {
    comprimentoTrechoKm: "",
    otdr: [emptyTesteOtdrItem(DEFAULT_OTDR_IDS[0]), emptyTesteOtdrItem(DEFAULT_OTDR_IDS[1])],
  };
}

export type CoordenadasPayload = {
  latitude: string;
  longitude: string;
};

export type CordoalhaBlocoPayload = {
  isSim: boolean | null;
  quantidade: number | null;
};

export type QuantidadesPorAmbiente = {
  aereo: number | null;
  subterraneo: number | null;
};

export type QuantidadesRedePayload = {
  qtdCaixasEmenda: number | null;
  qtdCaixasEmendaPorAmbiente: QuantidadesPorAmbiente;
  /**
   * @deprecated Preferir `fiberloopInstalado.quantidade`. Mantido na leitura/escrita
   * para relatórios antigos (espelha a quantidade quando Fiberloop = SIM).
   */
  qtdFiberloopInstalado: number | null;
  /** Fiberloop instalado? (SIM/NÃO + quantidade) — apenas contexto aéreo. */
  fiberloopInstalado: CordoalhaBlocoPayload;
  cordoalhaLancada: CordoalhaBlocoPayload;
  cordoalhaExistente: CordoalhaBlocoPayload;
  /** Postes novos com nova cordoalha (após Poste de conexão). */
  postesNovaCordoalha: CordoalhaBlocoPayload;
  /** Postes com cordoalha existente (após Poste de conexão). */
  postesCordoalhaExistente: CordoalhaBlocoPayload;
  /** @deprecated Removido da UI (Aterramento - TERROMETRO). Mantido para parse legado. */
  aterramento: {
    totalHastes: number | null;
  };
  /** Coordenadas do Cliente (aba RC). */
  coordenadas: CoordenadasPayload;
  /** Coordenadas da caixa de emenda na acomodação (aba RC). */
  caixaEmendaAcomodacao: {
    coordenadas: CoordenadasPayload;
  };
  caixaEmendaAcomodacaoPorAmbiente: {
    aereo: { coordenadas: CoordenadasPayload };
    subterraneo: { coordenadas: CoordenadasPayload };
  };
};

/**
 * Campos de campo do relatório (RE/RC/equipamentos/testes/config/infra).
 * Mantido como alias interno para merge/parse; o JSON persistido é plano em RelatorioPayload.
 */
export type EscopoPayload = {
  lancamentoRe: boolean | null;
  /** Aba visual do lançamento RE (não apaga o outro lado). */
  lancamentoReAmbiente: AmbienteRede | null;
  lancamentoCabosRe: LancamentoPorAmbientePayload;
  metragensCabo: CaboMetragemPayload[];
  posteConexao: FotoGrupoPayload;
  caixaEmenda: FotoGrupoPorAmbientePayload;
  dutoSubterraneo: FotoGrupoPayload;
  plaquetaIdentificacao: FotoGrupoPorAmbientePayload;
  novoAterramentoPoste: FotoGrupoPayload;
  /** @deprecated Removido da UI. Persistido vazio. */
  aterramentoTerrometro: FotoGrupoPayload;
  /** Movido para a aba Equipamento. */
  posicaoConexaoEstacao: FotoGrupoPayload;
  /** Movido para a aba Equipamento. */
  etiquetaIdentificacao: FotoGrupoPayload;
  sobraTecnica: FotoGrupoPorAmbientePayload;
  outrasFotos: OutraFotoPayload[];
  redeAcesso: QuantidadesRedePayload;
  tecnologiaAcesso: string;
  lancamentoRc: boolean | null;
  lancamentoRcAmbiente: AmbienteRede | null;
  lancamentoCabosRc: LancamentoPorAmbientePayload;
  metragensCaboRc: CaboMetragemPayload[];
  rcPosteConexao: FotoGrupoPayload;
  rcCaixaEmenda: FotoGrupoPorAmbientePayload;
  rcTerminacaoCabo: FotoGrupoPayload;
  rcPlaquetaIdentificacao: FotoGrupoPorAmbientePayload;
  rcEntradaInterna: FotoGrupoPayload;
  rcEntradaExterna: FotoGrupoPayload;
  rcSobraTecnica: FotoGrupoPorAmbientePayload;
  rcNovoAterramentoPoste: FotoGrupoPayload;
  rcDutoSubterraneo: FotoGrupoPayload;
  outrasFotosRc: OutraFotoPayload[];
  redeCliente: QuantidadesRedePayload;
  eqClienteFachada: FotoGrupoPayload;
  eqClienteAmbiente: FotoGrupoPayload;
  eqClienteRack: FotoGrupoPayload;
  eqClienteDgo: DgoClienteItemPayload[];
  eqClienteEquipamentos: EquipamentoClienteItemPayload[];
  eqClienteEtiqueta: FotoGrupoPayload;
  eqClienteSgp: FotoGrupoPayload;
  outrasFotosEqCliente: OutraFotoPayload[];
  relatorioEstacao: boolean | null;
  estacaoEntregaAcesso: string;
  eqEstacaoGeral: FotoGrupoPayload;
  eqEstacaoRack: FotoGrupoPayload;
  eqEstacaoEquipamento: EquipamentoClienteItemPayload[];
  eqEstacaoEtiqueta: FotoGrupoPayload;
  eqEstacaoDgo: DgoClienteItemPayload[];
  outrasFotosEqEstacao: OutraFotoPayload[];
  testeOptico: TesteOpticoPayload;
  testePotenciaEmpresarial: TestePotenciaPayload;
  testePotenciaImplantacao: TestePotenciaPayload;
  testePotencia1550: TestePotenciaJanelaPayload;
  testePotencia1330: TestePotenciaJanelaPayload;
  equipamento: EquipamentoConexoesPayload;
  infraestrutura: InfraestruturaPayload;
};

/** Payload JSONB plano (raiz). Abas Medições/Contatos ficam na raiz junto com RE/RC/etc. */
export type RelatorioPayload = EscopoPayload & {
  medicoes: MedicoesPayload;
  contatos: ContatosPayload;
  /** Pendências granulares confirmadas pela supervisão (anti-dupe por itemId). */
  pendenciasItens?: PendenciaItem[];
};

export type EquipamentoRedeIpsPayload = {
  hostName: string;
  ipEth: string;
  ipGw: string;
  ipDmlan: string;
};

export type EquipamentoConexoesPayload = {
  configuracaoCliente: EquipamentoRedeIpsPayload;
  configuracaoEstacao: EquipamentoRedeIpsPayload;
};

/** @deprecated JSON legado da aba Configuração / Conexões. */
export type ConfiguracaoPayload = {
  equipamentosCliente: EquipamentoRedeIpsPayload;
  equipamentosEstacao: EquipamentoRedeIpsPayload;
};

export type MedicaoTomadaPayload = {
  id: string;
  faseNeutro: string;
  terraFase: string;
  terraNeutro: string;
};

export type InfraestruturaPayload = {
  possuiEspacoRack: boolean | null;
  tomadasNovoPadrao: boolean | null;
  pinagemPadraoCorreto: boolean | null;
  possuiNobreak: boolean | null;
  localClimatizado: boolean | null;
  tomadas: MedicaoTomadaPayload[];
};

/** Aba reservada — sem formulários ativos. */
export type MedicoesPayload = Record<string, never>;

export type ContatosPayload = {
  cliente: {
    local: { nome: string; telefone: string };
    remoto: { email: string; telefone: string };
  };
  empresaParceira: {
    supervisor: { nome: string; telefone: string };
    tecnico: { telefone: string; email: string };
  };
};

export function emptyEquipamentoRedeIps(): EquipamentoRedeIpsPayload {
  return { hostName: "", ipEth: "", ipGw: "", ipDmlan: "" };
}

export function emptyEquipamentoConexoes(): EquipamentoConexoesPayload {
  return {
    configuracaoCliente: emptyEquipamentoRedeIps(),
    configuracaoEstacao: emptyEquipamentoRedeIps(),
  };
}

export function emptyConfiguracao(): ConfiguracaoPayload {
  return {
    equipamentosCliente: emptyEquipamentoRedeIps(),
    equipamentosEstacao: emptyEquipamentoRedeIps(),
  };
}

export function emptyMedicaoTomada(): MedicaoTomadaPayload {
  return {
    id: crypto.randomUUID(),
    faseNeutro: "",
    terraFase: "",
    terraNeutro: "",
  };
}

export function emptyInfraestrutura(): InfraestruturaPayload {
  return {
    possuiEspacoRack: null,
    tomadasNovoPadrao: null,
    pinagemPadraoCorreto: null,
    possuiNobreak: null,
    localClimatizado: null,
    tomadas: [emptyMedicaoTomada()],
  };
}

export function emptyMedicoes(): MedicoesPayload {
  return {};
}

export function emptyContatos(): ContatosPayload {
  return {
    cliente: {
      local: { nome: "", telefone: "" },
      remoto: { email: "", telefone: "" },
    },
    empresaParceira: {
      supervisor: { nome: "", telefone: "" },
      tecnico: { telefone: "", email: "" },
    },
  };
}

export function emptyCaboMetragem(): CaboMetragemPayload {
  return {
    id: crypto.randomUUID(),
    tipoCabo: "",
    marcacaoInicial: "",
    marcacaoFinal: "",
    metragem: "",
    fotoInicio: null,
    fotoFim: null,
    obs: "",
    obsAdmin: "",
  };
}

export function emptyEquipamentoClienteItem(): EquipamentoClienteItemPayload {
  return {
    id: crypto.randomUUID(),
    tipoEquipamento: "",
    modelo: "",
    fabricante: "",
    sgp: SGP_DEFAULT,
    identificacao: "",
    foto: null,
    etiqueta: null,
    obs: "",
    obsAdmin: "",
  };
}

export function emptyDgoClienteItem(): DgoClienteItemPayload {
  return {
    id: crypto.randomUUID(),
    tipoEquipamento: "",
    modelo: "",
    fabricante: "",
    sgp: SGP_DEFAULT,
    foto: null,
    etiqueta: null,
    obs: "",
    obsAdmin: "",
  };
}

export type RelatorioTransmissao = {
  id: string;
  tecnico_id: string | null;
  tecnicos_atribuidos: string[];
  tecnicos_nomes: string[];
  os_wf: string;
  /** Nome do site / cliente final da obra (campo livre). */
  cliente: string;
  /** Nome/display da operadora (MVP: Claro). */
  cliente_operadora: ClienteOperadora;
  /** FK opcional para catálogo clientes_relatorio (template PDF). */
  cliente_relatorio_id?: string | null;
  endereco: string;
  cidade: string;
  equipe_empreiteira: string;
  responsavel: string;
  data_inicio_execucao: string;
  tipo_execucao: TipoExecucao | null;
  status: RelatorioStatus;
  payload: RelatorioPayload;
  motivo_pendencia: string | null;
  data_pendencia: string | null;
  avisado_at: string | null;
  fechado_at: string | null;
  created_at: string;
  updated_at: string;
  tecnico_nome?: string;
};

export function isTecnicoAtribuido(row: RelatorioTransmissao, userId: string): boolean {
  if (row.tecnicos_atribuidos.length) return row.tecnicos_atribuidos.includes(userId);
  return row.tecnico_id === userId;
}

export function labelTecnicosAtribuidos(row: RelatorioTransmissao): string {
  const nomes = row.tecnicos_nomes.filter((nome) => nome.trim());
  if (nomes.length) return nomes.join(", ");
  if (row.tecnico_nome?.trim()) return row.tecnico_nome.trim();
  return "Sem atribuição";
}

export function outrosTecnicosNomes(
  row: RelatorioTransmissao,
  userId: string,
  userNome?: string | null,
): string[] {
  const ids = row.tecnicos_atribuidos.length
    ? row.tecnicos_atribuidos
    : row.tecnico_id
      ? [row.tecnico_id]
      : [];
  const fromIds = ids
    .map((id, index) => (id === userId ? "" : row.tecnicos_nomes[index] ?? ""))
    .map((nome) => nome.trim())
    .filter(Boolean);
  if (fromIds.length) return fromIds;
  const eu = userNome?.trim();
  return row.tecnicos_nomes.filter((nome) => nome.trim() && nome.trim() !== eu);
}

export type RelatorioDraftPatch = {
  cliente?: string;
  endereco?: string;
  cidade?: string;
  equipe_empreiteira?: string;
  responsavel?: string;
  data_inicio_execucao?: string | null;
  payload?: RelatorioPayload;
};

export function readObsAdmin(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const obj = raw as { obsAdmin?: unknown; obs_admin?: unknown };
  if (typeof obj.obsAdmin === "string") return obj.obsAdmin;
  if (typeof obj.obs_admin === "string") return obj.obs_admin;
  return "";
}

function emptyFotoGrupo(): FotoGrupoPayload {
  return { fotos: [], obs: "", obsAdmin: "" };
}

export function emptyFotoGrupoPorAmbiente(): FotoGrupoPorAmbientePayload {
  return { aereo: emptyFotoGrupo(), subterraneo: emptyFotoGrupo() };
}

export function emptyLancamentoBloco(): LancamentoBlocoPayload {
  return { isSim: null, metragens: [] };
}

export function emptyLancamentoPorAmbiente(): LancamentoPorAmbientePayload {
  return { aereo: emptyLancamentoBloco(), subterraneo: emptyLancamentoBloco() };
}

export function looksLikeFotoGrupoPorAmbiente(raw: unknown): raw is FotoGrupoPorAmbientePayload {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.fotos)) return false;
  return obj.aereo != null || obj.subterraneo != null;
}

export function parseAmbienteRede(raw: unknown): AmbienteRede | null {
  if (raw === "aereo" || raw === "Aereo" || raw === "Aéreo") return "aereo";
  if (raw === "subterraneo" || raw === "Subterraneo" || raw === "Subterrâneo") return "subterraneo";
  return null;
}

export function emptyCoordenadas(): CoordenadasPayload {
  return { latitude: "", longitude: "" };
}

export function emptyCordoalhaBloco(): CordoalhaBlocoPayload {
  return { isSim: null, quantidade: null };
}

export function emptyQuantidadesRede(): QuantidadesRedePayload {
  return {
    qtdCaixasEmenda: null,
    qtdCaixasEmendaPorAmbiente: { aereo: null, subterraneo: null },
    qtdFiberloopInstalado: null,
    fiberloopInstalado: emptyCordoalhaBloco(),
    cordoalhaLancada: emptyCordoalhaBloco(),
    cordoalhaExistente: emptyCordoalhaBloco(),
    postesNovaCordoalha: emptyCordoalhaBloco(),
    postesCordoalhaExistente: emptyCordoalhaBloco(),
    aterramento: { totalHastes: null },
    coordenadas: emptyCoordenadas(),
    caixaEmendaAcomodacao: { coordenadas: emptyCoordenadas() },
    caixaEmendaAcomodacaoPorAmbiente: {
      aereo: { coordenadas: emptyCoordenadas() },
      subterraneo: { coordenadas: emptyCoordenadas() },
    },
  };
}

export function qtdCaixasTotal(q: QuantidadesRedePayload | null | undefined): number {
  if (!q) return 0;
  const por = q.qtdCaixasEmendaPorAmbiente;
  const soma = (por?.aereo || 0) + (por?.subterraneo || 0);
  if (soma > 0) return soma;
  return q.qtdCaixasEmenda || 0;
}

export function totalEmendasCalculado(
  qtdRe: number | null | undefined,
  qtdRc: number | null | undefined,
): number {
  return (qtdRe || 0) + (qtdRc || 0);
}

export function totalConexoesCalculado(totalEmendas: number): number {
  return totalEmendas * 2;
}

export function janelaPotenciaDerivada(
  redeAcesso: QuantidadesRedePayload,
  redeCliente: QuantidadesRedePayload,
): TestePotenciaJanelaPayload {
  const emendas = totalEmendasCalculado(qtdCaixasTotal(redeAcesso), qtdCaixasTotal(redeCliente));
  return {
    emendas: String(emendas),
    conexoes: String(totalConexoesCalculado(emendas)),
  };
}

export function emptyEscopoPayload(): EscopoPayload {
  return {
    lancamentoRe: null,
    lancamentoReAmbiente: "aereo",
    lancamentoCabosRe: emptyLancamentoPorAmbiente(),
    metragensCabo: [],
    posteConexao: emptyFotoGrupo(),
    caixaEmenda: emptyFotoGrupoPorAmbiente(),
    dutoSubterraneo: emptyFotoGrupo(),
    plaquetaIdentificacao: emptyFotoGrupoPorAmbiente(),
    novoAterramentoPoste: emptyFotoGrupo(),
    aterramentoTerrometro: emptyFotoGrupo(),
    posicaoConexaoEstacao: emptyFotoGrupo(),
    etiquetaIdentificacao: emptyFotoGrupo(),
    sobraTecnica: emptyFotoGrupoPorAmbiente(),
    outrasFotos: [],
    redeAcesso: emptyQuantidadesRede(),
    tecnologiaAcesso: "",
    lancamentoRc: null,
    lancamentoRcAmbiente: "aereo",
    lancamentoCabosRc: emptyLancamentoPorAmbiente(),
    metragensCaboRc: [],
    rcPosteConexao: emptyFotoGrupo(),
    rcCaixaEmenda: emptyFotoGrupoPorAmbiente(),
    rcTerminacaoCabo: emptyFotoGrupo(),
    rcPlaquetaIdentificacao: emptyFotoGrupoPorAmbiente(),
    rcEntradaInterna: emptyFotoGrupo(),
    rcEntradaExterna: emptyFotoGrupo(),
    rcSobraTecnica: emptyFotoGrupoPorAmbiente(),
    rcNovoAterramentoPoste: emptyFotoGrupo(),
    rcDutoSubterraneo: emptyFotoGrupo(),
    outrasFotosRc: [],
    redeCliente: emptyQuantidadesRede(),
    eqClienteFachada: emptyFotoGrupo(),
    eqClienteAmbiente: emptyFotoGrupo(),
    eqClienteRack: emptyFotoGrupo(),
    eqClienteDgo: [emptyDgoClienteItem()],
    eqClienteEquipamentos: [emptyEquipamentoClienteItem()],
    eqClienteEtiqueta: emptyFotoGrupo(),
    eqClienteSgp: emptyFotoGrupo(),
    outrasFotosEqCliente: [],
    relatorioEstacao: false,
    estacaoEntregaAcesso: "",
    eqEstacaoGeral: emptyFotoGrupo(),
    eqEstacaoRack: emptyFotoGrupo(),
    eqEstacaoEquipamento: [emptyEquipamentoClienteItem()],
    eqEstacaoEtiqueta: emptyFotoGrupo(),
    eqEstacaoDgo: [emptyDgoClienteItem()],
    outrasFotosEqEstacao: [],
    testeOptico: emptyTesteOptico(),
    testePotenciaEmpresarial: emptyTestePotencia(),
    testePotenciaImplantacao: emptyTestePotencia(),
    testePotencia1550: emptyTestePotenciaJanela(),
    testePotencia1330: emptyTestePotenciaJanela(),
    equipamento: emptyEquipamentoConexoes(),
    infraestrutura: emptyInfraestrutura(),
  };
}

export function emptyRelatorioPayload(): RelatorioPayload {
  return {
    ...emptyEscopoPayload(),
    medicoes: emptyMedicoes(),
    contatos: emptyContatos(),
    pendenciasItens: [],
  };
}

type LegacyMetragemRe = {
  fotoInicio?: StoredPhoto | null;
  fotoFim?: StoredPhoto | null;
  metragem?: string;
  obs?: string;
};

function parseCabosList(raw: unknown): CaboMetragemPayload[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((item) => {
    const cabo = (item ?? {}) as Partial<CaboMetragemPayload>;
    const marcacaoInicial =
      typeof cabo.marcacaoInicial === "string"
        ? cabo.marcacaoInicial
        : cabo.marcacaoInicial != null
          ? String(cabo.marcacaoInicial)
          : "";
    const marcacaoFinal =
      typeof cabo.marcacaoFinal === "string"
        ? cabo.marcacaoFinal
        : cabo.marcacaoFinal != null
          ? String(cabo.marcacaoFinal)
          : "";
    const metragemCalculada = calcularMetragemCaboTotal(marcacaoInicial, marcacaoFinal);
    return {
      id: cabo.id || crypto.randomUUID(),
      tipoCabo: apenasDigitos(cabo.tipoCabo ?? ""),
      marcacaoInicial,
      marcacaoFinal,
      metragem: metragemCalculada || (cabo.metragem ?? ""),
      fotoInicio: cabo.fotoInicio ?? null,
      fotoFim: cabo.fotoFim ?? null,
      obs: cabo.obs ?? "",
      obsAdmin: readObsAdmin(cabo),
    };
  });
}

function parseCabos(raw: unknown): CaboMetragemPayload[] {
  if (!raw || typeof raw !== "object") return [];
  const src = raw as Partial<EscopoPayload> & { metragemRe?: LegacyMetragemRe };
  const fromArray = parseCabosList(src.metragensCabo);
  if (fromArray.length > 0) return fromArray;
  const old = src.metragemRe;
  if (old && (old.fotoInicio || old.fotoFim || old.metragem || old.obs)) {
    return [
      {
        id: crypto.randomUUID(),
        tipoCabo: "",
        marcacaoInicial: "",
        marcacaoFinal: "",
        metragem: old.metragem ?? "",
        fotoInicio: old.fotoInicio ?? null,
        fotoFim: old.fotoFim ?? null,
        obs: old.obs ?? "",
        obsAdmin: readObsAdmin(old),
      },
    ];
  }
  return [];
}

function parseOutrasFotos(raw: unknown): OutraFotoPayload[] {
  if (!Array.isArray(raw)) {
    if (raw && typeof raw === "object") return parseOutrasFotos([raw]);
    return [];
  }
  return raw.map((item) => {
    const foto = (item ?? {}) as Partial<OutraFotoPayload>;
    return {
      id: foto.id || crypto.randomUUID(),
      ref: foto.ref ?? "",
      foto: foto.foto ?? null,
      obs: foto.obs ?? "",
      obsAdmin: readObsAdmin(foto),
    };
  });
}

function parseQtdInteiro(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function parseNumeroFibra(raw: unknown): number | null {
  const n = parseQtdInteiro(raw);
  if (n == null || n < 1) return null;
  return n;
}

function parseCoordenadas(raw: unknown): CoordenadasPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<CoordenadasPayload>;
  return {
    latitude: typeof src.latitude === "string" ? src.latitude : src.latitude != null ? String(src.latitude) : "",
    longitude:
      typeof src.longitude === "string" ? src.longitude : src.longitude != null ? String(src.longitude) : "",
  };
}

function parseCordoalhaBloco(raw: unknown): CordoalhaBlocoPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<CordoalhaBlocoPayload>;
  const isSim =
    src.isSim === true ? true : src.isSim === false ? false : null;
  return {
    isSim,
    quantidade: parseQtdInteiro(src.quantidade),
  };
}

function parseQuantidadesRede(raw: unknown): QuantidadesRedePayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<QuantidadesRedePayload> & {
    caixaEmendaAcomodacao?: { coordenadas?: unknown };
    aterramento?: { totalHastes?: unknown };
    fiberloopInstalado?: unknown;
  };
  const fiberloopParsed = parseCordoalhaBloco(src.fiberloopInstalado);
  const qtdLegado = parseQtdInteiro(src.qtdFiberloopInstalado);
  const fiberloopInstalado =
    fiberloopParsed.isSim != null || fiberloopParsed.quantidade != null
      ? fiberloopParsed
      : qtdLegado != null
        ? { isSim: true as const, quantidade: qtdLegado }
        : emptyCordoalhaBloco();
  const qtdFiberloopInstalado =
    fiberloopInstalado.isSim === true ? fiberloopInstalado.quantidade : null;
  const qtdAereo = parseQtdInteiro(src.qtdCaixasEmendaPorAmbiente?.aereo);
  const qtdSub = parseQtdInteiro(src.qtdCaixasEmendaPorAmbiente?.subterraneo);
  const qtdLegadoCaixas = parseQtdInteiro(src.qtdCaixasEmenda);
  const qtdCaixasEmendaPorAmbiente: QuantidadesPorAmbiente =
    qtdAereo != null || qtdSub != null
      ? { aereo: qtdAereo, subterraneo: qtdSub }
      : { aereo: qtdLegadoCaixas, subterraneo: null };
  const qtdCaixasEmenda =
    (qtdCaixasEmendaPorAmbiente.aereo || 0) + (qtdCaixasEmendaPorAmbiente.subterraneo || 0) ||
    qtdLegadoCaixas;
  const coordsAcomodacao = parseCoordenadas(src.caixaEmendaAcomodacao?.coordenadas);
  const coordsPor = src.caixaEmendaAcomodacaoPorAmbiente;
  return {
    qtdCaixasEmenda: qtdCaixasEmenda === 0 ? qtdLegadoCaixas : qtdCaixasEmenda,
    qtdCaixasEmendaPorAmbiente,
    qtdFiberloopInstalado,
    fiberloopInstalado,
    cordoalhaLancada: parseCordoalhaBloco(src.cordoalhaLancada),
    cordoalhaExistente: {
      isSim: parseCordoalhaBloco(src.cordoalhaExistente).isSim,
      quantidade: null,
    },
    postesNovaCordoalha: parseCordoalhaBloco(src.postesNovaCordoalha),
    postesCordoalhaExistente: {
      isSim: parseCordoalhaBloco(src.postesCordoalhaExistente).isSim,
      quantidade: null,
    },
    aterramento: {
      totalHastes: parseQtdInteiro(src.aterramento?.totalHastes),
    },
    coordenadas: parseCoordenadas(src.coordenadas),
    caixaEmendaAcomodacao: { coordenadas: coordsAcomodacao },
    caixaEmendaAcomodacaoPorAmbiente: {
      aereo: {
        coordenadas: parseCoordenadas(coordsPor?.aereo?.coordenadas) ?? coordsAcomodacao,
      },
      subterraneo: {
        coordenadas: parseCoordenadas(coordsPor?.subterraneo?.coordenadas),
      },
    },
  };
}

function parseBoolNull(raw: unknown): boolean | null {
  if (raw === true) return true;
  if (raw === false) return false;
  return null;
}

function parseStr(raw: unknown): string {
  return typeof raw === "string" ? raw : raw != null ? String(raw) : "";
}

function parseEquipamentoRedeIps(raw: unknown): EquipamentoRedeIpsPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<EquipamentoRedeIpsPayload>;
  return {
    hostName: parseStr(src.hostName),
    ipEth: parseStr(src.ipEth),
    ipGw: parseStr(src.ipGw),
    ipDmlan: parseStr(src.ipDmlan),
  };
}

function ipsVazio(ips: EquipamentoRedeIpsPayload): boolean {
  return !ips.hostName.trim() && !ips.ipEth.trim() && !ips.ipGw.trim() && !ips.ipDmlan.trim();
}

function parseConfiguracao(raw: unknown): ConfiguracaoPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<ConfiguracaoPayload>;
  return {
    equipamentosCliente: parseEquipamentoRedeIps(src.equipamentosCliente),
    equipamentosEstacao: parseEquipamentoRedeIps(src.equipamentosEstacao),
  };
}

function parseEquipamentoConexoes(raw: unknown, legacyConfiguracao?: unknown): EquipamentoConexoesPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<EquipamentoConexoesPayload>;
  const legado = parseConfiguracao(legacyConfiguracao);
  const cliente = parseEquipamentoRedeIps(src.configuracaoCliente);
  const estacao = parseEquipamentoRedeIps(src.configuracaoEstacao);
  return {
    configuracaoCliente: ipsVazio(cliente) ? legado.equipamentosCliente : cliente,
    configuracaoEstacao: ipsVazio(estacao) ? legado.equipamentosEstacao : estacao,
  };
}

function parseMedicaoTomada(raw: unknown): MedicaoTomadaPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<MedicaoTomadaPayload>;
  return {
    id: typeof src.id === "string" && src.id ? src.id : crypto.randomUUID(),
    faseNeutro: parseStr(src.faseNeutro),
    terraFase: parseStr(src.terraFase),
    terraNeutro: parseStr(src.terraNeutro),
  };
}

function parseTomadasLista(raw: unknown): MedicaoTomadaPayload[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseMedicaoTomada);
}

function parseInfraestrutura(
  raw: unknown,
  legacyTomadasFromMedicoes?: unknown,
): InfraestruturaPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<InfraestruturaPayload>;
  let tomadas = parseTomadasLista(src.tomadas);
  if (!tomadas.length) {
    tomadas = parseTomadasLista(legacyTomadasFromMedicoes);
  }
  return {
    possuiEspacoRack: parseBoolNull(src.possuiEspacoRack),
    tomadasNovoPadrao: parseBoolNull(src.tomadasNovoPadrao),
    pinagemPadraoCorreto: parseBoolNull(src.pinagemPadraoCorreto),
    possuiNobreak: parseBoolNull(src.possuiNobreak),
    localClimatizado: parseBoolNull(src.localClimatizado),
    tomadas: tomadas.length ? tomadas : [emptyMedicaoTomada()],
  };
}

function parseMedicoes(_raw: unknown): MedicoesPayload {
  return emptyMedicoes();
}

function parseContatos(raw: unknown): ContatosPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<ContatosPayload> & {
    cliente?: { local?: Record<string, unknown>; remoto?: Record<string, unknown> };
    empresaParceira?: {
      supervisor?: Record<string, unknown>;
      tecnico?: Record<string, unknown>;
    };
  };
  return {
    cliente: {
      local: {
        nome: parseStr(src.cliente?.local?.nome),
        telefone: parseStr(src.cliente?.local?.telefone),
      },
      remoto: {
        email: parseStr(src.cliente?.remoto?.email),
        telefone: parseStr(src.cliente?.remoto?.telefone),
      },
    },
    empresaParceira: {
      supervisor: {
        nome: parseStr(src.empresaParceira?.supervisor?.nome),
        telefone: parseStr(src.empresaParceira?.supervisor?.telefone),
      },
      tecnico: {
        telefone: parseStr(src.empresaParceira?.tecnico?.telefone),
        email: parseStr(src.empresaParceira?.tecnico?.email),
      },
    },
  };
}

function parseFotoGrupo(
  base: FotoGrupoPayload,
  raw: FotoGrupoPayload | undefined,
): FotoGrupoPayload {
  return {
    fotos: raw?.fotos ?? base.fotos ?? [],
    obs: raw?.obs ?? base.obs ?? "",
    obsAdmin: readObsAdmin(raw) || base.obsAdmin || "",
  };
}

function parseFotoGrupoPorAmbiente(raw: unknown): FotoGrupoPorAmbientePayload {
  const empty = emptyFotoGrupoPorAmbiente();
  if (looksLikeFotoGrupoPorAmbiente(raw)) {
    return {
      aereo: parseFotoGrupo(empty.aereo, raw.aereo as FotoGrupoPayload | undefined),
      subterraneo: parseFotoGrupo(
        empty.subterraneo,
        raw.subterraneo as FotoGrupoPayload | undefined,
      ),
    };
  }
  const flat = parseFotoGrupo(emptyFotoGrupo(), raw as FotoGrupoPayload | undefined);
  const ambiente = parseAmbienteRede(
    raw && typeof raw === "object" ? (raw as { ambiente?: unknown }).ambiente : null,
  );
  if (ambiente === "subterraneo") {
    return { aereo: emptyFotoGrupo(), subterraneo: flat };
  }
  const temConteudo = (flat.fotos?.length ?? 0) > 0 || Boolean(flat.obs?.trim());
  if (!temConteudo) return empty;
  return { aereo: flat, subterraneo: emptyFotoGrupo() };
}

function parseLancamentoBloco(raw: unknown): LancamentoBlocoPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<LancamentoBlocoPayload>;
  return {
    isSim: parseBoolNull(src.isSim),
    metragens: parseCabosList(src.metragens),
  };
}

function parseLancamentoPorAmbiente(
  nested: unknown,
  legadoIsSim: boolean | null,
  legadoMetragens: CaboMetragemPayload[],
  legadoAmbiente: AmbienteRede | null,
): LancamentoPorAmbientePayload {
  if (nested && typeof nested === "object") {
    const src = nested as Partial<LancamentoPorAmbientePayload>;
    if (src.aereo || src.subterraneo) {
      return {
        aereo: parseLancamentoBloco(src.aereo),
        subterraneo: parseLancamentoBloco(src.subterraneo),
      };
    }
  }
  const bloco: LancamentoBlocoPayload = { isSim: legadoIsSim, metragens: legadoMetragens };
  if (legadoAmbiente === "subterraneo") {
    return { aereo: emptyLancamentoBloco(), subterraneo: bloco };
  }
  return { aereo: bloco, subterraneo: emptyLancamentoBloco() };
}

export function simDerivadoLancamento(l: LancamentoPorAmbientePayload): boolean | null {
  if (l.aereo.isSim === true || l.subterraneo.isSim === true) return true;
  if (l.aereo.isSim === false || l.subterraneo.isSim === false) return false;
  return null;
}

function parseStoredPhoto(raw: unknown): StoredPhoto | null {
  if (!raw || typeof raw !== "object") return null;
  const foto = raw as Partial<StoredPhoto>;
  if (!foto.url && !foto.path) return null;
  return { url: foto.url ?? "", path: foto.path ?? "" };
}

function parseEquipamentoClienteItem(raw: unknown): EquipamentoClienteItemPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<EquipamentoClienteItemPayload> & {
    id?: string;
  };
  return {
    id: typeof src.id === "string" && src.id ? src.id : crypto.randomUUID(),
    tipoEquipamento: typeof src.tipoEquipamento === "string" ? src.tipoEquipamento : "",
    modelo: typeof src.modelo === "string" ? src.modelo : "",
    fabricante: typeof src.fabricante === "string" ? src.fabricante : "",
    sgp: typeof src.sgp === "string" && src.sgp.trim() ? src.sgp : SGP_DEFAULT,
    identificacao: typeof src.identificacao === "string" ? src.identificacao : "",
    foto: parseStoredPhoto(src.foto),
    etiqueta: parseStoredPhoto(src.etiqueta),
    obs: typeof src.obs === "string" ? src.obs : "",
    obsAdmin: readObsAdmin(src),
  };
}

function parseDgoClienteItem(raw: unknown): DgoClienteItemPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<DgoClienteItemPayload> & {
    id?: string;
  };
  return {
    id: typeof src.id === "string" && src.id ? src.id : crypto.randomUUID(),
    tipoEquipamento: typeof src.tipoEquipamento === "string" ? src.tipoEquipamento : "",
    modelo: typeof src.modelo === "string" ? src.modelo : "",
    fabricante: typeof src.fabricante === "string" ? src.fabricante : "",
    sgp: typeof src.sgp === "string" && src.sgp.trim() ? src.sgp : SGP_DEFAULT,
    foto: parseStoredPhoto(src.foto),
    etiqueta: parseStoredPhoto(src.etiqueta),
    obs: typeof src.obs === "string" ? src.obs : "",
    obsAdmin: readObsAdmin(src),
  };
}

/** Migra legado FotoGrupoPayload → lista de itens (1 foto = 1 item). */
function parseEquipamentoClienteLista(raw: unknown): EquipamentoClienteItemPayload[] {
  if (Array.isArray(raw)) {
    const items = raw.map(parseEquipamentoClienteItem);
    return items.length ? items : [emptyEquipamentoClienteItem()];
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as FotoGrupoPayload).fotos)) {
    const grupo = raw as FotoGrupoPayload;
    const fotos = grupo.fotos ?? [];
    if (!fotos.length) return [emptyEquipamentoClienteItem()];
    return fotos.map((foto, index) => ({
      ...emptyEquipamentoClienteItem(),
      foto,
      obs: index === 0 ? (grupo.obs ?? "") : "",
      obsAdmin: index === 0 ? readObsAdmin(grupo) : "",
    }));
  }
  return [emptyEquipamentoClienteItem()];
}

function parseDgoClienteLista(raw: unknown): DgoClienteItemPayload[] {
  if (Array.isArray(raw)) {
    const items = raw.map(parseDgoClienteItem);
    return items.length ? items : [emptyDgoClienteItem()];
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as FotoGrupoPayload).fotos)) {
    const grupo = raw as FotoGrupoPayload;
    const fotos = grupo.fotos ?? [];
    if (!fotos.length) return [emptyDgoClienteItem()];
    return fotos.map((foto, index) => ({
      ...emptyDgoClienteItem(),
      foto,
      obs: index === 0 ? (grupo.obs ?? "") : "",
      obsAdmin: index === 0 ? readObsAdmin(grupo) : "",
    }));
  }
  return [emptyDgoClienteItem()];
}

function parseFotosList(raw: unknown): StoredPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseStoredPhoto).filter((foto): foto is StoredPhoto => Boolean(foto));
}

function parseTesteOpticoFaixa(raw: unknown): TesteOpticoFaixaPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<TesteOpticoFaixaPayload> & {
    dBm?: string;
  };
  return {
    dbm: src.dbm ?? src.dBm ?? "",
    fotos: parseFotosList(src.fotos).slice(0, 1),
    obs: src.obs ?? "",
    obsAdmin: readObsAdmin(src),
  };
}

function parseTesteOpticoItem(raw: unknown): TesteOpticoItemPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<TesteOpticoItemPayload> & {
    dBm?: string;
  };
  return {
    dbm: src.dbm ?? src.dBm ?? "",
    foto: parseStoredPhoto(src.foto),
    obs: src.obs ?? "",
    obsAdmin: readObsAdmin(src),
  };
}

function listaOuUnico(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") return [raw];
  return [];
}

function numeroFibraDeItem(raw: unknown, fallback: number | null): number | null {
  if (!raw || typeof raw !== "object") return fallback;
  return parseNumeroFibra((raw as { numeroFibra?: unknown }).numeroFibra) ?? fallback;
}

function parseLocalidadeCliente(raw: unknown): TesteOpticoPayload["cliente"] {
  const src = (raw && typeof raw === "object" ? raw : {}) as {
    testes?: unknown;
    numeroFibra?: unknown;
    nm1550?: unknown;
    nm1330?: unknown;
  };
  const fallback = parseNumeroFibra(src.numeroFibra);
  if (Array.isArray(src.testes) && src.testes[0] && typeof src.testes[0] === "object") {
    const par = src.testes[0] as {
      numeroFibra?: unknown;
      nm1550?: unknown;
      nm1330?: unknown;
    };
    return {
      numeroFibra: parseNumeroFibra(par.numeroFibra) ?? fallback,
      nm1550: [parseTesteOpticoFaixa(par.nm1550)],
      nm1330: [parseTesteOpticoFaixa(par.nm1330)],
    };
  }
  const nm1550 = listaOuUnico(src.nm1550);
  const nm1330 = listaOuUnico(src.nm1330);
  return {
    numeroFibra: numeroFibraDeItem(nm1550[0], numeroFibraDeItem(nm1330[0], fallback)),
    nm1550: [parseTesteOpticoFaixa(nm1550[0])],
    nm1330: [parseTesteOpticoFaixa(nm1330[0])],
  };
}

function parseLocalidadeEstacao(raw: unknown): TesteOpticoPayload["estacao"] {
  const src = (raw && typeof raw === "object" ? raw : {}) as {
    testes?: unknown;
    numeroFibra?: unknown;
    nm1550?: unknown;
    nm1330?: unknown;
  };
  const fallback = parseNumeroFibra(src.numeroFibra);
  if (Array.isArray(src.testes) && src.testes[0] && typeof src.testes[0] === "object") {
    const par = src.testes[0] as {
      numeroFibra?: unknown;
      nm1550?: unknown;
      nm1330?: unknown;
    };
    return {
      numeroFibra: parseNumeroFibra(par.numeroFibra) ?? fallback,
      nm1550: [parseTesteOpticoItem(par.nm1550)],
      nm1330: [parseTesteOpticoItem(par.nm1330)],
    };
  }
  const nm1550 = listaOuUnico(src.nm1550);
  const nm1330 = listaOuUnico(src.nm1330);
  return {
    numeroFibra: numeroFibraDeItem(nm1550[0], numeroFibraDeItem(nm1330[0], fallback)),
    nm1550: [parseTesteOpticoItem(nm1550[0])],
    nm1330: [parseTesteOpticoItem(nm1330[0])],
  };
}

function parseTesteOtdrItems(raw: unknown): TesteOtdrItemPayload[] {
  const list = Array.isArray(raw)
    ? raw.map((item) => {
        const src = (item ?? {}) as Partial<TesteOtdrItemPayload>;
        return {
          id: src.id || crypto.randomUUID(),
          foto: parseStoredPhoto(src.foto),
          obs: src.obs ?? "",
          obsAdmin: readObsAdmin(src),
        };
      })
    : [];
  return list.length > 0
    ? list
    : [emptyTesteOtdrItem(DEFAULT_OTDR_IDS[0]), emptyTesteOtdrItem(DEFAULT_OTDR_IDS[1])];
}

function parseComprimentoTrechoKm(raw: unknown): string {
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "string") return raw;
  return "";
}

function parseTesteOptico(raw: unknown): TesteOpticoPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as {
    cliente?: unknown;
    estacao?: unknown;
  };
  return {
    cliente: parseLocalidadeCliente(src.cliente),
    estacao: parseLocalidadeEstacao(src.estacao),
  };
}

function parseTestePotencia(raw: unknown, kmFallback = ""): TestePotenciaPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<TestePotenciaPayload>;
  return {
    comprimentoTrechoKm: parseComprimentoTrechoKm(src.comprimentoTrechoKm) || kmFallback,
    otdr: parseTesteOtdrItems(src.otdr),
  };
}

function parseTestePotenciaJanela(raw: unknown): TestePotenciaJanelaPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<TestePotenciaJanelaPayload>;
  return {
    emendas: src.emendas ?? "",
    conexoes: src.conexoes ?? "",
  };
}

function parseTestesPotenciaSeparados(
  src: Partial<EscopoPayload> & {
    testePotencia?: unknown;
    testeOptico?: { comprimentoTrechoKm?: unknown };
  },
  tipoExecucao?: TipoExecucao | null,
): Pick<EscopoPayload, "testePotenciaEmpresarial" | "testePotenciaImplantacao"> {
  const kmLegado = parseComprimentoTrechoKm(src.testeOptico?.comprimentoTrechoKm);
  const temEmpresarial = src.testePotenciaEmpresarial != null;
  const temImplantacao = src.testePotenciaImplantacao != null;
  if (temEmpresarial || temImplantacao) {
    return {
      testePotenciaEmpresarial: parseTestePotencia(src.testePotenciaEmpresarial, kmLegado),
      testePotenciaImplantacao: parseTestePotencia(src.testePotenciaImplantacao),
    };
  }
  const legado = parseTestePotencia(src.testePotencia, kmLegado);
  if (tipoExecucao === "implantacao") {
    return {
      testePotenciaEmpresarial: emptyTestePotencia(),
      testePotenciaImplantacao: legado,
    };
  }
  return {
    testePotenciaEmpresarial: legado,
    testePotenciaImplantacao: emptyTestePotencia(),
  };
}

export function parseEscopoPayload(
  raw: unknown,
  tipoExecucao?: TipoExecucao | null,
  legacyTomadasFromMedicoes?: unknown,
): EscopoPayload {
  const base = emptyEscopoPayload();
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Partial<EscopoPayload> & {
    testePotencia?: unknown;
    medicoes?: unknown;
    configuracao?: unknown;
  };
  const lancamentoCabosRe = parseLancamentoPorAmbiente(
    (src as { lancamentoCabosRe?: unknown }).lancamentoCabosRe,
    src.lancamentoRe ?? null,
    parseCabos(raw),
    parseAmbienteRede((src as { lancamentoReAmbiente?: unknown }).lancamentoReAmbiente),
  );
  const lancamentoCabosRc = parseLancamentoPorAmbiente(
    (src as { lancamentoCabosRc?: unknown }).lancamentoCabosRc,
    src.lancamentoRc ?? null,
    parseCabosList(src.metragensCaboRc),
    parseAmbienteRede((src as { lancamentoRcAmbiente?: unknown }).lancamentoRcAmbiente),
  );
  return {
    ...base,
    lancamentoCabosRe,
    lancamentoRe: simDerivadoLancamento(lancamentoCabosRe),
    lancamentoReAmbiente:
      parseAmbienteRede((src as { lancamentoReAmbiente?: unknown }).lancamentoReAmbiente) ?? "aereo",
    metragensCabo: lancamentoCabosRe.aereo.metragens,
    posteConexao: parseFotoGrupo(base.posteConexao, src.posteConexao as FotoGrupoPayload | undefined),
    caixaEmenda: parseFotoGrupoPorAmbiente(src.caixaEmenda),
    dutoSubterraneo: parseFotoGrupo(base.dutoSubterraneo, src.dutoSubterraneo as FotoGrupoPayload | undefined),
    plaquetaIdentificacao: parseFotoGrupoPorAmbiente(src.plaquetaIdentificacao),
    novoAterramentoPoste: parseFotoGrupo(
      base.novoAterramentoPoste,
      src.novoAterramentoPoste as FotoGrupoPayload | undefined,
    ),
    aterramentoTerrometro: emptyFotoGrupo(),
    posicaoConexaoEstacao: parseFotoGrupo(
      base.posicaoConexaoEstacao,
      src.posicaoConexaoEstacao as FotoGrupoPayload | undefined,
    ),
    etiquetaIdentificacao: parseFotoGrupo(
      base.etiquetaIdentificacao,
      src.etiquetaIdentificacao as FotoGrupoPayload | undefined,
    ),
    sobraTecnica: parseFotoGrupoPorAmbiente(src.sobraTecnica),
    outrasFotos: parseOutrasFotos(src.outrasFotos),
    redeAcesso: parseQuantidadesRede(src.redeAcesso),
    tecnologiaAcesso: src.tecnologiaAcesso ?? "",
    lancamentoCabosRc,
    lancamentoRc: simDerivadoLancamento(lancamentoCabosRc),
    lancamentoRcAmbiente:
      parseAmbienteRede((src as { lancamentoRcAmbiente?: unknown }).lancamentoRcAmbiente) ?? "aereo",
    metragensCaboRc: lancamentoCabosRc.aereo.metragens,
    rcPosteConexao: parseFotoGrupo(base.rcPosteConexao, src.rcPosteConexao as FotoGrupoPayload | undefined),
    rcCaixaEmenda: parseFotoGrupoPorAmbiente(src.rcCaixaEmenda),
    rcTerminacaoCabo: parseFotoGrupo(
      base.rcTerminacaoCabo,
      src.rcTerminacaoCabo as FotoGrupoPayload | undefined,
    ),
    rcPlaquetaIdentificacao: parseFotoGrupoPorAmbiente(src.rcPlaquetaIdentificacao),
    rcEntradaInterna: parseFotoGrupo(
      base.rcEntradaInterna,
      src.rcEntradaInterna as FotoGrupoPayload | undefined,
    ),
    rcEntradaExterna: parseFotoGrupo(
      base.rcEntradaExterna,
      src.rcEntradaExterna as FotoGrupoPayload | undefined,
    ),
    rcSobraTecnica: parseFotoGrupoPorAmbiente(src.rcSobraTecnica),
    rcNovoAterramentoPoste: parseFotoGrupo(
      base.rcNovoAterramentoPoste,
      (src as { rcNovoAterramentoPoste?: FotoGrupoPayload }).rcNovoAterramentoPoste,
    ),
    rcDutoSubterraneo: parseFotoGrupo(
      base.rcDutoSubterraneo,
      (src as { rcDutoSubterraneo?: FotoGrupoPayload }).rcDutoSubterraneo,
    ),
    outrasFotosRc: parseOutrasFotos(src.outrasFotosRc),
    redeCliente: parseQuantidadesRede(src.redeCliente),
    eqClienteFachada: parseFotoGrupo(base.eqClienteFachada, src.eqClienteFachada),
    eqClienteAmbiente: parseFotoGrupo(base.eqClienteAmbiente, src.eqClienteAmbiente),
    eqClienteRack: parseFotoGrupo(base.eqClienteRack, src.eqClienteRack),
    eqClienteDgo: parseDgoClienteLista(src.eqClienteDgo),
    eqClienteEquipamentos: parseEquipamentoClienteLista(src.eqClienteEquipamentos),
    eqClienteEtiqueta: parseFotoGrupo(base.eqClienteEtiqueta, src.eqClienteEtiqueta),
    eqClienteSgp: parseFotoGrupo(base.eqClienteSgp, src.eqClienteSgp),
    outrasFotosEqCliente: parseOutrasFotos(src.outrasFotosEqCliente),
    relatorioEstacao: src.relatorioEstacao ?? false,
    estacaoEntregaAcesso: src.estacaoEntregaAcesso ?? "",
    eqEstacaoGeral: parseFotoGrupo(base.eqEstacaoGeral, src.eqEstacaoGeral),
    eqEstacaoRack: parseFotoGrupo(base.eqEstacaoRack, src.eqEstacaoRack),
    eqEstacaoEquipamento: parseEquipamentoClienteLista(src.eqEstacaoEquipamento),
    eqEstacaoEtiqueta: parseFotoGrupo(base.eqEstacaoEtiqueta, src.eqEstacaoEtiqueta),
    eqEstacaoDgo: parseDgoClienteLista(src.eqEstacaoDgo),
    outrasFotosEqEstacao: parseOutrasFotos(src.outrasFotosEqEstacao),
    testeOptico: parseTesteOptico(src.testeOptico),
    ...parseTestesPotenciaSeparados(src, tipoExecucao),
    testePotencia1550: parseTestePotenciaJanela(src.testePotencia1550),
    testePotencia1330: parseTestePotenciaJanela(src.testePotencia1330),
    equipamento: parseEquipamentoConexoes(src.equipamento, src.configuracao),
    infraestrutura: parseInfraestrutura(
      src.infraestrutura,
      legacyTomadasFromMedicoes ?? (src.medicoes as { tomadas?: unknown } | undefined)?.tomadas,
    ),
  };
}

function parsePayload(raw: unknown, tipoExecucao?: TipoExecucao | null): RelatorioPayload {
  if (!raw || typeof raw !== "object") return emptyRelatorioPayload();
  const src = raw as Record<string, unknown>;
  const legacyTomadas = (src.medicoes as { tomadas?: unknown } | undefined)?.tomadas;

  // Retrocompat: JSON aninhado aereo/subterraneo → achata na raiz (aéreo prevalece).
  const temAereo = Boolean(src.aereo && typeof src.aereo === "object");
  const temSubterraneo = Boolean(src.subterraneo && typeof src.subterraneo === "object");
  if (temAereo || temSubterraneo) {
    const aereo = parseEscopoPayload(src.aereo, tipoExecucao, legacyTomadas);
    const subterraneo = parseEscopoPayload(src.subterraneo, tipoExecucao);
    return {
      ...mergeEscopoPayload(subterraneo, aereo),
      medicoes: parseMedicoes(src.medicoes),
      contatos: parseContatos(src.contatos),
      pendenciasItens: parsePendenciasItens(src.pendenciasItens),
    };
  }

  return {
    ...parseEscopoPayload(src, tipoExecucao, legacyTomadas),
    medicoes: parseMedicoes(src.medicoes),
    contatos: parseContatos(src.contatos),
    pendenciasItens: parsePendenciasItens(src.pendenciasItens),
  };
}

const FOTO_GRUPO_SIMPLES_KEYS = [
  "posteConexao",
  "dutoSubterraneo",
  "novoAterramentoPoste",
  "aterramentoTerrometro",
  "posicaoConexaoEstacao",
  "etiquetaIdentificacao",
  "rcPosteConexao",
  "rcTerminacaoCabo",
  "rcEntradaInterna",
  "rcEntradaExterna",
  "rcNovoAterramentoPoste",
  "rcDutoSubterraneo",
  "eqClienteFachada",
  "eqClienteAmbiente",
  "eqClienteRack",
  "eqClienteEtiqueta",
  "eqClienteSgp",
  "eqEstacaoGeral",
  "eqEstacaoRack",
  "eqEstacaoEtiqueta",
] as const satisfies readonly RelatorioFotoGrupoKey[];

function mergeById<T extends { id: string }>(
  server: T[],
  local: T[],
  mergeItem: (fromServer: T, fromLocal: T) => T,
): T[] {
  const map = new Map<string, T>();
  const order: string[] = [];
  for (const item of server) {
    if (!map.has(item.id)) order.push(item.id);
    map.set(item.id, item);
  }
  for (const item of local) {
    const prev = map.get(item.id);
    if (!prev) {
      order.push(item.id);
      map.set(item.id, item);
      continue;
    }
    map.set(item.id, mergeItem(prev, item));
  }
  return order.map((id) => map.get(id)!);
}

function mergeFotosByPath(server: StoredPhoto[], local: StoredPhoto[]): StoredPhoto[] {
  const map = new Map<string, StoredPhoto>();
  for (const foto of [...server, ...local]) {
    const key = foto.path || foto.url;
    if (key) map.set(key, foto);
  }
  return [...map.values()];
}

function mergeFotoGrupo(server: FotoGrupoPayload, local: FotoGrupoPayload): FotoGrupoPayload {
  const fromServer = server ?? emptyFotoGrupo();
  const fromLocal = local ?? emptyFotoGrupo();
  return {
    fotos: mergeFotosByPath(fromServer.fotos ?? [], fromLocal.fotos ?? []),
    obs: fromLocal.obs || fromServer.obs,
    obsAdmin: fromLocal.obsAdmin || fromServer.obsAdmin,
  };
}

function mergeFotoGrupoPorAmbiente(
  server: FotoGrupoPorAmbientePayload,
  local: FotoGrupoPorAmbientePayload,
): FotoGrupoPorAmbientePayload {
  return {
    aereo: mergeFotoGrupo(server.aereo, local.aereo),
    subterraneo: mergeFotoGrupo(server.subterraneo, local.subterraneo),
  };
}

function mergeLancamentoPorAmbiente(
  server: LancamentoPorAmbientePayload,
  local: LancamentoPorAmbientePayload,
): LancamentoPorAmbientePayload {
  const mergeLado = (s: LancamentoBlocoPayload, l: LancamentoBlocoPayload): LancamentoBlocoPayload => ({
    isSim: l.isSim !== null ? l.isSim : s.isSim,
    metragens: mergeById(s.metragens ?? [], l.metragens ?? [], mergeCabo),
  });
  return {
    aereo: mergeLado(server.aereo, local.aereo),
    subterraneo: mergeLado(server.subterraneo, local.subterraneo),
  };
}

function mergeCabo(server: CaboMetragemPayload, local: CaboMetragemPayload): CaboMetragemPayload {
  const marcacaoInicial = local.marcacaoInicial || server.marcacaoInicial;
  const marcacaoFinal = local.marcacaoFinal || server.marcacaoFinal;
  const metragemCalculada = calcularMetragemCaboTotal(marcacaoInicial, marcacaoFinal);
  return {
    ...server,
    tipoCabo: local.tipoCabo || server.tipoCabo,
    marcacaoInicial,
    marcacaoFinal,
    metragem: metragemCalculada || local.metragem || server.metragem,
    fotoInicio: local.fotoInicio ?? server.fotoInicio,
    fotoFim: local.fotoFim ?? server.fotoFim,
    obs: local.obs || server.obs,
    obsAdmin: local.obsAdmin || server.obsAdmin,
  };
}

function mergeEquipamentoClienteItem(
  server: EquipamentoClienteItemPayload,
  local: EquipamentoClienteItemPayload,
): EquipamentoClienteItemPayload {
  return {
    ...server,
    tipoEquipamento: local.tipoEquipamento || server.tipoEquipamento,
    modelo: local.modelo || server.modelo,
    fabricante: local.fabricante || server.fabricante,
    sgp: local.sgp || server.sgp || SGP_DEFAULT,
    identificacao: local.identificacao || server.identificacao,
    foto: local.foto ?? server.foto,
    etiqueta: local.etiqueta ?? server.etiqueta,
    obs: local.obs || server.obs,
    obsAdmin: local.obsAdmin || server.obsAdmin,
  };
}

function mergeDgoClienteItem(
  server: DgoClienteItemPayload,
  local: DgoClienteItemPayload,
): DgoClienteItemPayload {
  return {
    ...server,
    tipoEquipamento: local.tipoEquipamento || server.tipoEquipamento,
    modelo: local.modelo || server.modelo,
    fabricante: local.fabricante || server.fabricante,
    sgp: local.sgp || server.sgp || SGP_DEFAULT,
    foto: local.foto ?? server.foto,
    etiqueta: local.etiqueta ?? server.etiqueta,
    obs: local.obs || server.obs,
    obsAdmin: local.obsAdmin || server.obsAdmin,
  };
}

function mergeOutra(server: OutraFotoPayload, local: OutraFotoPayload): OutraFotoPayload {
  return {
    ...server,
    ref: local.ref,
    foto: local.foto ?? server.foto,
    obs: local.obs || server.obs,
    obsAdmin: local.obsAdmin || server.obsAdmin,
  };
}

function mergeTesteOpticoFaixa(
  server: TesteOpticoFaixaPayload,
  local: TesteOpticoFaixaPayload,
): TesteOpticoFaixaPayload {
  return {
    dbm: local.dbm,
    fotos: (local.fotos ?? []).slice(0, 1),
    obs: local.obs,
    obsAdmin: local.obsAdmin || server.obsAdmin,
  };
}

function mergeTesteOpticoItem(
  server: TesteOpticoItemPayload,
  local: TesteOpticoItemPayload,
): TesteOpticoItemPayload {
  return {
    dbm: local.dbm,
    foto: local.foto,
    obs: local.obs,
    obsAdmin: local.obsAdmin || server.obsAdmin,
  };
}

function mergeTesteOtdrItem(
  server: TesteOtdrItemPayload,
  local: TesteOtdrItemPayload,
): TesteOtdrItemPayload {
  const localObs = String(local?.obs ?? "");
  const localObsAdmin = String(local?.obsAdmin ?? "");
  const serverObs = String(server?.obs ?? "");
  const serverObsAdmin = String(server?.obsAdmin ?? "");
  const localVazio = !local?.foto && !localObs.trim() && !localObsAdmin.trim();
  const serverPreenchido = Boolean(server?.foto || serverObs.trim() || serverObsAdmin.trim());
  if (localVazio && serverPreenchido) {
    return server;
  }
  return {
    ...server,
    foto: local?.foto ?? null,
    obs: localObs,
    obsAdmin: localObsAdmin || serverObsAdmin,
  };
}

function mergeTesteOptico(server: TesteOpticoPayload, local: TesteOpticoPayload): TesteOpticoPayload {
  return {
    cliente: {
      numeroFibra:
        local.cliente.numeroFibra === undefined
          ? server.cliente.numeroFibra
          : local.cliente.numeroFibra,
      nm1550: [
        mergeTesteOpticoFaixa(
          server.cliente.nm1550[0] ?? emptyTesteOpticoFaixa(),
          local.cliente.nm1550[0] ?? emptyTesteOpticoFaixa(),
        ),
      ],
      nm1330: [
        mergeTesteOpticoFaixa(
          server.cliente.nm1330[0] ?? emptyTesteOpticoFaixa(),
          local.cliente.nm1330[0] ?? emptyTesteOpticoFaixa(),
        ),
      ],
    },
    estacao: {
      numeroFibra:
        local.estacao.numeroFibra === undefined
          ? server.estacao.numeroFibra
          : local.estacao.numeroFibra,
      nm1550: [
        mergeTesteOpticoItem(
          server.estacao.nm1550[0] ?? emptyTesteOpticoItem(),
          local.estacao.nm1550[0] ?? emptyTesteOpticoItem(),
        ),
      ],
      nm1330: [
        mergeTesteOpticoItem(
          server.estacao.nm1330[0] ?? emptyTesteOpticoItem(),
          local.estacao.nm1330[0] ?? emptyTesteOpticoItem(),
        ),
      ],
    },
  };
}

function mergeTestePotencia(
  server: TestePotenciaPayload,
  local: TestePotenciaPayload,
): TestePotenciaPayload {
  return {
    comprimentoTrechoKm: campoOuServidor(
      local.comprimentoTrechoKm ?? "",
      server.comprimentoTrechoKm ?? "",
    ),
    otdr: mergeById(server.otdr, local.otdr, mergeTesteOtdrItem),
  };
}

function campoOuServidor(local: string, server: string): string {
  if (!local.trim() && server.trim()) return server;
  return local;
}

function mergeCoordenadas(
  server: CoordenadasPayload | undefined,
  local: CoordenadasPayload | undefined,
): CoordenadasPayload {
  const fromServer = server ?? emptyCoordenadas();
  const fromLocal = local ?? emptyCoordenadas();
  return {
    latitude: campoOuServidor(fromLocal.latitude, fromServer.latitude),
    longitude: campoOuServidor(fromLocal.longitude, fromServer.longitude),
  };
}

function mergeCordoalhaBloco(
  server: CordoalhaBlocoPayload | undefined,
  local: CordoalhaBlocoPayload | undefined,
): CordoalhaBlocoPayload {
  const fromServer = server ?? emptyCordoalhaBloco();
  const fromLocal = local ?? emptyCordoalhaBloco();
  return {
    isSim: fromLocal.isSim === undefined ? fromServer.isSim : fromLocal.isSim,
    quantidade:
      fromLocal.quantidade === undefined ? fromServer.quantidade : fromLocal.quantidade,
  };
}

function mergeQuantidadesRede(
  server: QuantidadesRedePayload | undefined,
  local: QuantidadesRedePayload | undefined,
): QuantidadesRedePayload {
  const fromServer = server ?? emptyQuantidadesRede();
  const fromLocal = local ?? emptyQuantidadesRede();
  const fiberloopInstalado = mergeCordoalhaBloco(
    fromServer.fiberloopInstalado,
    fromLocal.fiberloopInstalado,
  );
  const qtdCaixasEmendaPorAmbiente = {
    aereo:
      fromLocal.qtdCaixasEmendaPorAmbiente?.aereo === undefined
        ? fromServer.qtdCaixasEmendaPorAmbiente?.aereo ?? null
        : fromLocal.qtdCaixasEmendaPorAmbiente.aereo,
    subterraneo:
      fromLocal.qtdCaixasEmendaPorAmbiente?.subterraneo === undefined
        ? fromServer.qtdCaixasEmendaPorAmbiente?.subterraneo ?? null
        : fromLocal.qtdCaixasEmendaPorAmbiente.subterraneo,
  };
  return {
    qtdCaixasEmenda:
      (qtdCaixasEmendaPorAmbiente.aereo || 0) + (qtdCaixasEmendaPorAmbiente.subterraneo || 0) ||
      (fromLocal.qtdCaixasEmenda === undefined
        ? fromServer.qtdCaixasEmenda
        : fromLocal.qtdCaixasEmenda),
    qtdCaixasEmendaPorAmbiente,
    fiberloopInstalado,
    qtdFiberloopInstalado:
      fiberloopInstalado.isSim === true ? fiberloopInstalado.quantidade : null,
    cordoalhaLancada: mergeCordoalhaBloco(
      fromServer.cordoalhaLancada,
      fromLocal.cordoalhaLancada,
    ),
    cordoalhaExistente: {
      isSim: mergeCordoalhaBloco(
        fromServer.cordoalhaExistente,
        fromLocal.cordoalhaExistente,
      ).isSim,
      quantidade: null,
    },
    postesNovaCordoalha: mergeCordoalhaBloco(
      fromServer.postesNovaCordoalha,
      fromLocal.postesNovaCordoalha,
    ),
    postesCordoalhaExistente: {
      isSim: mergeCordoalhaBloco(
        fromServer.postesCordoalhaExistente,
        fromLocal.postesCordoalhaExistente,
      ).isSim,
      quantidade: null,
    },
    aterramento: {
      totalHastes:
        fromLocal.aterramento?.totalHastes === undefined
          ? fromServer.aterramento?.totalHastes ?? null
          : fromLocal.aterramento.totalHastes,
    },
    coordenadas: mergeCoordenadas(fromServer.coordenadas, fromLocal.coordenadas),
    caixaEmendaAcomodacao: {
      coordenadas: mergeCoordenadas(
        fromServer.caixaEmendaAcomodacao?.coordenadas,
        fromLocal.caixaEmendaAcomodacao?.coordenadas,
      ),
    },
    caixaEmendaAcomodacaoPorAmbiente: {
      aereo: {
        coordenadas: mergeCoordenadas(
          fromServer.caixaEmendaAcomodacaoPorAmbiente?.aereo?.coordenadas,
          fromLocal.caixaEmendaAcomodacaoPorAmbiente?.aereo?.coordenadas,
        ),
      },
      subterraneo: {
        coordenadas: mergeCoordenadas(
          fromServer.caixaEmendaAcomodacaoPorAmbiente?.subterraneo?.coordenadas,
          fromLocal.caixaEmendaAcomodacaoPorAmbiente?.subterraneo?.coordenadas,
        ),
      },
    },
  };
}

function mergeTestePotenciaJanela(
  server: TestePotenciaJanelaPayload,
  local: TestePotenciaJanelaPayload,
): TestePotenciaJanelaPayload {
  return {
    emendas: campoOuServidor(local.emendas, server.emendas),
    conexoes: campoOuServidor(local.conexoes, server.conexoes),
  };
}

function mergeEquipamentoRedeIps(
  server: EquipamentoRedeIpsPayload,
  local: EquipamentoRedeIpsPayload,
): EquipamentoRedeIpsPayload {
  return {
    hostName: campoOuServidor(local.hostName, server.hostName),
    ipEth: campoOuServidor(local.ipEth, server.ipEth),
    ipGw: campoOuServidor(local.ipGw, server.ipGw),
    ipDmlan: campoOuServidor(local.ipDmlan, server.ipDmlan),
  };
}

function mergeEquipamentoConexoes(
  server: EquipamentoConexoesPayload,
  local: EquipamentoConexoesPayload,
): EquipamentoConexoesPayload {
  return {
    configuracaoCliente: mergeEquipamentoRedeIps(
      server.configuracaoCliente,
      local.configuracaoCliente,
    ),
    configuracaoEstacao: mergeEquipamentoRedeIps(
      server.configuracaoEstacao,
      local.configuracaoEstacao,
    ),
  };
}

function mergeBoolNull(local: boolean | null, server: boolean | null): boolean | null {
  return local !== null ? local : server;
}

function mergeMedicaoTomada(
  server: MedicaoTomadaPayload,
  local: MedicaoTomadaPayload,
): MedicaoTomadaPayload {
  return {
    id: local.id || server.id,
    faseNeutro: campoOuServidor(local.faseNeutro, server.faseNeutro),
    terraFase: campoOuServidor(local.terraFase, server.terraFase),
    terraNeutro: campoOuServidor(local.terraNeutro, server.terraNeutro),
  };
}

function mergeInfraestrutura(
  server: InfraestruturaPayload,
  local: InfraestruturaPayload,
): InfraestruturaPayload {
  const mergedTomadas = mergeById(server.tomadas, local.tomadas, mergeMedicaoTomada);
  return {
    possuiEspacoRack: mergeBoolNull(local.possuiEspacoRack, server.possuiEspacoRack),
    tomadasNovoPadrao: mergeBoolNull(local.tomadasNovoPadrao, server.tomadasNovoPadrao),
    pinagemPadraoCorreto: mergeBoolNull(
      local.pinagemPadraoCorreto,
      server.pinagemPadraoCorreto,
    ),
    possuiNobreak: mergeBoolNull(local.possuiNobreak, server.possuiNobreak),
    localClimatizado: mergeBoolNull(local.localClimatizado, server.localClimatizado),
    tomadas: mergedTomadas.length ? mergedTomadas : [emptyMedicaoTomada()],
  };
}

function mergeMedicoes(_server: MedicoesPayload, _local: MedicoesPayload): MedicoesPayload {
  return emptyMedicoes();
}

function mergeContatos(server: ContatosPayload, local: ContatosPayload): ContatosPayload {
  return {
    cliente: {
      local: {
        nome: campoOuServidor(local.cliente.local.nome, server.cliente.local.nome),
        telefone: campoOuServidor(
          local.cliente.local.telefone,
          server.cliente.local.telefone,
        ),
      },
      remoto: {
        email: campoOuServidor(local.cliente.remoto.email, server.cliente.remoto.email),
        telefone: campoOuServidor(
          local.cliente.remoto.telefone,
          server.cliente.remoto.telefone,
        ),
      },
    },
    empresaParceira: {
      supervisor: {
        nome: campoOuServidor(
          local.empresaParceira.supervisor.nome,
          server.empresaParceira.supervisor.nome,
        ),
        telefone: campoOuServidor(
          local.empresaParceira.supervisor.telefone,
          server.empresaParceira.supervisor.telefone,
        ),
      },
      tecnico: {
        telefone: campoOuServidor(
          local.empresaParceira.tecnico.telefone,
          server.empresaParceira.tecnico.telefone,
        ),
        email: campoOuServidor(
          local.empresaParceira.tecnico.email,
          server.empresaParceira.tecnico.email,
        ),
      },
    },
  };
}

/**
 * Merge colaborativo de JSONB: arrays de caixinhas/fotos são unidos por id/path
 * (append). Itens remotos não presentes no rascunho local não são apagados,
 * para o auto-save de um técnico não sobrescrever o de outro.
 */
export function mergeEscopoPayload(
  serverRaw: EscopoPayload,
  localRaw: EscopoPayload,
): EscopoPayload {
  const fromServer = parseEscopoPayload(serverRaw);
  const fromLocal = parseEscopoPayload(localRaw);
  const gruposSimples = Object.fromEntries(
    FOTO_GRUPO_SIMPLES_KEYS.map((key) => [key, mergeFotoGrupo(fromServer[key], fromLocal[key])]),
  );
  const gruposAmbiente = Object.fromEntries(
    FOTO_GRUPO_POR_AMBIENTE_KEYS.map((key) => [
      key,
      mergeFotoGrupoPorAmbiente(fromServer[key], fromLocal[key]),
    ]),
  );
  const lancamentoCabosRe = mergeLancamentoPorAmbiente(
    fromServer.lancamentoCabosRe,
    fromLocal.lancamentoCabosRe,
  );
  const lancamentoCabosRc = mergeLancamentoPorAmbiente(
    fromServer.lancamentoCabosRc,
    fromLocal.lancamentoCabosRc,
  );

  return {
    ...fromServer,
    ...fromLocal,
    lancamentoCabosRe,
    lancamentoCabosRc,
    lancamentoRe: simDerivadoLancamento(lancamentoCabosRe),
    lancamentoRc: simDerivadoLancamento(lancamentoCabosRc),
    lancamentoReAmbiente: fromLocal.lancamentoReAmbiente ?? fromServer.lancamentoReAmbiente,
    lancamentoRcAmbiente: fromLocal.lancamentoRcAmbiente ?? fromServer.lancamentoRcAmbiente,
    relatorioEstacao: fromLocal.relatorioEstacao ?? fromServer.relatorioEstacao,
    tecnologiaAcesso: fromLocal.tecnologiaAcesso || fromServer.tecnologiaAcesso,
    estacaoEntregaAcesso: fromLocal.estacaoEntregaAcesso || fromServer.estacaoEntregaAcesso,
    metragensCabo: lancamentoCabosRe.aereo.metragens,
    metragensCaboRc: lancamentoCabosRc.aereo.metragens,
    eqClienteDgo: mergeById(fromServer.eqClienteDgo, fromLocal.eqClienteDgo, mergeDgoClienteItem),
    eqClienteEquipamentos: mergeById(
      fromServer.eqClienteEquipamentos,
      fromLocal.eqClienteEquipamentos,
      mergeEquipamentoClienteItem,
    ),
    eqEstacaoEquipamento: mergeById(
      fromServer.eqEstacaoEquipamento,
      fromLocal.eqEstacaoEquipamento,
      mergeEquipamentoClienteItem,
    ),
    eqEstacaoDgo: mergeById(fromServer.eqEstacaoDgo, fromLocal.eqEstacaoDgo, mergeDgoClienteItem),
    outrasFotos: mergeById(fromServer.outrasFotos, fromLocal.outrasFotos, mergeOutra),
    outrasFotosRc: mergeById(fromServer.outrasFotosRc, fromLocal.outrasFotosRc, mergeOutra),
    redeAcesso: mergeQuantidadesRede(fromServer.redeAcesso, fromLocal.redeAcesso),
    redeCliente: mergeQuantidadesRede(fromServer.redeCliente, fromLocal.redeCliente),
    outrasFotosEqCliente: mergeById(
      fromServer.outrasFotosEqCliente,
      fromLocal.outrasFotosEqCliente,
      mergeOutra,
    ),
    outrasFotosEqEstacao: mergeById(
      fromServer.outrasFotosEqEstacao,
      fromLocal.outrasFotosEqEstacao,
      mergeOutra,
    ),
    testeOptico: fromLocal.testeOptico,
    testePotenciaEmpresarial: fromLocal.testePotenciaEmpresarial,
    testePotenciaImplantacao: fromLocal.testePotenciaImplantacao,
    testePotencia1550: mergeTestePotenciaJanela(
      fromServer.testePotencia1550,
      fromLocal.testePotencia1550,
    ),
    testePotencia1330: mergeTestePotenciaJanela(
      fromServer.testePotencia1330,
      fromLocal.testePotencia1330,
    ),
    equipamento: mergeEquipamentoConexoes(fromServer.equipamento, fromLocal.equipamento),
    infraestrutura: mergeInfraestrutura(
      fromServer.infraestrutura,
      fromLocal.infraestrutura,
    ),
    ...gruposSimples,
    ...gruposAmbiente,
    aterramentoTerrometro: emptyFotoGrupo(),
  };
}

export function mergeRelatorioPayload(
  server: RelatorioPayload,
  local: RelatorioPayload,
): RelatorioPayload {
  const fromServer = parsePayload(server);
  const fromLocal = parsePayload(local);
  return {
    ...mergeEscopoPayload(fromServer, fromLocal),
    medicoes: mergeMedicoes(fromServer.medicoes, fromLocal.medicoes),
    contatos: mergeContatos(fromServer.contatos, fromLocal.contatos),
    pendenciasItens: mergePendenciasItens(
      fromServer.pendenciasItens ?? [],
      fromLocal.pendenciasItens ?? [],
    ),
  };
}

function preferFilled(local: string | undefined, server: string): string | undefined {
  if (local === undefined) return undefined;
  if (!local.trim() && server.trim()) return server;
  return local;
}

type DbRow = {
  id: string;
  tecnico_id: string | null;
  tecnicos_atribuidos?: string[] | null;
  tecnicos_nomes?: string[] | null;
  os_wf: string;
  cliente: string | null;
  cliente_operadora?: string | null;
  cliente_relatorio_id?: string | null;
  endereco: string | null;
  cidade: string | null;
  equipe_empreiteira: string | null;
  responsavel: string | null;
  data_inicio_execucao: string | null;
  tipo_execucao: TipoExecucao | null;
  status: RelatorioStatus;
  payload: unknown;
  motivo_pendencia: string | null;
  data_pendencia: string | null;
  avisado_at: string | null;
  fechado_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { nome: string } | null;
};

function mapRow(row: DbRow): RelatorioTransmissao {
  const tecnicos_atribuidos = Array.isArray(row.tecnicos_atribuidos)
    ? row.tecnicos_atribuidos.filter(Boolean)
    : row.tecnico_id
      ? [row.tecnico_id]
      : [];
  const tecnicos_nomes =
    Array.isArray(row.tecnicos_nomes) && row.tecnicos_nomes.length
      ? row.tecnicos_nomes
      : row.profiles?.nome
        ? [row.profiles.nome]
        : [];
  return {
    id: row.id,
    tecnico_id: row.tecnico_id,
    tecnicos_atribuidos,
    tecnicos_nomes,
    os_wf: row.os_wf,
    cliente: row.cliente ?? "",
    cliente_operadora: parseClienteOperadora(row.cliente_operadora),
    cliente_relatorio_id: row.cliente_relatorio_id ?? null,
    endereco: row.endereco ?? "",
    cidade: row.cidade ?? "",
    equipe_empreiteira: row.equipe_empreiteira ?? "",
    responsavel: row.responsavel ?? "",
    data_inicio_execucao: row.data_inicio_execucao ?? "",
    tipo_execucao: row.tipo_execucao,
    status: row.status,
    payload: parsePayload(row.payload, row.tipo_execucao),
    motivo_pendencia: row.motivo_pendencia ?? null,
    data_pendencia: row.data_pendencia ?? null,
    avisado_at: row.avisado_at,
    fechado_at: row.fechado_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tecnico_nome: tecnicos_nomes.filter(Boolean).join(", ") || row.profiles?.nome,
  };
}

const SELECT_COLS =
  "id, tecnico_id, tecnicos_atribuidos, tecnicos_nomes, os_wf, cliente, cliente_operadora, cliente_relatorio_id, endereco, cidade, equipe_empreiteira, responsavel, data_inicio_execucao, tipo_execucao, status, payload, motivo_pendencia, data_pendencia, avisado_at, fechado_at, created_at, updated_at, profiles(nome)";

const SELECT_COLS_PLAIN =
  "id, tecnico_id, tecnicos_atribuidos, tecnicos_nomes, os_wf, cliente, cliente_operadora, cliente_relatorio_id, endereco, cidade, equipe_empreiteira, responsavel, data_inicio_execucao, tipo_execucao, status, payload, motivo_pendencia, data_pendencia, avisado_at, fechado_at, created_at, updated_at";

const SELECT_COLS_LEGACY =
  "id, tecnico_id, os_wf, cliente, cliente_operadora, cliente_relatorio_id, endereco, cidade, equipe_empreiteira, responsavel, data_inicio_execucao, tipo_execucao, status, payload, motivo_pendencia, data_pendencia, avisado_at, fechado_at, created_at, updated_at, profiles(nome)";

const SELECT_COLS_LEGACY_PLAIN =
  "id, tecnico_id, os_wf, cliente, cliente_operadora, cliente_relatorio_id, endereco, cidade, equipe_empreiteira, responsavel, data_inicio_execucao, tipo_execucao, status, payload, motivo_pendencia, data_pendencia, avisado_at, fechado_at, created_at, updated_at";

export async function uploadRelatorioPhoto(
  tecnicoId: string,
  file: File,
  tag: string,
): Promise<StoredPhoto> {
  if (typeof window === "undefined") {
    throw new Error("Upload de fotos deve ocorrer no navegador.");
  }
  const supabase = getSupabaseClient();
  const path = `${tecnicoId}/relatorio-${crypto.randomUUID()}-${tag}.jpg`;
  const { error } = await supabase.storage.from("evidencias-fotos").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: "image/jpeg",
  });
  if (error) throw error;
  return { path, url: getStoragePublicUrl(path) };
}

async function selectRelatorioById(id: string) {
  const supabase = getSupabaseClient();
  const attempts = [SELECT_COLS, SELECT_COLS_PLAIN, SELECT_COLS_LEGACY, SELECT_COLS_LEGACY_PLAIN];
  let lastError: { message: string } | null = null;
  for (const cols of attempts) {
    const { data, error } = await supabase
      .from("relatorios_transmissao")
      .select(cols)
      .eq("id", id)
      .single();
    if (!error && data) return mapRow(data as DbRow);
    lastError = error;
  }
  throw lastError ?? new Error("Relatório não encontrado.");
}

export async function fetchRelatorioTransmissaoById(
  id: string,
): Promise<RelatorioTransmissao> {
  return selectRelatorioById(id);
}

export async function findRelatorioAbertoPorOsWf(
  osWf: string,
): Promise<RelatorioTransmissao | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .select(SELECT_COLS)
    .eq("os_wf", osWf.trim())
    .in("status", ["em_aberto", "avisado", "pendente"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .select(SELECT_COLS_PLAIN)
      .eq("os_wf", osWf.trim())
      .in("status", ["em_aberto", "avisado", "pendente"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return fallback.data ? mapRow(fallback.data as DbRow) : null;
  }
  return data ? mapRow(data as DbRow) : null;
}

export async function findRelatorioFechadoPorOsWf(osWf: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .select("id")
    .eq("os_wf", osWf.trim())
    .eq("status", "fechado")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function resolveClienteRelatorioId(
  clienteOperadora: ClienteOperadora,
): Promise<string | null> {
  const nome = parseClienteOperadora(clienteOperadora);
  const slug = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  try {
    const supabase = getSupabaseClient();
    const bySlug = await supabase
      .from("clientes_relatorio")
      .select("id")
      .eq("slug", slug)
      .eq("ativo", true)
      .maybeSingle();
    if (!bySlug.error && bySlug.data?.id) return bySlug.data.id as string;

    const byNome = await supabase
      .from("clientes_relatorio")
      .select("id")
      .ilike("nome", nome)
      .eq("ativo", true)
      .maybeSingle();
    if (!byNome.error && byNome.data?.id) return byNome.data.id as string;
  } catch {
    /* catálogo ainda indisponível — segue só com cliente_operadora */
  }
  return null;
}

export async function despacharRelatorioTransmissao(input: {
  osWf: string;
  cliente: string;
  clienteOperadora?: ClienteOperadora | string;
  endereco: string;
  cidade: string;
  equipeEmpreiteira: string;
  dataInicioExecucao: string;
  tipoExecucao: TipoExecucao;
  tecnicos: { id: string; nome: string }[];
}): Promise<RelatorioTransmissao> {
  const os = input.osWf.trim();
  const cliente = input.cliente.trim();
  const clienteOperadora = parseClienteOperadora(input.clienteOperadora);
  const endereco = input.endereco.trim();
  const cidade = input.cidade.trim();
  const equipeEmpreiteira = input.equipeEmpreiteira.trim();
  const dataInicio = input.dataInicioExecucao.trim();
  if (!os) throw new Error("Informe a OS/WF.");
  const unique = new Map<string, { id: string; nome: string }>();
  for (const tecnico of input.tecnicos) {
    if (tecnico.id) unique.set(tecnico.id, tecnico);
  }
  const tecnicos = [...unique.values()];
  if (tecnicos.length === 0) {
    throw new Error("Selecione ao menos um técnico na equipe.");
  }
  if (input.tipoExecucao !== "implantacao" && input.tipoExecucao !== "empresarial") {
    throw new Error("Selecione o tipo de execução.");
  }

  if (await findRelatorioAbertoPorOsWf(os)) {
    throw new Error("Já existe uma OS em aberto com este número.");
  }
  if (await findRelatorioFechadoPorOsWf(os)) {
    throw new Error("Esta OS/WF já foi fechada. Peça ao admin para reabrir se necessário.");
  }

  const supabase = getSupabaseClient();
  const clienteRelatorioId = await resolveClienteRelatorioId(clienteOperadora);
  const insertRow = {
    tecnico_id: tecnicos[0].id,
    tecnicos_atribuidos: tecnicos.map((t) => t.id),
    tecnicos_nomes: tecnicos.map((t) => t.nome),
    os_wf: os,
    cliente: cliente || "",
    cliente_operadora: clienteOperadora,
    cliente_relatorio_id: clienteRelatorioId,
    endereco: endereco || "",
    cidade: cidade || "",
    equipe_empreiteira: equipeEmpreiteira || "",
    data_inicio_execucao: dataInicio || null,
    tipo_execucao: input.tipoExecucao,
    status: "em_aberto" as const,
    payload: emptyRelatorioPayload(),
  };

  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .insert(insertRow)
    .select(SELECT_COLS)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .insert(insertRow)
      .select(SELECT_COLS_PLAIN)
      .single();
    if (fallback.error) throw fallback.error;
    return mapRow(fallback.data as DbRow);
  }
  return mapRow(data as DbRow);
}

function logSupabaseError(context: string, error: unknown) {
  const err = error as {
    message?: string;
    code?: string;
    details?: string;
    hint?: string;
    status?: number;
  };
  console.error("Erro Supabase:", {
    context,
    message: err?.message ?? String(error),
    code: err?.code,
    details: err?.details,
    hint: err?.hint,
    status: err?.status,
    error,
  });
}

function omitUndefined<T extends Record<string, unknown>>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== undefined),
  ) as T;
}

function toDateColumn(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function jsonSafePayload(
  payload: RelatorioPayload,
  tipoExecucao?: TipoExecucao | null,
): RelatorioPayload {
  try {
    const raw = JSON.parse(
      JSON.stringify(payload, (_key, value) => {
        if (value === undefined) return null;
        if (typeof value === "number" && !Number.isFinite(value)) return null;
        if (typeof File !== "undefined" && value instanceof File) return null;
        if (typeof Blob !== "undefined" && value instanceof Blob) return null;
        return value;
      }),
    );
    return parsePayload(raw, tipoExecucao);
  } catch (error) {
    logSupabaseError("sanitizeRelatorioPayload", error);
    return parsePayload(payload, tipoExecucao);
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 700,
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        onRetry?.(attempt + 1, error);
        await new Promise((resolve) => {
          globalThis.setTimeout(resolve, delayMs * 2 ** attempt);
        });
      }
    }
  }
  throw lastError;
}

export async function patchRelatorioDraft(
  id: string,
  patch: RelatorioDraftPatch,
): Promise<RelatorioTransmissao> {
  if (!id?.trim()) {
    throw new Error("Relatório sem id válido — auto-save abortado.");
  }

  const latest = await fetchRelatorioTransmissaoById(id);
  let payload: RelatorioPayload | undefined;
  if (patch.payload) {
    try {
      payload = jsonSafePayload(
        mergeRelatorioPayload(latest.payload, patch.payload),
        latest.tipo_execucao,
      );
    } catch (error) {
      logSupabaseError("mergeRelatorioPayload", error);
      payload = jsonSafePayload(patch.payload, latest.tipo_execucao);
    }
  }

  const merged = omitUndefined({
    cliente: preferFilled(patch.cliente, latest.cliente),
    endereco: preferFilled(patch.endereco, latest.endereco),
    cidade: preferFilled(patch.cidade, latest.cidade),
    equipe_empreiteira: preferFilled(patch.equipe_empreiteira, latest.equipe_empreiteira),
    responsavel: preferFilled(patch.responsavel, latest.responsavel),
    data_inicio_execucao:
      patch.data_inicio_execucao === undefined
        ? undefined
        : toDateColumn(patch.data_inicio_execucao) ?? toDateColumn(latest.data_inicio_execucao),
    payload,
  } as Record<string, unknown>);

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .update(merged)
    .eq("id", id)
    .neq("status", "fechado")
    .select(SELECT_COLS)
    .maybeSingle();
  if (!error && data) return mapRow(data as DbRow);

  if (error) logSupabaseError("patchRelatorioDraft.select", error);

  const fallback = await supabase
    .from("relatorios_transmissao")
    .update(merged)
    .eq("id", id)
    .neq("status", "fechado")
    .select(SELECT_COLS_PLAIN)
    .maybeSingle();
  if (fallback.error) {
    logSupabaseError("patchRelatorioDraft.fallback", fallback.error);
    throw fallback.error;
  }
  if (!fallback.data) {
    const blocked = {
      message:
        "Atualização bloqueada (0 linhas). Sessão, atribuição da OS ou RLS podem ter recusado o UPDATE.",
      code: "PGRST116",
      details: `id=${id}`,
      hint: "Confirme se o técnico está em tecnicos_atribuidos ou em tecnico_id e se o status não está fechado.",
    };
    logSupabaseError("patchRelatorioDraft.zeroRows", blocked);
    throw blocked;
  }
  return mapRow(fallback.data as DbRow);
}

export async function avisarConclusaoRelatorio(id: string): Promise<RelatorioTransmissao> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .update({
      status: "avisado",
      avisado_at: new Date().toISOString(),
      motivo_pendencia: null,
      data_pendencia: null,
    })
    .eq("id", id)
    .neq("status", "fechado")
    .select(SELECT_COLS)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .update({
      status: "avisado",
      avisado_at: new Date().toISOString(),
      motivo_pendencia: null,
      data_pendencia: null,
    })
      .eq("id", id)
      .neq("status", "fechado")
      .select(SELECT_COLS_PLAIN)
      .single();
    if (fallback.error) throw fallback.error;
    return mapRow(fallback.data as DbRow);
  }
  return mapRow(data as DbRow);
}

export async function fetchMeusRelatoriosTransmissao(
  tecnicoId: string,
): Promise<RelatorioTransmissao[]> {
  const supabase = getSupabaseClient();
  const assigned = (rows: RelatorioTransmissao[]) =>
    rows.filter(
      (row) =>
        row.tecnicos_atribuidos.includes(tecnicoId) || row.tecnico_id === tecnicoId,
    );

  const withArray = await supabase
    .from("relatorios_transmissao")
    .select(SELECT_COLS)
    .contains("tecnicos_atribuidos", [tecnicoId])
    .order("updated_at", { ascending: false });
  if (!withArray.error) {
    return assigned((withArray.data ?? []).map((row) => mapRow(row as DbRow)));
  }

  const fallback = await supabase
    .from("relatorios_transmissao")
    .select(SELECT_COLS_LEGACY)
    .eq("tecnico_id", tecnicoId)
    .order("updated_at", { ascending: false });
  if (fallback.error) throw fallback.error;
  return assigned((fallback.data ?? []).map((row) => mapRow(row as DbRow)));
}

export async function fetchRelatoriosTransmissaoAdmin(): Promise<RelatorioTransmissao[]> {
  const supabase = getSupabaseClient();
  const primary = await supabase
    .from("relatorios_transmissao")
    .select(SELECT_COLS)
    .order("updated_at", { ascending: false });
  if (!primary.error) {
    return (primary.data ?? []).map((row) => mapRow(row as DbRow));
  }
  const fallback = await supabase
    .from("relatorios_transmissao")
    .select(SELECT_COLS_LEGACY)
    .order("updated_at", { ascending: false });
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []).map((row) => mapRow(row as DbRow));
}

export async function fecharRelatorioTransmissao(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("relatorios_transmissao")
    .update({
      status: "fechado",
      fechado_at: new Date().toISOString(),
      motivo_pendencia: null,
      data_pendencia: null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function sinalizarPendenciaRelatorio(
  id: string,
  motivo: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("relatorios_transmissao")
    .update({
      status: "pendente",
      motivo_pendencia: motivo.trim() || "Pendência sinalizada pela supervisão.",
      data_pendencia: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "fechado");
  if (error) throw error;
}

/** Confirma pendências granulares: merge anti-dupe no payload + status pendente. */
export async function confirmarPendenciasItensRelatorio(
  id: string,
  novas: PendenciaItemDef[],
): Promise<RelatorioTransmissao> {
  const latest = await fetchRelatorioTransmissaoById(id);
  const merged = mergePendenciasItens(latest.payload.pendenciasItens ?? [], novas);
  const nextPayload: RelatorioPayload = {
    ...latest.payload,
    pendenciasItens: merged,
  };
  const motivo = motivoPendenciaFromItens(merged);
  const supabase = getSupabaseClient();
  const safePayload = jsonSafePayload(nextPayload, latest.tipo_execucao);
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .update({
      payload: safePayload,
      status: "pendente",
      motivo_pendencia: motivo,
      data_pendencia: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "fechado")
    .select(SELECT_COLS)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .update({
        payload: safePayload,
        status: "pendente",
        motivo_pendencia: motivo,
        data_pendencia: new Date().toISOString(),
      })
      .eq("id", id)
      .neq("status", "fechado")
      .select(SELECT_COLS_PLAIN)
      .single();
    if (fallback.error) throw fallback.error;
    return mapRow(fallback.data as DbRow);
  }
  return mapRow(data as DbRow);
}

export async function patchRelatorioPayloadAdmin(
  id: string,
  payload: RelatorioPayload,
): Promise<RelatorioTransmissao> {
  const supabase = getSupabaseClient();
  const latest = await fetchRelatorioTransmissaoById(id);
  const safePayload = jsonSafePayload(payload, latest.tipo_execucao);
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .update({ payload: safePayload })
    .eq("id", id)
    .select(SELECT_COLS)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .update({ payload: safePayload })
      .eq("id", id)
      .select(SELECT_COLS_PLAIN)
      .single();
    if (fallback.error) throw fallback.error;
    return mapRow(fallback.data as DbRow);
  }
  return mapRow(data as DbRow);
}

export async function patchRelatorioCadastroAdmin(
  id: string,
  input: {
    cliente: string;
    clienteOperadora?: ClienteOperadora | string;
    endereco: string;
    cidade: string;
    equipeEmpreiteira: string;
    dataInicioExecucao: string;
    tipoExecucao: TipoExecucao;
    tecnicos: { id: string; nome: string }[];
  },
): Promise<RelatorioTransmissao> {
  const unique = new Map<string, { id: string; nome: string }>();
  for (const tecnico of input.tecnicos) {
    if (tecnico.id) unique.set(tecnico.id, tecnico);
  }
  const tecnicos = [...unique.values()];
  if (tecnicos.length === 0) {
    throw new Error("Selecione ao menos um técnico na equipe.");
  }
  if (input.tipoExecucao !== "implantacao" && input.tipoExecucao !== "empresarial") {
    throw new Error("Selecione o tipo de execução.");
  }

  const updateRow = {
    cliente: input.cliente.trim() || "",
    cliente_operadora: parseClienteOperadora(input.clienteOperadora),
    cliente_relatorio_id: await resolveClienteRelatorioId(
      parseClienteOperadora(input.clienteOperadora),
    ),
    endereco: input.endereco.trim() || "",
    cidade: input.cidade.trim() || "",
    equipe_empreiteira: input.equipeEmpreiteira.trim() || "",
    data_inicio_execucao: input.dataInicioExecucao.trim() || null,
    tipo_execucao: input.tipoExecucao,
    tecnico_id: tecnicos[0].id,
    tecnicos_atribuidos: tecnicos.map((t) => t.id),
    tecnicos_nomes: tecnicos.map((t) => t.nome),
  };

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .update(updateRow)
    .eq("id", id)
    .select(SELECT_COLS)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .update(updateRow)
      .eq("id", id)
      .select(SELECT_COLS_PLAIN)
      .single();
    if (fallback.error) throw fallback.error;
    return mapRow(fallback.data as DbRow);
  }
  return mapRow(data as DbRow);
}

export async function excluirRelatorioTransmissao(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("relatorios_transmissao").delete().eq("id", id);
  if (error) throw error;
}

export type RelatorioFotoCategoria =
  | RelatorioFotoGrupoKey
  | "eqClienteDgo"
  | "eqClienteEquipamentos"
  | "eqEstacaoEquipamento"
  | "eqEstacaoDgo"
  | "metragensCabo"
  | "outrasFotos"
  | "metragensCaboRc"
  | "outrasFotosRc"
  | "outrasFotosEqCliente"
  | "outrasFotosEqEstacao";

export function appendStoredPhotoToEscopo(
  payload: EscopoPayload,
  categoria: RelatorioFotoCategoria,
  stored: StoredPhoto,
  ambiente: AmbienteRede = "aereo",
): EscopoPayload {
  if (categoria === "metragensCabo" || categoria === "metragensCaboRc") {
    const dualKey = categoria === "metragensCabo" ? "lancamentoCabosRe" : "lancamentoCabosRc";
    const dual = payload[dualKey];
    const lado = dual[ambiente];
    const list = (lado.metragens.length
      ? lado.metragens.map((item) => ({ ...item }))
      : [emptyCaboMetragem()]);
    const last = list[list.length - 1];
    if (!last.fotoInicio) last.fotoInicio = stored;
    else if (!last.fotoFim) last.fotoFim = stored;
    else list.push({ ...emptyCaboMetragem(), fotoInicio: stored });
    const nextDual = {
      ...dual,
      [ambiente]: { ...lado, metragens: list },
    };
    return {
      ...payload,
      [dualKey]: nextDual,
      lancamentoRe:
        dualKey === "lancamentoCabosRe" ? simDerivadoLancamento(nextDual) : payload.lancamentoRe,
      lancamentoRc:
        dualKey === "lancamentoCabosRc" ? simDerivadoLancamento(nextDual) : payload.lancamentoRc,
      metragensCabo:
        dualKey === "lancamentoCabosRe" ? nextDual.aereo.metragens : payload.metragensCabo,
      metragensCaboRc:
        dualKey === "lancamentoCabosRc" ? nextDual.aereo.metragens : payload.metragensCaboRc,
    };
  }
  if (categoria === "eqClienteEquipamentos" || categoria === "eqEstacaoEquipamento") {
    const list = payload[categoria].length
      ? payload[categoria].map((item) => ({ ...item }))
      : [emptyEquipamentoClienteItem()];
    const last = list[list.length - 1];
    if (!last.foto) last.foto = stored;
    else if (!last.etiqueta) last.etiqueta = stored;
    else list.push({ ...emptyEquipamentoClienteItem(), foto: stored });
    return { ...payload, [categoria]: list };
  }
  if (categoria === "eqClienteDgo" || categoria === "eqEstacaoDgo") {
    const list = payload[categoria].length
      ? payload[categoria].map((item) => ({ ...item }))
      : [emptyDgoClienteItem()];
    const last = list[list.length - 1];
    if (!last.foto) last.foto = stored;
    else if (!last.etiqueta) last.etiqueta = stored;
    else list.push({ ...emptyDgoClienteItem(), foto: stored });
    return { ...payload, [categoria]: list };
  }
  if (
    categoria === "outrasFotos" ||
    categoria === "outrasFotosRc" ||
    categoria === "outrasFotosEqCliente" ||
    categoria === "outrasFotosEqEstacao"
  ) {
    return {
      ...payload,
      [categoria]: [
        ...payload[categoria],
        { id: crypto.randomUUID(), ref: "Admin", foto: stored, obs: "", obsAdmin: "" },
      ],
    };
  }
  const grupo = payload[categoria];
  if (looksLikeFotoGrupoPorAmbiente(grupo)) {
    const lado = grupo[ambiente];
    return {
      ...payload,
      [categoria]: {
        ...grupo,
        [ambiente]: { ...lado, fotos: [...lado.fotos, stored] },
      },
    };
  }
  return {
    ...payload,
    [categoria]: { ...grupo, fotos: [...(grupo as FotoGrupoPayload).fotos, stored] },
  };
}

export function appendStoredPhotoToPayload(
  payload: RelatorioPayload,
  categoria: RelatorioFotoCategoria,
  stored: StoredPhoto,
  ambiente: AmbienteRede = "aereo",
): RelatorioPayload {
  const next = appendStoredPhotoToEscopo(payload, categoria, stored, ambiente);
  return {
    ...next,
    medicoes: payload.medicoes,
    contatos: payload.contatos,
  };
}

export function removeExtraById<T extends { id: string }>(items: T[], id: string): T[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 1) return items;
  return items.filter((item) => item.id !== id);
}

export async function deleteRelatorioPhoto(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from("evidencias-fotos").remove([path]);
  if (error) console.warn("Falha ao remover foto do storage:", error.message);
}

export function replaceFotoGrupoAt(
  grupo: FotoGrupoPayload,
  index: number,
  stored: StoredPhoto,
): FotoGrupoPayload {
  const fotos = grupo.fotos.map((foto, i) => (i === index ? stored : foto));
  return { ...grupo, fotos };
}

export function removeFotoGrupoAt(grupo: FotoGrupoPayload, index: number): FotoGrupoPayload {
  if (index < 0) return grupo;
  return { ...grupo, fotos: grupo.fotos.filter((_, i) => i !== index) };
}

export function subscribeRelatorioTransmissaoById(
  id: string,
  onUpdate: (row: RelatorioTransmissao) => void,
): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`relatorio_sync_${id}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "relatorios_transmissao",
        filter: `id=eq.${id}`,
      },
      (payload) => {
        if (!payload.new || typeof payload.new !== "object") return;
        onUpdate(mapRow(payload.new as DbRow));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeRelatoriosTransmissao(
  onChange: () => void,
): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel("relatorios-transmissao-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "relatorios_transmissao" },
      () => {
        onChange();
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
