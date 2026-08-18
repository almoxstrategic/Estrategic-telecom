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
  tecnico_id: string;
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
  const ids = row.tecnicos_atribuidos.length ? row.tecnicos_atribuidos : [row.tecnico_id];
  return ids.includes(userId);
}

export function labelTecnicosAtribuidos(row: RelatorioTransmissao): string {
  const nomes = row.tecnicos_nomes.filter((nome) => nome.trim());
  if (nomes.length) return nomes.join(", ");
  return row.tecnico_nome?.trim() || "—";
}

export function outrosTecnicosNomes(
  row: RelatorioTransmissao,
  userId: string,
  userNome?: string | null,
): string[] {
  const ids = row.tecnicos_atribuidos.length ? row.tecnicos_atribuidos : [row.tecnico_id];
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
  tipo_execucao?: TipoExecucao | null;
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
  if (!Array.isArray(raw)) return [];
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

function parsePayload(raw: unknown): RelatorioPayload {
  const base = emptyRelatorioPayload();
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Partial<RelatorioPayload>;
  return {
    ...base,
    ...src,
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
    ref: local.ref || server.ref,
    foto: local.foto ?? server.foto,
    obs: local.obs || server.obs,
    obsAdmin: local.obsAdmin || server.obsAdmin,
  };
}

function mergeFotoGrupo(server: FotoGrupoPayload, local: FotoGrupoPayload): FotoGrupoPayload {
  return {
    fotos: mergeFotosByPath(server.fotos, local.fotos),
    obs: local.obs || server.obs,
    obsAdmin: local.obsAdmin || server.obsAdmin,
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
  const grupos = Object.fromEntries(
    FOTO_GRUPO_KEYS.map((key) => [key, mergeFotoGrupo(server[key], local[key])]),
  ) as Pick<RelatorioPayload, RelatorioFotoGrupoKey>;

  return {
    ...server,
    ...local,
    lancamentoRe: local.lancamentoRe ?? server.lancamentoRe,
    lancamentoRc: local.lancamentoRc ?? server.lancamentoRc,
    relatorioEstacao: local.relatorioEstacao ?? server.relatorioEstacao,
    tecnologiaAcesso: local.tecnologiaAcesso || server.tecnologiaAcesso,
    estacaoEntregaAcesso: local.estacaoEntregaAcesso || server.estacaoEntregaAcesso,
    metragensCabo: mergeById(server.metragensCabo, local.metragensCabo, mergeCabo),
    metragensCaboRc: mergeById(server.metragensCaboRc, local.metragensCaboRc, mergeCabo),
    outrasFotos: mergeById(server.outrasFotos, local.outrasFotos, mergeOutra),
    outrasFotosRc: mergeById(server.outrasFotosRc, local.outrasFotosRc, mergeOutra),
    outrasFotosEqCliente: mergeById(
      server.outrasFotosEqCliente,
      local.outrasFotosEqCliente,
      mergeOutra,
    ),
    outrasFotosEqEstacao: mergeById(
      server.outrasFotosEqEstacao,
      local.outrasFotosEqEstacao,
      mergeOutra,
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
  tecnico_id: string;
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
  const tecnicos_atribuidos =
    Array.isArray(row.tecnicos_atribuidos) && row.tecnicos_atribuidos.length
      ? row.tecnicos_atribuidos
      : [row.tecnico_id];
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
    payload: parsePayload(row.payload),
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
  tecnicos: { id: string; nome: string }[];
}): Promise<RelatorioTransmissao> {
  const os = input.osWf.trim();
  const cliente = input.cliente.trim();
  const endereco = input.endereco.trim();
  if (!os) throw new Error("Informe o número do contrato (OS).");
  if (!cliente) throw new Error("Informe o cliente.");
  if (!endereco) throw new Error("Informe o endereço.");
  const unique = new Map<string, { id: string; nome: string }>();
  for (const tecnico of input.tecnicos) {
    if (tecnico.id) unique.set(tecnico.id, tecnico);
  }
  const tecnicos = [...unique.values()];
  if (tecnicos.length === 0) {
    throw new Error("Selecione ao menos um técnico de transmissão.");
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
    cliente,
    endereco,
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

export async function patchRelatorioDraft(
  id: string,
  patch: RelatorioDraftPatch,
): Promise<RelatorioTransmissao> {
  const latest = await fetchRelatorioTransmissaoById(id);
  const merged: RelatorioDraftPatch = {
    ...patch,
    cliente: preferFilled(patch.cliente, latest.cliente),
    endereco: preferFilled(patch.endereco, latest.endereco),
    cidade: preferFilled(patch.cidade, latest.cidade),
    equipe_empreiteira: preferFilled(patch.equipe_empreiteira, latest.equipe_empreiteira),
    responsavel: preferFilled(patch.responsavel, latest.responsavel),
    payload: patch.payload
      ? mergeRelatorioPayload(latest.payload, patch.payload)
      : undefined,
  };
  if (patch.data_inicio_execucao === "" || patch.data_inicio_execucao === null) {
    merged.data_inicio_execucao = latest.data_inicio_execucao || null;
  }
  if (patch.tipo_execucao === null && latest.tipo_execucao) {
    merged.tipo_execucao = latest.tipo_execucao;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .update(merged)
    .eq("id", id)
    .neq("status", "fechado")
    .select(SELECT_COLS)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .update(merged)
      .eq("id", id)
      .neq("status", "fechado")
      .select(SELECT_COLS_PLAIN)
      .single();
    if (fallback.error) throw fallback.error;
    return mapRow(fallback.data as DbRow);
  }
  return mapRow(data as DbRow);
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

export function removeFotoGrupoAt(grupo: FotoGrupoPayload, index: number): FotoGrupoPayload {
  if (index < 1) return grupo;
  return { ...grupo, fotos: grupo.fotos.filter((_, i) => i !== index) };
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
