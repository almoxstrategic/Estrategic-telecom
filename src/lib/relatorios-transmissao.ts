import { getStoragePublicUrl, getSupabaseClient } from "./supabase";

export type RelatorioStatus = "em_aberto" | "avisado" | "fechado" | "pendente";
export type TipoExecucao = "implantacao" | "empresarial";

export type StoredPhoto = {
  url: string;
  path: string;
};

export type FotoGrupoPayload = {
  fotos: StoredPhoto[];
  obs: string;
  obsAdmin: string;
};

export type OutraFotoPayload = {
  id: string;
  ref: string;
  foto: StoredPhoto | null;
  obs: string;
  obsAdmin: string;
};

export type CaboMetragemPayload = {
  id: string;
  tipoCabo: string;
  metragem: string;
  fotoInicio: StoredPhoto | null;
  fotoFim: StoredPhoto | null;
  obs: string;
  obsAdmin: string;
};

export type RelatorioFotoGrupoKeyRe =
  | "posteConexao"
  | "caixaEmenda"
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
  | "rcEntradaExterna";

export type RelatorioFotoGrupoKeyEqCliente =
  | "eqClienteFachada"
  | "eqClienteAmbiente"
  | "eqClienteRack"
  | "eqClienteDgo"
  | "eqClienteEquipamentos"
  | "eqClienteEtiqueta"
  | "eqClienteSgp";

export type RelatorioFotoGrupoKeyEqEstacao =
  | "eqEstacaoGeral"
  | "eqEstacaoRack"
  | "eqEstacaoEquipamento"
  | "eqEstacaoEtiqueta"
  | "eqEstacaoDgo";

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
  id: string;
  dbm: string;
  foto: StoredPhoto | null;
  obs: string;
  obsAdmin: string;
};

export type TesteOpticoPayload = {
  cliente: {
    numeroFibra: number | null;
    nm1550: TesteOpticoFaixaPayload;
    nm1330: TesteOpticoFaixaPayload;
  };
  estacao: {
    numeroFibra: number | null;
    nm1550: TesteOpticoItemPayload[];
    nm1330: TesteOpticoItemPayload[];
  };
};

export type TesteOtdrItemPayload = {
  id: string;
  distancia: string;
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
  const texto = raw.trim().replace(/\s/g, "").replace(",", ".");
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
  const texto = raw?.trim() ?? "";
  return texto ? texto : "—";
}

export function emptyTesteOpticoFaixa(): TesteOpticoFaixaPayload {
  return { dbm: "", fotos: [], obs: "", obsAdmin: "" };
}

export function emptyTesteOpticoItem(): TesteOpticoItemPayload {
  return { id: crypto.randomUUID(), dbm: "", foto: null, obs: "", obsAdmin: "" };
}

const DEFAULT_OTDR_IDS = ["otdr-1", "otdr-2"] as const;

export function emptyTesteOtdrItem(id?: string): TesteOtdrItemPayload {
  return { id: id ?? crypto.randomUUID(), distancia: "", foto: null, obs: "", obsAdmin: "" };
}

export function emptyTesteOptico(): TesteOpticoPayload {
  return {
    cliente: {
      numeroFibra: null,
      nm1550: emptyTesteOpticoFaixa(),
      nm1330: emptyTesteOpticoFaixa(),
    },
    estacao: {
      numeroFibra: null,
      nm1550: [emptyTesteOpticoItem()],
      nm1330: [emptyTesteOpticoItem()],
    },
  };
}

export function emptyTestePotencia(): TestePotenciaPayload {
  return {
    comprimentoTrechoKm: "",
    otdr: [emptyTesteOtdrItem(DEFAULT_OTDR_IDS[0]), emptyTesteOtdrItem(DEFAULT_OTDR_IDS[1])],
  };
}

export type QuantidadesRedePayload = {
  qtdCaixasEmenda: number | null;
};

export type RelatorioPayload = {
  lancamentoRe: boolean | null;
  metragensCabo: CaboMetragemPayload[];
  posteConexao: FotoGrupoPayload;
  caixaEmenda: FotoGrupoPayload;
  plaquetaIdentificacao: FotoGrupoPayload;
  novoAterramentoPoste: FotoGrupoPayload;
  aterramentoTerrometro: FotoGrupoPayload;
  posicaoConexaoEstacao: FotoGrupoPayload;
  etiquetaIdentificacao: FotoGrupoPayload;
  sobraTecnica: FotoGrupoPayload;
  outrasFotos: OutraFotoPayload[];
  redeAcesso: QuantidadesRedePayload;
  tecnologiaAcesso: string;
  lancamentoRc: boolean | null;
  metragensCaboRc: CaboMetragemPayload[];
  rcPosteConexao: FotoGrupoPayload;
  rcCaixaEmenda: FotoGrupoPayload;
  rcTerminacaoCabo: FotoGrupoPayload;
  rcPlaquetaIdentificacao: FotoGrupoPayload;
  rcEntradaInterna: FotoGrupoPayload;
  rcEntradaExterna: FotoGrupoPayload;
  outrasFotosRc: OutraFotoPayload[];
  redeCliente: QuantidadesRedePayload;
  eqClienteFachada: FotoGrupoPayload;
  eqClienteAmbiente: FotoGrupoPayload;
  eqClienteRack: FotoGrupoPayload;
  eqClienteDgo: FotoGrupoPayload;
  eqClienteEquipamentos: FotoGrupoPayload;
  eqClienteEtiqueta: FotoGrupoPayload;
  eqClienteSgp: FotoGrupoPayload;
  outrasFotosEqCliente: OutraFotoPayload[];
  relatorioEstacao: boolean | null;
  estacaoEntregaAcesso: string;
  eqEstacaoGeral: FotoGrupoPayload;
  eqEstacaoRack: FotoGrupoPayload;
  eqEstacaoEquipamento: FotoGrupoPayload;
  eqEstacaoEtiqueta: FotoGrupoPayload;
  eqEstacaoDgo: FotoGrupoPayload;
  outrasFotosEqEstacao: OutraFotoPayload[];
  testeOptico: TesteOpticoPayload;
  testePotenciaEmpresarial: TestePotenciaPayload;
  testePotenciaImplantacao: TestePotenciaPayload;
  testePotencia1550: TestePotenciaJanelaPayload;
  testePotencia1330: TestePotenciaJanelaPayload;
};

export function emptyCaboMetragem(): CaboMetragemPayload {
  return {
    id: crypto.randomUUID(),
    tipoCabo: "",
    metragem: "",
    fotoInicio: null,
    fotoFim: null,
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
  cliente: string;
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

export function emptyQuantidadesRede(): QuantidadesRedePayload {
  return { qtdCaixasEmenda: null };
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
  const emendas = totalEmendasCalculado(redeAcesso.qtdCaixasEmenda, redeCliente.qtdCaixasEmenda);
  return {
    emendas: String(emendas),
    conexoes: String(totalConexoesCalculado(emendas)),
  };
}

export function emptyRelatorioPayload(): RelatorioPayload {
  return {
    lancamentoRe: null,
    metragensCabo: [],
    posteConexao: emptyFotoGrupo(),
    caixaEmenda: emptyFotoGrupo(),
    plaquetaIdentificacao: emptyFotoGrupo(),
    novoAterramentoPoste: emptyFotoGrupo(),
    aterramentoTerrometro: emptyFotoGrupo(),
    posicaoConexaoEstacao: emptyFotoGrupo(),
    etiquetaIdentificacao: emptyFotoGrupo(),
    sobraTecnica: emptyFotoGrupo(),
    outrasFotos: [],
    redeAcesso: emptyQuantidadesRede(),
    tecnologiaAcesso: "",
    lancamentoRc: null,
    metragensCaboRc: [],
    rcPosteConexao: emptyFotoGrupo(),
    rcCaixaEmenda: emptyFotoGrupo(),
    rcTerminacaoCabo: emptyFotoGrupo(),
    rcPlaquetaIdentificacao: emptyFotoGrupo(),
    rcEntradaInterna: emptyFotoGrupo(),
    rcEntradaExterna: emptyFotoGrupo(),
    outrasFotosRc: [],
    redeCliente: emptyQuantidadesRede(),
    eqClienteFachada: emptyFotoGrupo(),
    eqClienteAmbiente: emptyFotoGrupo(),
    eqClienteRack: emptyFotoGrupo(),
    eqClienteDgo: emptyFotoGrupo(),
    eqClienteEquipamentos: emptyFotoGrupo(),
    eqClienteEtiqueta: emptyFotoGrupo(),
    eqClienteSgp: emptyFotoGrupo(),
    outrasFotosEqCliente: [],
    relatorioEstacao: false,
    estacaoEntregaAcesso: "",
    eqEstacaoGeral: emptyFotoGrupo(),
    eqEstacaoRack: emptyFotoGrupo(),
    eqEstacaoEquipamento: emptyFotoGrupo(),
    eqEstacaoEtiqueta: emptyFotoGrupo(),
    eqEstacaoDgo: emptyFotoGrupo(),
    outrasFotosEqEstacao: [],
    testeOptico: emptyTesteOptico(),
    testePotenciaEmpresarial: emptyTestePotencia(),
    testePotenciaImplantacao: emptyTestePotencia(),
    testePotencia1550: emptyTestePotenciaJanela(),
    testePotencia1330: emptyTestePotenciaJanela(),
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
    return {
      id: cabo.id || crypto.randomUUID(),
      tipoCabo: cabo.tipoCabo ?? "",
      metragem: cabo.metragem ?? "",
      fotoInicio: cabo.fotoInicio ?? null,
      fotoFim: cabo.fotoFim ?? null,
      obs: cabo.obs ?? "",
      obsAdmin: readObsAdmin(cabo),
    };
  });
}

function parseCabos(raw: unknown): CaboMetragemPayload[] {
  if (!raw || typeof raw !== "object") return [];
  const src = raw as Partial<RelatorioPayload> & { metragemRe?: LegacyMetragemRe };
  const fromArray = parseCabosList(src.metragensCabo);
  if (fromArray.length > 0) return fromArray;
  const old = src.metragemRe;
  if (old && (old.fotoInicio || old.fotoFim || old.metragem || old.obs)) {
    return [
      {
        id: crypto.randomUUID(),
        tipoCabo: "",
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

function parseQuantidadesRede(raw: unknown): QuantidadesRedePayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<QuantidadesRedePayload>;
  return {
    qtdCaixasEmenda: parseQtdInteiro(src.qtdCaixasEmenda),
  };
}

function parseFotoGrupo(
  base: FotoGrupoPayload,
  raw: FotoGrupoPayload | undefined,
): FotoGrupoPayload {
  return {
    ...base,
    ...raw,
    fotos: raw?.fotos ?? [],
    obs: raw?.obs ?? "",
    obsAdmin: readObsAdmin(raw),
  };
}

function parseStoredPhoto(raw: unknown): StoredPhoto | null {
  if (!raw || typeof raw !== "object") return null;
  const foto = raw as Partial<StoredPhoto>;
  if (!foto.url && !foto.path) return null;
  return { url: foto.url ?? "", path: foto.path ?? "" };
}

function parseFotosList(raw: unknown): StoredPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseStoredPhoto).filter((foto): foto is StoredPhoto => Boolean(foto));
}

function parseTesteOpticoFaixa(raw: unknown): TesteOpticoFaixaPayload {
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<TesteOpticoFaixaPayload>;
  return {
    dbm: src.dbm ?? (src as { dBm?: string }).dBm ?? "",
    fotos: parseFotosList(src.fotos),
    obs: src.obs ?? "",
    obsAdmin: readObsAdmin(src),
  };
}

function parseTesteOpticoItems(raw: unknown): TesteOpticoItemPayload[] {
  const list = Array.isArray(raw)
    ? raw.map((item) => {
        const src = (item ?? {}) as Partial<TesteOpticoItemPayload>;
        return {
          id: src.id || crypto.randomUUID(),
          dbm: src.dbm ?? (src as { dBm?: string }).dBm ?? "",
          foto: parseStoredPhoto(src.foto),
          obs: src.obs ?? "",
          obsAdmin: readObsAdmin(src),
        };
      })
    : [];
  return list.length > 0 ? list : [emptyTesteOpticoItem()];
}

function parseTesteOtdrItems(raw: unknown): TesteOtdrItemPayload[] {
  const list = Array.isArray(raw)
    ? raw.map((item) => {
        const src = (item ?? {}) as Partial<TesteOtdrItemPayload>;
        return {
          id: src.id || crypto.randomUUID(),
          distancia: src.distancia ?? "",
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
  const src = (raw && typeof raw === "object" ? raw : {}) as Partial<TesteOpticoPayload>;
  return {
    cliente: {
      numeroFibra: parseNumeroFibra(src.cliente?.numeroFibra),
      nm1550: parseTesteOpticoFaixa(src.cliente?.nm1550),
      nm1330: parseTesteOpticoFaixa(src.cliente?.nm1330),
    },
    estacao: {
      numeroFibra: parseNumeroFibra(src.estacao?.numeroFibra),
      nm1550: parseTesteOpticoItems(src.estacao?.nm1550),
      nm1330: parseTesteOpticoItems(src.estacao?.nm1330),
    },
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
  src: Partial<RelatorioPayload> & {
    testePotencia?: unknown;
    testeOptico?: { comprimentoTrechoKm?: unknown };
  },
  tipoExecucao?: TipoExecucao | null,
): Pick<RelatorioPayload, "testePotenciaEmpresarial" | "testePotenciaImplantacao"> {
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

function parsePayload(raw: unknown, tipoExecucao?: TipoExecucao | null): RelatorioPayload {
  const base = emptyRelatorioPayload();
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Partial<RelatorioPayload> & { testePotencia?: unknown };
  return {
    ...base,
    lancamentoRe: src.lancamentoRe ?? null,
    metragensCabo: parseCabos(raw),
    posteConexao: parseFotoGrupo(base.posteConexao, src.posteConexao),
    caixaEmenda: parseFotoGrupo(base.caixaEmenda, src.caixaEmenda),
    plaquetaIdentificacao: parseFotoGrupo(base.plaquetaIdentificacao, src.plaquetaIdentificacao),
    novoAterramentoPoste: parseFotoGrupo(base.novoAterramentoPoste, src.novoAterramentoPoste),
    aterramentoTerrometro: parseFotoGrupo(base.aterramentoTerrometro, src.aterramentoTerrometro),
    posicaoConexaoEstacao: parseFotoGrupo(base.posicaoConexaoEstacao, src.posicaoConexaoEstacao),
    etiquetaIdentificacao: parseFotoGrupo(base.etiquetaIdentificacao, src.etiquetaIdentificacao),
    sobraTecnica: parseFotoGrupo(base.sobraTecnica, src.sobraTecnica),
    outrasFotos: parseOutrasFotos(src.outrasFotos),
    redeAcesso: parseQuantidadesRede(src.redeAcesso),
    tecnologiaAcesso: src.tecnologiaAcesso ?? "",
    lancamentoRc: src.lancamentoRc ?? null,
    metragensCaboRc: parseCabosList(src.metragensCaboRc),
    rcPosteConexao: parseFotoGrupo(base.rcPosteConexao, src.rcPosteConexao),
    rcCaixaEmenda: parseFotoGrupo(base.rcCaixaEmenda, src.rcCaixaEmenda),
    rcTerminacaoCabo: parseFotoGrupo(base.rcTerminacaoCabo, src.rcTerminacaoCabo),
    rcPlaquetaIdentificacao: parseFotoGrupo(base.rcPlaquetaIdentificacao, src.rcPlaquetaIdentificacao),
    rcEntradaInterna: parseFotoGrupo(base.rcEntradaInterna, src.rcEntradaInterna),
    rcEntradaExterna: parseFotoGrupo(base.rcEntradaExterna, src.rcEntradaExterna),
    outrasFotosRc: parseOutrasFotos(src.outrasFotosRc),
    redeCliente: parseQuantidadesRede(src.redeCliente),
    eqClienteFachada: parseFotoGrupo(base.eqClienteFachada, src.eqClienteFachada),
    eqClienteAmbiente: parseFotoGrupo(base.eqClienteAmbiente, src.eqClienteAmbiente),
    eqClienteRack: parseFotoGrupo(base.eqClienteRack, src.eqClienteRack),
    eqClienteDgo: parseFotoGrupo(base.eqClienteDgo, src.eqClienteDgo),
    eqClienteEquipamentos: parseFotoGrupo(base.eqClienteEquipamentos, src.eqClienteEquipamentos),
    eqClienteEtiqueta: parseFotoGrupo(base.eqClienteEtiqueta, src.eqClienteEtiqueta),
    eqClienteSgp: parseFotoGrupo(base.eqClienteSgp, src.eqClienteSgp),
    outrasFotosEqCliente: parseOutrasFotos(src.outrasFotosEqCliente),
    relatorioEstacao: src.relatorioEstacao ?? false,
    estacaoEntregaAcesso: src.estacaoEntregaAcesso ?? "",
    eqEstacaoGeral: parseFotoGrupo(base.eqEstacaoGeral, src.eqEstacaoGeral),
    eqEstacaoRack: parseFotoGrupo(base.eqEstacaoRack, src.eqEstacaoRack),
    eqEstacaoEquipamento: parseFotoGrupo(base.eqEstacaoEquipamento, src.eqEstacaoEquipamento),
    eqEstacaoEtiqueta: parseFotoGrupo(base.eqEstacaoEtiqueta, src.eqEstacaoEtiqueta),
    eqEstacaoDgo: parseFotoGrupo(base.eqEstacaoDgo, src.eqEstacaoDgo),
    outrasFotosEqEstacao: parseOutrasFotos(src.outrasFotosEqEstacao),
    testeOptico: parseTesteOptico(src.testeOptico),
    ...parseTestesPotenciaSeparados(src, tipoExecucao),
    testePotencia1550: parseTestePotenciaJanela(src.testePotencia1550),
    testePotencia1330: parseTestePotenciaJanela(src.testePotencia1330),
  };
}

const FOTO_GRUPO_KEYS: RelatorioFotoGrupoKey[] = [
  "posteConexao",
  "caixaEmenda",
  "plaquetaIdentificacao",
  "novoAterramentoPoste",
  "aterramentoTerrometro",
  "posicaoConexaoEstacao",
  "etiquetaIdentificacao",
  "sobraTecnica",
  "rcPosteConexao",
  "rcCaixaEmenda",
  "rcTerminacaoCabo",
  "rcPlaquetaIdentificacao",
  "rcEntradaInterna",
  "rcEntradaExterna",
  "eqClienteFachada",
  "eqClienteAmbiente",
  "eqClienteRack",
  "eqClienteDgo",
  "eqClienteEquipamentos",
  "eqClienteEtiqueta",
  "eqClienteSgp",
  "eqEstacaoGeral",
  "eqEstacaoRack",
  "eqEstacaoEquipamento",
  "eqEstacaoEtiqueta",
  "eqEstacaoDgo",
];

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

function mergeCabo(server: CaboMetragemPayload, local: CaboMetragemPayload): CaboMetragemPayload {
  return {
    ...server,
    tipoCabo: local.tipoCabo || server.tipoCabo,
    metragem: local.metragem || server.metragem,
    fotoInicio: local.fotoInicio ?? server.fotoInicio,
    fotoFim: local.fotoFim ?? server.fotoFim,
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
    fotos: local.fotos,
    obs: local.obs,
    obsAdmin: local.obsAdmin || server.obsAdmin,
  };
}

function mergeTesteOpticoItem(
  server: TesteOpticoItemPayload,
  local: TesteOpticoItemPayload,
): TesteOpticoItemPayload {
  return {
    ...server,
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
  const localDist = String(local?.distancia ?? "");
  const localObs = String(local?.obs ?? "");
  const localObsAdmin = String(local?.obsAdmin ?? "");
  const serverDist = String(server?.distancia ?? "");
  const serverObs = String(server?.obs ?? "");
  const serverObsAdmin = String(server?.obsAdmin ?? "");
  const localVazio = !localDist.trim() && !local?.foto && !localObs.trim() && !localObsAdmin.trim();
  const serverPreenchido = Boolean(
    serverDist.trim() || server?.foto || serverObs.trim() || serverObsAdmin.trim(),
  );
  if (localVazio && serverPreenchido) {
    return server;
  }
  return {
    ...server,
    distancia: localDist,
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
      nm1550: mergeTesteOpticoFaixa(server.cliente.nm1550, local.cliente.nm1550),
      nm1330: mergeTesteOpticoFaixa(server.cliente.nm1330, local.cliente.nm1330),
    },
    estacao: {
      numeroFibra:
        local.estacao.numeroFibra === undefined
          ? server.estacao.numeroFibra
          : local.estacao.numeroFibra,
      nm1550: mergeById(server.estacao.nm1550, local.estacao.nm1550, mergeTesteOpticoItem),
      nm1330: mergeById(server.estacao.nm1330, local.estacao.nm1330, mergeTesteOpticoItem),
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

function mergeQuantidadesRede(
  server: QuantidadesRedePayload | undefined,
  local: QuantidadesRedePayload | undefined,
): QuantidadesRedePayload {
  const fromServer = server ?? emptyQuantidadesRede();
  const fromLocal = local ?? emptyQuantidadesRede();
  return {
    qtdCaixasEmenda:
      fromLocal.qtdCaixasEmenda === undefined
        ? fromServer.qtdCaixasEmenda
        : fromLocal.qtdCaixasEmenda,
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

/**
 * Merge colaborativo de JSONB: arrays de caixinhas/fotos são unidos por id/path
 * (append). Itens remotos não presentes no rascunho local não são apagados,
 * para o auto-save de um técnico não sobrescrever o de outro.
 */
export function mergeRelatorioPayload(
  server: RelatorioPayload,
  local: RelatorioPayload,
): RelatorioPayload {
  const fromServer = parsePayload(server);
  const fromLocal = parsePayload(local);
  const grupos = Object.fromEntries(
    FOTO_GRUPO_KEYS.map((key) => [key, mergeFotoGrupo(fromServer[key], fromLocal[key])]),
  ) as Pick<RelatorioPayload, RelatorioFotoGrupoKey>;

  return {
    ...fromServer,
    ...fromLocal,
    lancamentoRe: fromLocal.lancamentoRe ?? fromServer.lancamentoRe,
    lancamentoRc: fromLocal.lancamentoRc ?? fromServer.lancamentoRc,
    relatorioEstacao: fromLocal.relatorioEstacao ?? fromServer.relatorioEstacao,
    tecnologiaAcesso: fromLocal.tecnologiaAcesso || fromServer.tecnologiaAcesso,
    estacaoEntregaAcesso: fromLocal.estacaoEntregaAcesso || fromServer.estacaoEntregaAcesso,
    metragensCabo: mergeById(fromServer.metragensCabo, fromLocal.metragensCabo, mergeCabo),
    metragensCaboRc: mergeById(fromServer.metragensCaboRc, fromLocal.metragensCaboRc, mergeCabo),
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
    testeOptico: mergeTesteOptico(fromServer.testeOptico, fromLocal.testeOptico),
    testePotenciaEmpresarial: mergeTestePotencia(
      fromServer.testePotenciaEmpresarial,
      fromLocal.testePotenciaEmpresarial,
    ),
    testePotenciaImplantacao: mergeTestePotencia(
      fromServer.testePotenciaImplantacao,
      fromLocal.testePotenciaImplantacao,
    ),
    testePotencia1550: mergeTestePotenciaJanela(
      fromServer.testePotencia1550,
      fromLocal.testePotencia1550,
    ),
    testePotencia1330: mergeTestePotenciaJanela(
      fromServer.testePotencia1330,
      fromLocal.testePotencia1330,
    ),
    ...grupos,
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
  "id, tecnico_id, tecnicos_atribuidos, tecnicos_nomes, os_wf, cliente, endereco, cidade, equipe_empreiteira, responsavel, data_inicio_execucao, tipo_execucao, status, payload, motivo_pendencia, data_pendencia, avisado_at, fechado_at, created_at, updated_at, profiles(nome)";

const SELECT_COLS_PLAIN =
  "id, tecnico_id, tecnicos_atribuidos, tecnicos_nomes, os_wf, cliente, endereco, cidade, equipe_empreiteira, responsavel, data_inicio_execucao, tipo_execucao, status, payload, motivo_pendencia, data_pendencia, avisado_at, fechado_at, created_at, updated_at";

const SELECT_COLS_LEGACY =
  "id, tecnico_id, os_wf, cliente, endereco, cidade, equipe_empreiteira, responsavel, data_inicio_execucao, tipo_execucao, status, payload, motivo_pendencia, data_pendencia, avisado_at, fechado_at, created_at, updated_at, profiles(nome)";

const SELECT_COLS_LEGACY_PLAIN =
  "id, tecnico_id, os_wf, cliente, endereco, cidade, equipe_empreiteira, responsavel, data_inicio_execucao, tipo_execucao, status, payload, motivo_pendencia, data_pendencia, avisado_at, fechado_at, created_at, updated_at";

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

export async function despacharRelatorioTransmissao(input: {
  osWf: string;
  cliente: string;
  endereco: string;
  cidade: string;
  equipeEmpreiteira: string;
  dataInicioExecucao: string;
  tipoExecucao: TipoExecucao;
  tecnicos: { id: string; nome: string }[];
}): Promise<RelatorioTransmissao> {
  const os = input.osWf.trim();
  const cliente = input.cliente.trim();
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
  const insertRow = {
    tecnico_id: tecnicos[0].id,
    tecnicos_atribuidos: tecnicos.map((t) => t.id),
    tecnicos_nomes: tecnicos.map((t) => t.nome),
    os_wf: os,
    cliente: cliente || "",
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

export async function patchRelatorioPayloadAdmin(
  id: string,
  payload: RelatorioPayload,
): Promise<RelatorioTransmissao> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .update({ payload })
    .eq("id", id)
    .select(SELECT_COLS)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .update({ payload })
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
  | "metragensCabo"
  | "outrasFotos"
  | "metragensCaboRc"
  | "outrasFotosRc"
  | "outrasFotosEqCliente"
  | "outrasFotosEqEstacao";

export function appendStoredPhotoToPayload(
  payload: RelatorioPayload,
  categoria: RelatorioFotoCategoria,
  stored: StoredPhoto,
): RelatorioPayload {
  if (categoria === "metragensCabo" || categoria === "metragensCaboRc") {
    const list = (payload[categoria].length
      ? payload[categoria].map((item) => ({ ...item }))
      : [emptyCaboMetragem()]);
    const last = list[list.length - 1];
    if (!last.fotoInicio) last.fotoInicio = stored;
    else if (!last.fotoFim) last.fotoFim = stored;
    else list.push({ ...emptyCaboMetragem(), fotoInicio: stored });
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
  return {
    ...payload,
    [categoria]: { ...grupo, fotos: [...grupo.fotos, stored] },
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
